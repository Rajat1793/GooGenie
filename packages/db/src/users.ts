/**
 * User service — all user/hierarchy operations backed by PostgreSQL.
 */
import { eq, and } from "drizzle-orm";
import { db, schema } from "./client";
// Role is duplicated here (not imported from @googenie/server) to keep this
// package free of server-only dependencies. Keep the literal union in sync
// with packages/server/src/auth/roles.ts.
export type Role = "super_admin" | "manager_admin" | "user";

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
  settings?: Record<string, unknown> | null;
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

  // Seed feature toggles for the user.
  // super_admin and manager_admin get all features ON; students start with
  // the core reading features so they can request the rest from their teacher.
  const CATALOG = [
    "email_read", "email_write",
    "calendar_read", "calendar_write",
    "ai_summary", "ai_compose",
  ];
  const enabledByDefault: Record<string, string[]> = {
    super_admin:   CATALOG,
    manager_admin: CATALOG,
    user:          ["email_read", "calendar_read"],
  };
  const enabledSet = new Set(enabledByDefault[chosenRole] ?? ["email_read", "calendar_read"]);

  await db.insert(schema.userFeatureAccess)
    .values(CATALOG.map(fk => ({
      tenantId: opts.tenantId,
      userId: id,
      featureKey: fk,
      isEnabled: enabledSet.has(fk),
    })))
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

// ── List users across all role tenants (super_admin global view) ──────────────
// Used for admin user roster and org-tree where the super_admin needs visibility
// over teachers (dev-teachers) and students (dev-students) in addition to peers.
const ROLE_TENANT_IDS = ["dev-admin", "dev-teachers", "dev-students"] as const;

export async function listAllRoleTenantUsers(): Promise<DbUser[]> {
  const rows: DbUser[] = [];
  for (const tid of ROLE_TENANT_IDS) {
    const r = await db.select().from(schema.users).where(eq(schema.users.tenantId, tid));
    rows.push(...(r as DbUser[]));
  }
  // Dedup by email keeping the highest-privilege role
  // (super_admin > manager_admin > user)
  const priority: Record<string, number> = { super_admin: 3, manager_admin: 2, user: 1 };
  const byEmail = new Map<string, DbUser>();
  for (const u of rows) {
    const key = (u.email ?? u.id).toLowerCase();
    const existing = byEmail.get(key);
    if (!existing || (priority[u.role] ?? 0) > (priority[existing.role] ?? 0)) {
      byEmail.set(key, u);
    }
  }
  return [...byEmail.values()];
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

/**
 * Patch a single key on the user's JSON settings bag.
 * Used by Feature A4 (auto-categorize toggle) and future per-user prefs.
 */
export async function updateUserSetting<T>(userId: string, key: string, value: T): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ settings: schema.users.settings })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const current = (row?.settings as Record<string, unknown> | null) ?? {};
  const next = { ...current, [key]: value };
  await db
    .update(schema.users)
    .set({ settings: next, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return next;
}

export async function getUserSettings(userId: string): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ settings: schema.users.settings })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return (row?.settings as Record<string, unknown> | null) ?? {};
}
