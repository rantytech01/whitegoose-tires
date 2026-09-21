import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { numericTransformer } from "../../common/transformers/numeric.transformer";
import { Order } from "./order.entity";

export type PaymentMethod = "mpesa" | "card" | "bank_transfer" | "cod";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "order_id", type: "uuid" })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ type: "varchar", length: 20 })
  method: PaymentMethod;

  @Column("numeric", { precision: 14, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status: PaymentStatus;

  // M-Pesa receipt number, card processor charge id, or bank transfer reference.
  @Column({ name: "provider_ref", type: "varchar", length: 100, nullable: true })
  providerRef: string | null;

  // --- M-Pesa STK push bookkeeping (extension beyond the base schema doc) ---
  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Index({ unique: true, where: '"checkout_request_id" IS NOT NULL' })
  @Column({ name: "checkout_request_id", type: "varchar", length: 100, nullable: true })
  checkoutRequestId: string | null;

  @Column({ name: "merchant_request_id", type: "varchar", length: 100, nullable: true })
  merchantRequestId: string | null;

  @Column({ name: "failure_reason", type: "varchar", length: 255, nullable: true })
  failureReason: string | null;

  // Verbatim provider callback, kept for reconciliation and disputes.
  @Column({ name: "raw_callback", type: "jsonb", nullable: true })
  rawCallback: unknown | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
