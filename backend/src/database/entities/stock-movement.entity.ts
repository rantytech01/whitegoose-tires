import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type StockMovementReason = "purchase" | "sale" | "adjustment" | "transfer" | "return";

// Append-only ledger. Positive changeQty = stock in, negative = stock out.
@Entity("stock_movements")
export class StockMovement {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id: string;

  @Column({ name: "product_id", type: "uuid" })
  productId: string;

  @Column({ name: "branch_id", type: "int" })
  branchId: number;

  @Column({ name: "change_qty", type: "int" })
  changeQty: number;

  @Column({ type: "varchar", length: 30 })
  reason: StockMovementReason;

  // order_id or purchase_order_id
  @Column({ name: "reference_id", type: "uuid", nullable: true })
  referenceId: string | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
