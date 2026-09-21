import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("branches")
export class Branch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 80 })
  name: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  address: string | null;

  @Column({ type: "varchar", length: 60, nullable: true })
  city: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @Column({ name: "is_active", default: true })
  isActive: boolean;
}
