import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Brand } from "./brand.entity";
import { Category } from "./category.entity";
import { TireSpec } from "./tire-spec.entity";
import { ProductImage } from "./product-image.entity";
import { VehicleFitment } from "./vehicle-fitment.entity";
import { numericTransformer } from "../../common/transformers/numeric.transformer";

export type ProductCondition = "new" | "used";

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  sku: string;

  @ManyToOne(() => Category, { nullable: true, eager: true })
  @JoinColumn({ name: "category_id" })
  category: Category | null;

  @Column({ name: "category_id", nullable: true })
  categoryId: number | null;

  @ManyToOne(() => Brand, { nullable: true, eager: true })
  @JoinColumn({ name: "brand_id" })
  brand: Brand | null;

  @Column({ name: "brand_id", nullable: true })
  brandId: number | null;

  @Index()
  @Column()
  name: string;

  @Column()
  condition: ProductCondition;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column("numeric", { precision: 12, scale: 2, transformer: numericTransformer })
  price: number;

  @Column({ name: "discount_pct", type: "numeric", precision: 5, scale: 2, default: 0, transformer: numericTransformer })
  discountPct: number;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @OneToOne(() => TireSpec, (spec) => spec.product, { cascade: true, eager: true })
  tireSpec: TireSpec | null;

  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true, eager: true })
  images: ProductImage[];

  @OneToMany(() => VehicleFitment, (fitment) => fitment.product, { cascade: true })
  fitments: VehicleFitment[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
