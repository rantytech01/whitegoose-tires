import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Role } from "./role.entity";

export type UserType = "customer" | "staff" | "admin";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: "varchar", length: 20, unique: true, nullable: true })
  phone: string | null;

  // Null for OAuth-only accounts (e.g. Google sign-in with no password set).
  @Column({ name: "password_hash", type: "varchar", length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ name: "full_name" })
  fullName: string;

  @Column({ name: "user_type", default: "customer" })
  userType: UserType;

  @Column({ name: "mfa_enabled", default: false })
  mfaEnabled: boolean;

  @Column({ name: "mfa_secret", type: "varchar", length: 255, nullable: true })
  mfaSecret: string | null;

  @Column({ name: "email_verified_at", type: "timestamptz", nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  // OTP handling — extension beyond the base schema doc (kept on the row
  // rather than a separate table since it's short-lived, single-purpose data).
  @Column({ name: "otp_code_hash", type: "varchar", length: 255, nullable: true })
  otpCodeHash: string | null;

  @Column({ name: "otp_expires_at", type: "timestamptz", nullable: true })
  otpExpiresAt: Date | null;

  @Column({ name: "google_id", type: "varchar", length: 100, unique: true, nullable: true })
  googleId: string | null;

  @ManyToMany(() => Role, { eager: true })
  @JoinTable({
    name: "user_roles",
    joinColumn: { name: "user_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "role_id", referencedColumnName: "id" },
  })
  roles: Role[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
