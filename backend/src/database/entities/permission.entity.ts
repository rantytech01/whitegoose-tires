import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// 'products.write' | 'orders.refund' | 'reports.view' | etc.
@Entity("permissions")
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;
}
