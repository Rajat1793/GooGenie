/**
 * Shared helpers for /api/v1/manager/* handlers.
 */
import { type AuthCtx } from "@googenie/server";
import { getUserById, getUserByClerkId } from "@googenie/db/users";

export async function resolveDbUser(auth: AuthCtx) {
  return (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
}

export function requireManagerRole(role: string): boolean {
  return role === "super_admin" || role === "manager_admin";
}
