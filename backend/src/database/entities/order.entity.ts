import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { numericTransformer } from "../../common/transformers/numeric.transformer";
import { OrderItem } from "./order-item.entity";
import { OrderStatusHistory } from "./order-status-history.entity";
import { Payment } from "./payment.entity";

export type OrderStatus = "pending" | "confirmed" | "packed" | "dispatched" | "delivered" | "cancelled";
export type DeliveryMethod = "delivery" | "pickup";

export interface OrderContact {
  fullName: string;
  email: string | null;
  phone: string;
}

export interface OrderDeliveryAddress {
  label?: string;
  line1: string;
  city: string;
  notes?: string;
}

@Entity("orders")
@Index(["status", "createdAt"])
export class Order {
  // Assigned application-side so stock movements can reference the order id
  // before the row is inserted (same transaction).
  @PrimaryColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ name: "order_number", type: "varchar", length: 20 })
  orderNumber: string;

  // Null for guest checkout.
  @Index()
  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId: string | null;

  @Column({ name: "branch_id", type: "int" })
  branchId: number;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status: OrderStatus;

  @Column({ name: "delivery_method", type: "varchar", length: 10 })
  deliveryMethod: DeliveryMethod;

  @Column("numeric", { precision: 14, scale: 2, transformer: numericTransformer })
  subtotal: number;

  @Column("numeric", { name: "delivery_fee", precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  deliveryFee: number;

  @Column("numeric", { precision: 14, scale: 2, transformer: numericTransformer })
  total: number;

  // Snapshots: an order must stay valid if the customer later edits their
  // profile or deletes a saved address.
  @Column({ type: "jsonb" })
  contact: OrderContact;

  @Column({ name: "delivery_address", type: "jsonb", nullable: true })
  deliveryAddress: OrderDeliveryAddress | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  // Lets clients safely retry POST /orders after a network failure.
  @Column({ name: "idempotency_key", type: "varchar", length: 120, nullable: true, unique: true })
  idempotencyKey: string | null;

  // sha256 of the token returned to guests at checkout; grants them access to
  // their own order without an account.
  @Column({ name: "guest_token_hash", type: "varchar", length: 64, nullable: true })
  guestTokenHash: string | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

  @OneToMany(() => OrderStatusHistory, (h) => h.order)
  history: OrderStatusHistory[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
