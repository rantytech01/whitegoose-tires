import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Branch } from "../../database/entities/branch.entity";
import { Inventory } from "../../database/entities/inventory.entity";
import { Product } from "../../database/entities/product.entity";
import { StockMovement } from "../../database/entities/stock-movement.entity";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { QueryInventoryDto } from "./dto/query-inventory.dto";

export interface StockLine {
  productId: string;
  quantity: number;
}

// Stock levels per branch + the append-only movements ledger.
// Reservation/release are called by OrdersService inside its own transaction,
// so they take the caller's EntityManager instead of opening a new one.
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory) private inventory: Repository<Inventory>,
    private dataSource: DataSource,
  ) {}

  /** Total sellable units per product across active branches. */
  async availableByProduct(productIds: string[]): Promise<Map<string, number>> {
    if (!productIds.length) return new Map();
    const rows = await this.inventory
      .createQueryBuilder("inv")
      .innerJoin(Branch, "b", "b.id = inv.branchId AND b.isActive = true")
      .select("inv.productId", "productId")
      .addSelect("SUM(inv.quantity)", "available")
      .where("inv.productId IN (:...ids)", { ids: productIds })
      .groupBy("inv.productId")
      .getRawMany<{ productId: string; available: string }>();
    return new Map(rows.map((r) => [r.productId, Number(r.available)]));
  }

  /**
   * Decrements stock for every line from ONE branch (orders are not split
   * across branches) and writes the ledger entries. Returns the branch used.
   *
   * Oversell safety comes from the conditional UPDATE (`quantity >= :q`) —
   * it is atomic under concurrency — plus the CHECK constraint in the schema.
   * Lines are processed in productId order so two concurrent orders touching
   * the same products cannot deadlock each other.
   */
  async reserve(
    manager: EntityManager,
    lines: StockLine[],
    opts: { branchId?: number; orderId: string; userId: string | null },
  ): Promise<number> {
    const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
    const branchId = await this.chooseBranch(manager, sorted, opts.branchId);

    for (const line of sorted) {
      const res = await manager
        .createQueryBuilder()
        .update(Inventory)
        .set({ quantity: () => `quantity - ${Math.trunc(line.quantity)}` })
        .where("product_id = :productId AND branch_id = :branchId AND quantity >= :qty", {
          productId: line.productId,
          branchId,
          qty: line.quantity,
        })
        .execute();
      if (!res.affected) {
        // Lost a race with another order between the availability check and the update.
        throw new ConflictException({
          code: "STOCK_CHANGED",
          message: "Stock changed while placing your order. Please review your cart and try again.",
        });
      }
    }

    await manager.insert(
      StockMovement,
      sorted.map((l) => ({
        productId: l.productId,
        branchId,
        changeQty: -l.quantity,
        reason: "sale" as const,
        referenceId: opts.orderId,
        createdBy: opts.userId,
      })),
    );
    return branchId;
  }

  /** Puts stock back (order cancelled/expired). */
  async release(
    manager: EntityManager,
    branchId: number,
    lines: StockLine[],
    opts: { orderId: string; userId: string | null },
  ): Promise<void> {
    const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const line of sorted) {
      await manager.query(
        `INSERT INTO inventory (product_id, branch_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (product_id, branch_id)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()`,
        [line.productId, branchId, line.quantity],
      );
    }
    await manager.insert(
      StockMovement,
      sorted.map((l) => ({
        productId: l.productId,
        branchId,
        changeQty: l.quantity,
        reason: "return" as const,
        referenceId: opts.orderId,
        createdBy: opts.userId,
      })),
    );
  }

  private async chooseBranch(manager: EntityManager, lines: StockLine[], requested?: number): Promise<number> {
    if (requested !== undefined) {
      const branch = await manager.findOne(Branch, { where: { id: requested, isActive: true } });
      if (!branch) throw new BadRequestException("Selected branch is not available");
    }

    const rows = await manager
      .getRepository(Inventory)
      .createQueryBuilder("inv")
      .innerJoin(Branch, "b", "b.id = inv.branchId AND b.isActive = true")
      .where("inv.productId IN (:...ids)", { ids: lines.map((l) => l.productId) })
      .andWhere(requested !== undefined ? "inv.branchId = :requested" : "1=1", { requested })
      .getMany();

    const byBranch = new Map<number, Map<string, number>>();
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (!byBranch.has(r.branchId)) byBranch.set(r.branchId, new Map());
      byBranch.get(r.branchId)!.set(r.productId, r.quantity);
      totals.set(r.productId, (totals.get(r.productId) ?? 0) + r.quantity);
    }

    const candidates = [...byBranch.entries()]
      .filter(([, stock]) => lines.every((l) => (stock.get(l.productId) ?? 0) >= l.quantity))
      .map(([id]) => id)
      .sort((a, b) => a - b);
    if (candidates.length) return candidates[0];

    const short = lines
      .filter((l) => (totals.get(l.productId) ?? 0) < l.quantity)
      .map((l) => ({ productId: l.productId, requested: l.quantity, available: totals.get(l.productId) ?? 0 }));
    if (short.length) {
      throw new ConflictException({ code: "INSUFFICIENT_STOCK", message: "Some items are out of stock", items: short });
    }
    throw new ConflictException({
      code: "SPLIT_ACROSS_BRANCHES",
      message: "These items are stocked at different branches. Please order them separately or contact us.",
    });
  }

  // ---- Admin ------------------------------------------------------------

  async list(query: QueryInventoryDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);

    const qb = this.inventory
      .createQueryBuilder("inv")
      .innerJoinAndSelect("inv.product", "p")
      .innerJoinAndSelect("inv.branch", "b");
    if (query.branchId) qb.andWhere("inv.branchId = :branchId", { branchId: Number(query.branchId) });
    if (query.lowStock) qb.andWhere("inv.quantity <= inv.reorderLevel");
    qb.orderBy("p.name", "ASC")
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        sku: r.product.sku,
        productName: r.product.name,
        branchId: r.branchId,
        branchName: r.branch.name,
        quantity: r.quantity,
        reorderLevel: r.reorderLevel,
        lowStock: r.quantity <= r.reorderLevel,
      })),
      meta: { page, limit, total },
    };
  }

  /** Manual stock in/out. Always writes the ledger; refuses to go negative. */
  async adjust(dto: AdjustStockDto, userId: string) {
    return this.dataSource.transaction(async (m) => {
      if (!(await m.exists(Product, { where: { id: dto.productId } }))) throw new NotFoundException("Product not found");
      if (!(await m.exists(Branch, { where: { id: dto.branchId } }))) throw new NotFoundException("Branch not found");

      let quantity: number;
      try {
        const rows: { quantity: number }[] = await m.query(
          `INSERT INTO inventory (product_id, branch_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (product_id, branch_id)
           DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()
           RETURNING quantity`,
          [dto.productId, dto.branchId, dto.changeQty],
        );
        quantity = rows[0].quantity;
      } catch (err: any) {
        if (err?.code === "23514") throw new ConflictException("Adjustment would make stock negative");
        throw err;
      }

      await m.insert(StockMovement, {
        productId: dto.productId,
        branchId: dto.branchId,
        changeQty: dto.changeQty,
        reason: dto.reason,
        referenceId: null,
        createdBy: userId,
      });
      return { productId: dto.productId, branchId: dto.branchId, quantity };
    });
  }
}
