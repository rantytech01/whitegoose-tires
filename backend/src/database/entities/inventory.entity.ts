import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import { Branch } from "./branch.entity";
import { Product } from "./product.entity";

// Cached stock level per (product, branch). The stock_movements ledger is the
// source of truth; every change to `quantity` must write a matching movement.
@Entity("inventory")
@Unique(["productId", "branchId"])
export class Inventory {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id: string;

  @Column({ name: "product_id", type: "uuid" })
  productId: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "branch_id", type: "int" })
  branchId: number;

  @ManyToOne(() => Branch, { onDelete: "CASCADE" })
  @JoinColumn({ name: "branch_id" })
  branch: Branch;

  @Column({ type: "int", default: 0 })
  quantity: number;

  @Column({ name: "reorder_level", type: "int", default: 5 })
  reorderLevel: number;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
