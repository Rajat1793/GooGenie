/**
 * User service — all user/hierarchy operations backed by PostgreSQL.
 */
import { eq, and } from "drizzle-orm";
import { db, schema } from "./client.js";
import type { Role } from "../auth/roles.js";

export interface DbUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: Role;
  managerUserId: string | null;
  isActive: boolean;
  clerkUserId: string | null;
  passwordHash: string | null;
}

// ── Upsert Clerk user ──────────────────────────────────────────────────────────
export async function upsertClerkUser(opts: {
  clerkUserId: string;
  tenantId: string;
  email: string;
  displayName: string;
  /** Role chosen by the login tab. Always applied — allows switching role by re-logging in. */
  role?: Role;
}): Promise<DbUser> {
  const chosenRole: Role = opts.role ?? "user";

  // Ensure tenant exists
  await db.insert(schema.tenants)
    .values({ id: opts.tenantId, name: opts.tenantId })
    .onConflictDoNothing();

  const id = `clerk_${opts.clerkUserId}`;

  // Upsert: insert new or update role/displayName/tenantId on re-login.
  // tenantId CAN change if the user re-logs in with a different role tab.
  await db.insert(schema.users).values({
    id,
    tenantId: opts.tenantId,
    email: opts.email,
    displayName: opts.displayName,
    role: chosenRole,
    clerkUserId: opts.clerkUserId,
    isActive: true,
  }).onConflictDoUpdate({
    target: schema.users.id,
    set: {
      role: chosenRole,
      tenantId: opts.tenantId,
      displayName: opts.displayName,
      email: opts.email,
      updatedAt: new Date(),
    },
  });

  // Ensure feature toggles exist for the (possibly updated) tenantId
  const features = ["email_read", "calendar_read", "calendar_write"];
  await db.insert(schema.userFeatureAccess)
    .values(features.map(fk => ({ tenantId: opts.tenantId, userId: id, featureKey: fk, isEnabled: true })))
    .onConflictDoNothing();

  return (await db.query.users.findFirst({ where: eq(schema.users.id, id) })) as DbUser;
}

// ── Set manager ────────────────────────────────────────────────────────────────
export async function setUserManager(userId: string, managerUserId: string): Promise<void> {
  await db.update(schema.users)
    .set({ managerUserId, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

// ── Get user by clerkUserId ────────────────────────────────────────────────────
export async function getUserByClerkId(clerkUserId: string): Promise<DbUser | null> {
  const u = await db.query.users.findFirst({
    where: eq(schema.users.clerkUserId, clerkUserId)
  });
  return u as DbUser | null;
}

// ── Get user by id ─────────────────────────────────────────────────────────────
export async function getUserById(id: string): Promise<DbUser | null> {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  return u as DbUser | null;
}

// ── List managers for tenant ───────────────────────────────────────────────────
export async function listManagers(tenantId: string): Promise<DbUser[]> {
  const rows = await db.select().from(schema.users).where(
    and(
      eq(schema.users.tenantId, tenantId),
      eq(schema.users.role, "manager_admin" as Role),
      eq(schema.users.isActive, true)
    )
  );
  return rows as DbUser[];
}

// ── List users under a manager ─────────────────────────────────────────────────
export async function listDirectReports(managerUserId: string): Promise<DbUser[]> {
  const rows = await db.select().from(schema.users).where(
    eq(schema.users.managerUserId, managerUserId)
  );
  return rows as DbUser[];
}

// ── List all users in tenant ───────────────────────────────────────────────────
export async function listTenantUsersFromDb(tenantId: string): Promise<DbUser[]> {
  const rows = await db.select().from(schema.users).where(
    eq(schema.users.tenantId, tenantId)
  );
  return rows as DbUser[];
}

// ── Get user by email+tenantId ─────────────────────────────────────────────────
export async function getUserByEmail(tenantId: string, email: string): Promise<DbUser | null> {
  const u = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email))
  });
  return u as DbUser | null;
}

// ── Get password hash ──────────────────────────────────────────────────────────
export async function getPasswordHash(userId: string): Promise<string | null> {
  const row = await db.select({ passwordHash: schema.users.passwordHash })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return row[0]?.passwordHash ?? null;
}
