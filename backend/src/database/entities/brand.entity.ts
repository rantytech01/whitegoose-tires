import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("brands")
export class Brand {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ name: "logo_url", type: "varchar", length: 255, nullable: true })
  logoUrl: string | null;
}
