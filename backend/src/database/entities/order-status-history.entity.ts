import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Order } from "./order.entity";

// Timeline shown to customers ("Order Tracking") and audit trail for staff
// actions on orders.
@Entity("order_status_history")
export class OrderStatusHistory {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id: string;

  @Index()
  @Column({ name: "order_id", type: "uuid" })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.history, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ name: "from_status", type: "varchar", length: 20, nullable: true })
  fromStatus: string | null;

  @Column({ name: "to_status", type: "varchar", length: 20 })
  toStatus: string;

  @Column({ name: "changed_by", type: "uuid", nullable: true })
  changedBy: string | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
