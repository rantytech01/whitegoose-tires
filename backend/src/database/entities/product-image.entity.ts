import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";

@Entity("product_images")
export class ProductImage {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "product_id" })
  productId: string;

  @Column()
  url: string;

  @Column({ name: "sort_order", type: "smallint", default: 0 })
  sortOrder: number;
}
