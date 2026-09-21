import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Order, OrderContact, OrderStatus } from "../../database/entities/order.entity";
import { OrderItem } from "../../database/entities/order-item.entity";
import { OrderStatusHistory } from "../../database/entities/order-status-history.entity";
import { Payment } from "../../database/entities/payment.entity";
import { OrderEvents, OrderStatusChange } from "../../common/events";
import { effectiveUnitPrice, round2, roundKes } from "../../common/utils/money.util";
import { normalizeKenyanMsisdn } from "../../common/utils/phone.util";
import { CartActor, CartService } from "../cart/cart.service";
import { InventoryService } from "../inventory/inventory.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { PaginationDto, QueryOrdersDto } from "./dto/order-queries.dto";
import { canTransition } from "./order-status";

export const STAFF_ROLES = ["super_admin", "branch_manager", "sales_staff"];

export interface OrderActor {
  userId: string | null;
  roles: string[];
  /** Guest proof-of-ownership, sent as `X-Order-Token`. */
  orderToken?: string;
}

const UNIQUE_VIOLATION = "23505";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private orders: Repository<Order>,
    private dataSource: DataSource,
    private inventory: InventoryService,
    private cart: CartService,
    private events: EventEmitter2,
    private config: ConfigService,
  ) {}

  // ---- Checkout ------------------------------------------------------------

  async create(actor: CartActor, dto: CreateOrderDto, idempotencyKey?: string) {
    const scopedKey = idempotencyKey ? `${actor.userId ?? `s:${actor.sessionId}`}:${idempotencyKey}` : null;
    if (scopedKey) {
      const existing = await this.findByIdempotencyKey(scopedKey);
      if (existing) return this.replay(existing);
    }

    const phone = normalizeKenyanMsisdn(dto.contact.phone);
    if (!phone) throw new BadRequestException("Enter a valid Kenyan mobile number, e.g. 0712 345 678");
    if (dto.deliveryMethod === "pickup" && !dto.branchId) throw new BadRequestException("Choose a branch for pickup");
    if (dto.deliveryMethod === "delivery" && !dto.deliveryAddress) throw new BadRequestException("Delivery address is required");

    const contact: OrderContact = { fullName: dto.contact.fullName.trim(), email: dto.contact.email ?? null, phone };

    const { cartId, items } = await this.cart.loadCheckoutItems(actor);
    if (!items.length) throw new BadRequestException("Your cart is empty");

    const unavailable = items.filter((i) => !i.product.isActive);
    if (unavailable.length) {
      throw new ConflictException({
        code: "PRODUCT_UNAVAILABLE",
        message: "Some items are no longer available",
        items: unavailable.map((i) => ({ productId: i.productId, name: i.product.name })),
      });
    }

    const lines = items.map((i) => ({
      productId: i.productId,
      name: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: effectiveUnitPrice(i.product.price, i.product.discountPct),
    }));
    const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
    const deliveryFee = dto.deliveryMethod === "delivery" ? Number(this.config.get("DELIVERY_FEE_KES") ?? 0) : 0;
    const total = roundKes(subtotal + deliveryFee);

    const orderId = randomUUID();
    const guestToken = actor.userId ? null : randomBytes(32).toString("hex");

    try {
      await this.dataSource.transaction(async (m) => {
        // Throws 409 (with details) if the stock isn't there; rolls everything back.
        const branchId = await this.inventory.reserve(
          m,
          lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          { branchId: dto.branchId, orderId, userId: actor.userId },
        );
        const [{ n }] = await m.query(`SELECT nextval('order_number_seq') AS n`);

        await m.insert(Order, {
          id: orderId,
          orderNumber: `WG${n}`,
          customerId: actor.userId,
          branchId,
          status: "pending",
          deliveryMethod: dto.deliveryMethod,
          subtotal,
          deliveryFee,
          total,
          contact,
          deliveryAddress: dto.deliveryMethod === "delivery" ? dto.deliveryAddress! : null,
          notes: dto.notes ?? null,
          idempotencyKey: scopedKey,
          guestTokenHash: guestToken ? sha256(guestToken) : null,
        });
        await m.insert(
          OrderItem,
          lines.map((l) => ({
            orderId,
            productId: l.productId,
            productName: l.name,
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        );
        await m.insert(OrderStatusHistory, {
          orderId,
          fromStatus: null,
          toStatus: "pending",
          changedBy: actor.userId,
          note: "Order placed",
        });
        await this.cart.removeCheckedOut(m, cartId);
      });
    } catch (err: any) {
      // Same idempotency key arrived twice concurrently; the loser returns the winner's order.
      if (err?.code === UNIQUE_VIOLATION && scopedKey) {
        const existing = await this.findByIdempotencyKey(scopedKey);
        if (existing) return this.replay(existing);
      }
      throw err;
    }

    const order = await this.loadDetailed(orderId);
    this.events.emit(OrderEvents.Created, {
      orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      branchId: order.branchId,
      total: order.total,
    });
    return { ...this.toView(order, false), guestToken };
  }

  // ---- Reads -----------------------------------------------------------------

  /** Loads an order the actor is allowed to see; anything else is a 404 (no existence leak). */
  async getForActor(id: string, actor: OrderActor): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true, payments: true, history: true },
    });
    if (!order || !this.canAccess(order, actor)) throw new NotFoundException("Order not found");
    return order;
  }

  async findOneView(id: string, actor: OrderActor) {
    const order = await this.getForActor(id, actor);
    return this.toView(order, this.isStaff(actor));
  }

  async listMine(userId: string, query: PaginationDto) {
    const { page, limit } = this.paging(query);
    const [rows, total] = await this.orders.findAndCount({
      where: { customerId: userId },
      relations: { items: true },
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        createdAt: o.createdAt,
      })),
      meta: { page, limit, total },
    };
  }

  /** Public status lookup for guests who lost their order token: order number + phone. */
  async track(orderNumber: string, phone: string) {
    const normalized = normalizeKenyanMsisdn(phone);
    const order = normalized
      ? await this.orders.findOne({
          where: { orderNumber: orderNumber.trim().toUpperCase() },
          relations: { history: true },
        })
      : null;
    // Same error for "no such order" and "wrong phone" so this can't be used to probe order numbers.
    if (!order || order.contact.phone !== normalized) throw new NotFoundException("Order not found");
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryMethod: order.deliveryMethod,
      updatedAt: order.updatedAt,
      timeline: [...order.history]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((h) => ({ status: h.toStatus, at: h.createdAt })),
    };
  }

  async listAll(query: QueryOrdersDto) {
    const { page, limit } = this.paging(query);
    const qb = this.orders
      .createQueryBuilder("o")
      .leftJoinAndSelect("o.payments", "p")
      .orderBy("o.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status) qb.andWhere("o.status = :status", { status: query.status });
    if (query.branchId) qb.andWhere("o.branchId = :branchId", { branchId: Number(query.branchId) });
    if (query.from) qb.andWhere("o.createdAt >= :from", { from: query.from });
    if (query.to) qb.andWhere("o.createdAt <= :to", { to: query.to });
    if (query.q) {
      qb.andWhere("(o.orderNumber ILIKE :prefix OR o.contact ->> 'phone' LIKE :phone)", {
        prefix: `${query.q}%`,
        phone: `%${query.q.replace(/\D/g, "") || "no-match"}%`,
      });
    }
    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        branchId: o.branchId,
        deliveryMethod: o.deliveryMethod,
        total: o.total,
        contact: o.contact,
        paid: o.payments.some((p) => p.status === "completed"),
        createdAt: o.createdAt,
      })),
      meta: { page, limit, total },
    };
  }

  // ---- State changes ------------------------------------------------------------

  /**
   * Moves an order along its lifecycle inside the caller's transaction.
   * Cancelling puts the stock back. Returns the change so the caller can
   * `publish()` it AFTER its transaction commits.
   */
  async transition(
    m: EntityManager,
    orderId: string,
    to: OrderStatus,
    opts: { actorId: string | null; note?: string },
  ): Promise<OrderStatusChange> {
    const order = await m.findOne(Order, { where: { id: orderId }, lock: { mode: "pessimistic_write" } });
    if (!order) throw new NotFoundException("Order not found");
    if (!canTransition(order.status, to)) {
      throw new ConflictException(`Cannot move an order from ${order.status} to ${to}`);
    }

    if (to === "cancelled") {
      const items = await m.find(OrderItem, { where: { orderId } });
      await this.inventory.release(
        m,
        order.branchId,
        items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        { orderId, userId: opts.actorId },
      );
    }

    await m.update(Order, { id: orderId }, { status: to });
    await m.insert(OrderStatusHistory, {
      orderId,
      fromStatus: order.status,
      toStatus: to,
      changedBy: opts.actorId,
      note: opts.note ?? null,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      branchId: order.branchId,
      from: order.status,
      to,
      at: new Date(),
    };
  }

  /**
   * Called by payments once money is confirmed. Idempotent: only a pending
   * order is advanced. `orphaned` = the money arrived after the order was
   * cancelled/expired and needs a human.
   */
  async confirmAfterPayment(
    m: EntityManager,
    orderId: string,
    note: string,
    actorId: string | null = null,
  ): Promise<{ change: OrderStatusChange | null; orphaned: boolean }> {
    const order = await m.findOne(Order, { where: { id: orderId }, lock: { mode: "pessimistic_write" } });
    if (!order) return { change: null, orphaned: false };
    if (order.status === "pending") {
      return { change: await this.transition(m, orderId, "confirmed", { actorId, note }), orphaned: false };
    }
    return { change: null, orphaned: order.status === "cancelled" };
  }

  publish(change: OrderStatusChange | null) {
    if (change) this.events.emit(OrderEvents.StatusChanged, change);
  }

  async adminUpdateStatus(orderId: string, to: OrderStatus, note: string | undefined, actorId: string) {
    const change = await this.dataSource.transaction((m) => this.transition(m, orderId, to, { actorId, note }));
    this.publish(change);
    const order = await this.loadDetailed(orderId);
    return {
      ...this.toView(order, true),
      // Cancelling an order that was already paid does not move money; finance must refund manually for now.
      refundRequired: to === "cancelled" && order.payments.some((p) => p.status === "completed"),
    };
  }

  // ---- internals ----------------------------------------------------------------------

  isStaff(actor: OrderActor) {
    return actor.roles?.some((r) => STAFF_ROLES.includes(r)) ?? false;
  }

  private canAccess(order: Order, actor: OrderActor): boolean {
    if (this.isStaff(actor)) return true;
    if (order.customerId) return actor.userId === order.customerId;
    return !!actor.orderToken && !!order.guestTokenHash && safeEqualHex(sha256(actor.orderToken), order.guestTokenHash);
  }

  private paging(q: PaginationDto) {
    return {
      page: Math.max(Number(q.page ?? 1), 1),
      limit: Math.min(Math.max(Number(q.limit ?? 20), 1), 100),
    };
  }

  private findByIdempotencyKey(key: string) {
    return this.orders.findOne({
      where: { idempotencyKey: key },
      relations: { items: true, payments: true, history: true },
    });
  }

  // Replaying a guest checkout: only the hash is stored, so issue a fresh token
  // (the old one, which the client never received, stops working).
  private async replay(order: Order) {
    let guestToken: string | null = null;
    if (!order.customerId) {
      guestToken = randomBytes(32).toString("hex");
      await this.orders.update({ id: order.id }, { guestTokenHash: sha256(guestToken) });
    }
    return { ...this.toView(order, false), guestToken };
  }

  private loadDetailed(id: string) {
    return this.orders.findOneOrFail({ where: { id }, relations: { items: true, payments: true, history: true } });
  }

  toView(order: Order, staff: boolean) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryMethod: order.deliveryMethod,
      branchId: order.branchId,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      contact: order.contact,
      deliveryAddress: order.deliveryAddress,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((i) => ({
        productId: i.productId,
        name: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: round2(i.unitPrice * i.quantity),
      })),
      payments: [...(order.payments ?? [])]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          status: p.status,
          providerRef: p.providerRef,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
        })),
      // Customers see the timeline; staff also see internal notes and who acted.
      history: [...(order.history ?? [])]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((h) => ({
          status: h.toStatus,
          at: h.createdAt,
          ...(staff ? { note: h.note, changedBy: h.changedBy } : {}),
        })),
    };
  }
}
