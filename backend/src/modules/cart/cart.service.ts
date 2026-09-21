import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { Cart } from "../../database/entities/cart.entity";
import { CartItem } from "../../database/entities/cart-item.entity";
import { Product } from "../../database/entities/product.entity";
import { InventoryService } from "../inventory/inventory.service";
import { effectiveUnitPrice, round2 } from "../../common/utils/money.util";

export interface CartActor {
  userId: string | null;
  sessionId: string;
}

const UNIQUE_VIOLATION = "23505";

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private carts: Repository<Cart>,
    @InjectRepository(CartItem) private items: Repository<CartItem>,
    @InjectRepository(Product) private products: Repository<Product>,
    private inventory: InventoryService,
    private dataSource: DataSource,
  ) {}

  async getCart(actor: CartActor) {
    const cart = await this.resolveCart(actor);
    return this.buildView(cart.id, actor.sessionId);
  }

  async addItem(actor: CartActor, productId: string, quantity: number) {
    const cart = await this.resolveCart(actor);
    const product = await this.products.findOne({ where: { id: productId, isActive: true }, loadEagerRelations: false });
    if (!product) throw new NotFoundException("Product not found");

    const existing = await this.items.findOne({ where: { cartId: cart.id, productId } });
    const newQty = (existing?.quantity ?? 0) + quantity;
    await this.assertInStock(productId, newQty);

    if (existing) {
      existing.quantity = newQty;
      existing.savedForLater = false; // re-adding a saved item moves it back to the active cart
      await this.items.save(existing);
    } else {
      await this.items.insert({ cartId: cart.id, productId, quantity });
    }
    await this.touch(cart.id);
    return this.buildView(cart.id, actor.sessionId);
  }

  async updateQuantity(actor: CartActor, productId: string, quantity: number) {
    const cart = await this.resolveCart(actor);
    const item = await this.requireItem(cart.id, productId);
    await this.assertInStock(productId, quantity);
    item.quantity = quantity;
    await this.items.save(item);
    await this.touch(cart.id);
    return this.buildView(cart.id, actor.sessionId);
  }

  async removeItem(actor: CartActor, productId: string) {
    const cart = await this.resolveCart(actor);
    await this.items.delete({ cartId: cart.id, productId });
    await this.touch(cart.id);
    return this.buildView(cart.id, actor.sessionId);
  }

  async setSavedForLater(actor: CartActor, productId: string, saved: boolean) {
    const cart = await this.resolveCart(actor);
    const item = await this.requireItem(cart.id, productId);
    item.savedForLater = saved;
    await this.items.save(item);
    await this.touch(cart.id);
    return this.buildView(cart.id, actor.sessionId);
  }

  // ---- used by checkout ---------------------------------------------------

  /** Cart lines that will be ordered (saved-for-later items excluded). Also merges a guest cart. */
  async loadCheckoutItems(actor: CartActor): Promise<{ cartId: string; items: CartItem[] }> {
    const cart = await this.resolveCart(actor);
    const items = await this.items.find({
      where: { cartId: cart.id, savedForLater: false },
      relations: { product: true },
      order: { addedAt: "ASC" },
    });
    return { cartId: cart.id, items };
  }

  /** Called inside the order transaction so the cart empties atomically with order creation. */
  async removeCheckedOut(manager: EntityManager, cartId: string) {
    await manager.delete(CartItem, { cartId, savedForLater: false });
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Finds (or creates) the cart for this actor. For signed-in customers it
   * also folds any guest cart from the same browser session into their own —
   * that is how "guest carts merge on login" happens without a dedicated call.
   */
  private async resolveCart(actor: CartActor): Promise<Cart> {
    if (!actor.userId) {
      return this.getOrCreate(this.carts.manager, { customerId: null, sessionId: actor.sessionId });
    }

    return this.dataSource.transaction(async (m) => {
      const own = await this.getOrCreate(m, { customerId: actor.userId!, sessionId: null });
      const guest = await m.findOne(Cart, { where: { sessionId: actor.sessionId, customerId: IsNull() } });
      if (guest && guest.id !== own.id) {
        await m.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, saved_for_later)
           SELECT $1, product_id, quantity, saved_for_later FROM cart_items WHERE cart_id = $2
           ON CONFLICT (cart_id, product_id)
           DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 50)`,
          [own.id, guest.id],
        );
        await m.delete(Cart, { id: guest.id }); // cart_items cascade
      }
      return own;
    });
  }

  private async getOrCreate(
    manager: EntityManager,
    owner: { customerId: string | null; sessionId: string | null },
  ): Promise<Cart> {
    const where = owner.customerId
      ? { customerId: owner.customerId }
      : { sessionId: owner.sessionId as string, customerId: IsNull() };
    const found = await manager.findOne(Cart, { where });
    if (found) return found;
    try {
      return await manager.save(manager.create(Cart, owner));
    } catch (err: any) {
      // Two parallel first requests: the unique index makes the loser retry the read.
      if (err?.code === UNIQUE_VIOLATION) return (await manager.findOne(Cart, { where }))!;
      throw err;
    }
  }

  private async requireItem(cartId: string, productId: string) {
    const item = await this.items.findOne({ where: { cartId, productId } });
    if (!item) throw new NotFoundException("Item is not in your cart");
    return item;
  }

  private async assertInStock(productId: string, quantity: number) {
    const available = (await this.inventory.availableByProduct([productId])).get(productId) ?? 0;
    if (quantity > available) {
      throw new ConflictException({
        code: "INSUFFICIENT_STOCK",
        message: available > 0 ? `Only ${available} in stock` : "Out of stock",
        items: [{ productId, requested: quantity, available }],
      });
    }
  }

  private touch(cartId: string) {
    return this.carts.update({ id: cartId }, { updatedAt: new Date() });
  }

  private async buildView(cartId: string, sessionId: string) {
    const rows = await this.items.find({
      where: { cartId },
      relations: { product: true },
      order: { addedAt: "ASC" },
    });
    const stock = await this.inventory.availableByProduct(rows.map((r) => r.productId));

    const lines = rows.map((r) => {
      const p = r.product;
      const unitPrice = effectiveUnitPrice(p.price, p.discountPct);
      const available = stock.get(r.productId) ?? 0;
      const spec = p.tireSpec;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand?.name ?? null,
        condition: p.condition,
        size: spec ? `${spec.widthMm}/${spec.aspectRatio}R${spec.rimDiameterIn}` : null,
        image: [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null,
        listPrice: p.price,
        discountPct: p.discountPct,
        unitPrice,
        quantity: r.quantity,
        lineTotal: round2(unitPrice * r.quantity),
        availableStock: available,
        purchasable: p.isActive && r.quantity <= available,
        savedForLater: r.savedForLater,
      };
    });

    const active = lines.filter((l) => !l.savedForLater);
    return {
      sessionId,
      items: active,
      savedForLater: lines.filter((l) => l.savedForLater),
      itemCount: active.reduce((n, l) => n + l.quantity, 0),
      subtotal: round2(active.filter((l) => l.purchasable).reduce((s, l) => s + l.lineTotal, 0)),
      hasIssues: active.some((l) => !l.purchasable),
    };
  }
}
