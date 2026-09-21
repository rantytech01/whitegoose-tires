import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Cart } from "./cart.entity";
import { Product } from "./product.entity";

@Entity("cart_items")
export class CartItem {
  @PrimaryColumn({ name: "cart_id", type: "uuid" })
  cartId: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "cart_id" })
  cart: Cart;

  @PrimaryColumn({ name: "product_id", type: "uuid" })
  productId: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ type: "int" })
  quantity: number;

  // "Save for later": kept in the cart but excluded from totals and checkout.
  @Column({ name: "saved_for_later", default: false })
  savedForLater: boolean;

  @CreateDateColumn({ name: "added_at", type: "timestamptz" })
  addedAt: Date;
}
