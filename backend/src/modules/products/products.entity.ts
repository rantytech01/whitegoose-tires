import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from "typeorm";

// Base product row shared by tires, rims, and accessories.
// See docs/database-schema.sql for the full DDL including tire_specs,
// product_images, and vehicle_fitments.
@Entity("products")
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  name: string;

  @Column()
  condition: "new" | "used";

  @Column("numeric", { precision: 12, scale: 2 })
  price: number;

  @Column({ default: true })
  isActive: boolean;
}
