import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Permission } from "./permission.entity";

// 'super_admin' | 'branch_manager' | 'sales_staff' | 'inventory_clerk' | 'customer'
@Entity("roles")
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: "role_permissions",
    joinColumn: { name: "role_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "permission_id", referencedColumnName: "id" },
  })
  permissions: Permission[];
}
