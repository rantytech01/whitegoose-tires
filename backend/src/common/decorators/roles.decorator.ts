import { SetMetadata } from "@nestjs/common";

// Usage: @Roles("branch_manager", "super_admin")
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
