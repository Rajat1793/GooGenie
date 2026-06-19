/**
 * User service — all user/hierarchy operations backed by PostgreSQL.
 */
import { eq, and, inArray, isNull, or } from "drizzle-orm";
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
  //
  // Tiers (mirrored from apps/web/app/api/v1/me/_catalog.ts):
  //   - BASIC: local-only / no-token features that everyone gets for free
  //   - ADDON: AI-token-burning features that require manager approval
  //
  // Defaults:
  //   - super_admin    → ALL features (bypasses gates anyway, but seed for UI clarity)
  //   - manager_admin  → core + all basic features
  //   - user           → core read-only + all basic features
  //
  // Keep this list in sync with the catalog's `tier` field.
  const CORE_FEATURES = [
    "email_read", "email_write",
    "calendar_read", "calendar_write",
    "ai_summary", "ai_compose",
  ];
  const BASIC_FEATURES = [
    // Local-only Email AI (no token spend)
    "ai_sender_insights", "ai_reply_needed", "ai_ooo_detection",
    "ai_follow_up_tracker", "ai_unsubscribe_sweep",
    // Local-only Calendar AI
    "ai_daily_gaps",
    // Pure productivity / UX
    "split_inbox_view", "schedule_send",
  ];
  const ADDON_FEATURES = [
    // Token-burning Email AI
    "ai_related_threads", "ai_auto_categorize", "ai_personalized_compose",
    // Token-burning Calendar AI
    "ai_meeting_brief", "ai_smart_reschedule", "ai_schedule_from_email",
    "ai_conflict_resolver",
    // Token-burning Productivity
    "ai_task_extractor", "ai_inline_commands", "daily_digest",
  ];
  const CATALOG = [...CORE_FEATURES, ...BASIC_FEATURES, ...ADDON_FEATURES];
  const enabledByDefault: Record<string, string[]> = {
    super_admin:   CATALOG,
    manager_admin: [...CORE_FEATURES, ...BASIC_FEATURES],
    user:          ["email_read", "calendar_read", ...BASIC_FEATURES],
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

// ── Admin subtree scoping ──────────────────────────────────────────────────────
// Each super_admin owns a "subtree":
//   - themselves
//   - manager_admins (teachers) whose managerUserId === adminId
//   - users (students) whose managerUserId ∈ {those managers}
// Other admins' subtrees are intentionally invisible to enforce per-admin
// data isolation. Orphans (teachers/students with no manager) are included
// optionally so any admin can claim them.

export interface AdminSubtree {
  adminId: string;
  managerIds: string[];   // teachers directly under this admin
  userIds: string[];      // students under those teachers
  allIds: Set<string>;    // adminId ∪ managerIds ∪ userIds (NOT orphans)
}

export async function getAdminSubtree(adminId: string): Promise<AdminSubtree> {
  const direct = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.managerUserId, adminId));
  const managerIds = (direct as DbUser[])
    .filter((r) => r.role === "manager_admin")
    .map((r) => r.id);
  let userIds: string[] = [];
  if (managerIds.length > 0) {
    const students = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.managerUserId, managerIds));
    userIds = (students as DbUser[])
      .filter((r) => r.role === "user")
      .map((r) => r.id);
  }
  return {
    adminId,
    managerIds,
    userIds,
    allIds: new Set([adminId, ...managerIds, ...userIds]),
  };
}

/**
 * Returns the users an admin is allowed to see:
 *   admin + their teachers + their students
 *   (+ optionally orphan teachers/students with no manager assigned)
 */
export async function listAdminScopedUsers(
  adminId: string,
  opts: { includeOrphans?: boolean } = { includeOrphans: true },
): Promise<DbUser[]> {
  const { managerIds, userIds } = await getAdminSubtree(adminId);
  const out: DbUser[] = [];

  const admin = await getUserById(adminId);
  if (admin) out.push(admin);

  if (managerIds.length > 0) {
    const teachers = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, managerIds));
    out.push(...(teachers as DbUser[]));
  }
  if (userIds.length > 0) {
    const students = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));
    out.push(...(students as DbUser[]));
  }

  if (opts.includeOrphans) {
    const orphans = await db
      .select()
      .from(schema.users)
      .where(
        and(
          isNull(schema.users.managerUserId),
          or(
            eq(schema.users.role, "manager_admin" as Role),
            eq(schema.users.role, "user" as Role),
          ),
        ),
      );
    out.push(...(orphans as DbUser[]));
  }

  // Dedup by id (admin themselves could be re-added if they ever appeared as
  // their own descendent via stale data).
  const byId = new Map<string, DbUser>();
  for (const u of out) byId.set(u.id, u);
  return [...byId.values()];
}

/**
 * Walks the manager chain up to find the super_admin ancestor for a given user.
 * Returns the admin's DB id, or `null` if the user isn't anchored to any admin.
 * Max two hops in current data model (user → teacher → admin).
 */
export async function findRootAdminId(userId: string): Promise<string | null> {
  const visited = new Set<string>();
  let current: DbUser | null = await getUserById(userId);
  while (current && !visited.has(current.id)) {
    if (current.role === "super_admin") return current.id;
    visited.add(current.id);
    if (!current.managerUserId) return null;
    current = await getUserById(current.managerUserId);
  }
  return null;
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
