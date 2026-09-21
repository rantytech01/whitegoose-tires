import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  // 'Tires' | 'Rims' | 'Accessories'
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;
}
