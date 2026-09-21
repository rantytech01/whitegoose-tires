import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { CartItem } from "./cart-item.entity";

// One active cart per signed-in customer, one per guest session. Guest carts
// are merged into the customer's cart on the first authenticated request.
@Entity("carts")
export class Cart {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId: string | null;

  @Column({ name: "session_id", type: "varchar", length: 100, nullable: true })
  sessionId: string | null;

  @OneToMany(() => CartItem, (item) => item.cart)
  items: CartItem[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
