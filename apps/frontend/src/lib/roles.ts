/**
 * Role constants shared between AuthContext, App, and login flow.
 * Previously the union `"super_admin" | "manager_admin" | "user"` was duplicated
 * in 4+ places, and `as Role` casts were used on localStorage reads.
 */
export const ROLES = ["super_admin", "manager_admin", "user"] as const;
export type Role = (typeof ROLES)[number];

/** Type guard for safely narrowing unknown values (e.g. localStorage reads). */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
