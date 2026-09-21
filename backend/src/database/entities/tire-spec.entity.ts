import { Column, Entity, Index, JoinColumn, OneToOne, PrimaryColumn } from "typeorm";
import { Product } from "./product.entity";

// Split from `products` so rims/accessories don't carry irrelevant columns.
@Entity("tire_specs")
@Index(["widthMm", "aspectRatio", "rimDiameterIn"])
export class TireSpec {
  @PrimaryColumn({ name: "product_id" })
  productId: string;

  @OneToOne(() => Product, (product) => product.tireSpec, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product: Product;

  @Column({ name: "width_mm", type: "smallint" })
  widthMm: number;

  @Column({ name: "aspect_ratio", type: "smallint" })
  aspectRatio: number;

  @Column({ name: "rim_diameter_in", type: "smallint" })
  rimDiameterIn: number;

  @Column({ name: "load_index", type: "smallint", nullable: true })
  loadIndex: number | null;

  @Column({ name: "speed_rating", nullable: true })
  speedRating: string | null;

  // Used tires only, e.g. 70 (%)
  @Column({ name: "tread_condition_pct", type: "smallint", nullable: true })
  treadConditionPct: number | null;

  // 'all_season' | 'summer' | 'winter'
  @Column({ nullable: true })
  season: string | null;
}
