import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";

// Backs "search by vehicle make/model/year" lookups.
@Entity("vehicle_fitments")
@Index(["make", "model"])
export class VehicleFitment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Product, (product) => product.fitments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "product_id" })
  productId: string;

  @Column({ nullable: true })
  make: string | null;

  @Column({ nullable: true })
  model: string | null;

  @Column({ name: "year_from", type: "smallint", nullable: true })
  yearFrom: number | null;

  @Column({ name: "year_to", type: "smallint", nullable: true })
  yearTo: number | null;
}
