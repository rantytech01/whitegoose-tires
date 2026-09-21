import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers/numeric.transformer";
import { Order } from "./order.entity";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id: string;

  @Index()
  @Column({ name: "order_id", type: "uuid" })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ name: "product_id", type: "uuid" })
  productId: string;

  // Name/SKU snapshots so invoices survive later catalog edits.
  @Column({ name: "product_name", type: "varchar", length: 150 })
  productName: string;

  @Column({ type: "varchar", length: 40 })
  sku: string;

  @Column({ type: "int" })
  quantity: number;

  // Price snapshot at time of sale, after product discount.
  @Column("numeric", { name: "unit_price", precision: 12, scale: 2, transformer: numericTransformer })
  unitPrice: number;
}
