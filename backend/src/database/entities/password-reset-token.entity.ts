import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user.entity";

// Extension beyond the base schema doc — mirrors refresh_tokens so
// forgot/reset-password has the same "hashed, single-use, expiring" shape.
@Entity("password_reset_tokens")
export class PasswordResetToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ name: "token_hash" })
  tokenHash: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
