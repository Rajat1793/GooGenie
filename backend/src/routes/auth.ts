/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response, type NextFunction } from "express";
import { compare } from "bcryptjs";
import { createAccessToken } from "../auth/token.js";
import { requireAuth } from "../auth/middleware.js";
import { db, schema } from "../db/client.js";
import {
  upsertClerkUser,
  getUserByEmail,
  getUserByClerkId,
  setUserManager,
  listManagers,
  listDirectReports,
  listTenantUsersFromDb,
  getUserById
} from "../db/users.js";
import { eq } from "drizzle-orm";
import { createApiError } from "../security/errors.js";
import { env } from "../security/env.js";
import { z } from "zod";

export const authRouter = Router();

const TENANT_ID = env.DEFAULT_TENANT_ID;
const TOKEN_TTL = 24 * 60 * 60; // 24h

// ── POST /v1/auth/login ────────────────────────────────────────────────────────
// Local login for super_admin and manager_admin (hardcoded accounts in DB).
authRouter.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Email and password required", false, req.traceId);

    const { email, password } = parsed.data;
    const user = await getUserByEmail(TENANT_ID, email);
    if (!user || !user.passwordHash) {
      throw createApiError("UNAUTHORIZED", "Invalid email or password", false, req.traceId);
    }
    if (!["super_admin", "manager_admin"].includes(user.role)) {
      throw createApiError("FORBIDDEN", "Local login is only for admin accounts", false, req.traceId);
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) throw createApiError("UNAUTHORIZED", "Invalid email or password", false, req.traceId);

    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
    const token = createAccessToken({ sub: user.id, tenant_id: user.tenantId, role: user.role as any, exp });

    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, tenantId: user.tenantId }
    });
  } catch (err) { next(err); }
});

// ── POST /v1/auth/clerk-sync ───────────────────────────────────────────────────
// Called after Clerk sign-in to upsert the user in our DB.
// IMPORTANT: `role` is only accepted when the user explicitly selects a role on
// the login page (stored as `googenie-pending-role` in localStorage).
// If no role is supplied (page reload while already signed-in), the existing DB
// role/tenant is preserved — the backend never downgrades an existing user.
authRouter.post("/auth/clerk-sync", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId: clerkUserId } = req.auth!;
    const parsed = z.object({
      email: z.string().email(),
      displayName: z.string().min(1),
      role: z.enum(["super_admin", "manager_admin", "user"]).optional(),
    }).safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Email and displayName required", false, req.traceId);

    const ROLE_TENANT: Record<string, string> = {
      super_admin:   "dev-admin",
      manager_admin: "dev-teachers",
      user:          "dev-students",
    };

    // If no role was sent (page reload / background clerkSync), look up the
    // existing DB row and keep the current role/tenant rather than defaulting
    // to "user" which would silently demote a Big Boss to a Student.
    let chosenRole: import("../auth/roles.js").Role;
    let tenantId: string;

    if (parsed.data.role) {
      // Explicit role chosen on the login page — honour it.
      chosenRole = parsed.data.role;
      tenantId = ROLE_TENANT[chosenRole] ?? TENANT_ID;
    } else {
      // No role sent — check if the user already has a DB row.
      const existing = await getUserByClerkId(clerkUserId);
      if (existing) {
        // Keep existing role and tenant — do NOT overwrite.
        chosenRole = existing.role as import("../auth/roles.js").Role;
        tenantId = existing.tenantId;
      } else {
        // Brand-new user with no role selection → default to student.
        chosenRole = "user";
        tenantId = ROLE_TENANT.user;
      }
    }

    const user = await upsertClerkUser({
      clerkUserId,
      tenantId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: chosenRole,
    });

    const needsManager = (!user.managerUserId) && (user.role === "user" || user.role === "manager_admin");
    res.json({ user, needsManager });
  } catch (err) { next(err); }
});

// ── GET /v1/auth/me ────────────────────────────────────────────────────────────
// Returns the full DB user profile for the authenticated user.
authRouter.get("/auth/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, tenantId } = req.auth!;
    // Try clerk ID first, then direct ID
    const user = await getUserByClerkId(userId) ?? await getUserById(userId);
    if (!user) throw createApiError("NOT_FOUND", "User not found", false, req.traceId);
    res.json({ user });
  } catch (err) { next(err); }
});

// ── GET /v1/auth/managers ──────────────────────────────────────────────────────
// Returns all manager_admin users (for the popup selector).
// Reads from the teachers tenant so students can pick a teacher as their manager.
authRouter.get("/auth/managers", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const managers = await listManagers("dev-teachers");
    res.json({ managers: managers.map(m => ({ id: m.id, displayName: m.displayName, email: m.email })) });
  } catch (err) { next(err); }
});

// ── GET /v1/auth/bosses ────────────────────────────────────────────────────────
// Returns all super_admin users — used by teachers to select their Big Boss.
authRouter.get("/auth/bosses", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bosses = await listTenantUsersFromDb("dev-admin");
    const superAdmins = bosses.filter(u => u.role === "super_admin");
    res.json({ bosses: superAdmins.map(b => ({ id: b.id, displayName: b.displayName, email: b.email })) });
  } catch (err) { next(err); }
});

// ── POST /v1/auth/select-manager ──────────────────────────────────────────────
// Sets the manager for the signed-in Clerk user. Stored in PostgreSQL.
authRouter.post("/auth/select-manager", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.auth!;
    const parsed = z.object({ managerId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "managerId required", false, req.traceId);

    // Resolve to DB user ID (supports both Clerk userId and DB id)
    const dbUser = await getUserByClerkId(userId) ?? await getUserById(userId);
    if (!dbUser) throw createApiError("NOT_FOUND", "User not found", false, req.traceId);

    await setUserManager(dbUser.id, parsed.data.managerId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /v1/auth/team ──────────────────────────────────────────────────────────
// Returns direct reports for the authenticated manager/superadmin.
authRouter.get("/auth/team", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.auth!;
    if (!["super_admin", "manager_admin"].includes(role)) {
      throw createApiError("FORBIDDEN", "Only managers can view team", false, req.traceId);
    }

    let dbUserId = userId;
    if (userId.startsWith("user_")) {
      // Clerk ID — resolve to DB ID
      const dbUser = await getUserByClerkId(userId);
      if (dbUser) dbUserId = dbUser.id;
    }

    const reports = await listDirectReports(dbUserId);
    res.json({ team: reports });
  } catch (err) { next(err); }
});

// ── GET /v1/auth/org-tree ──────────────────────────────────────────────────────
// Returns the full org tree for visualization. Available to all authenticated users.
// Queries across all role-based tenants (dev-admin, dev-teachers, dev-students)
// so the hierarchy always shows the complete picture regardless of the caller's role.
authRouter.get("/auth/org-tree", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Gather users from all three role-based tenants
    const [adminUsers, teacherUsers, studentUsers] = await Promise.all([
      listTenantUsersFromDb("dev-admin").catch(() => [] as Awaited<ReturnType<typeof listTenantUsersFromDb>>),
      listTenantUsersFromDb("dev-teachers").catch(() => [] as Awaited<ReturnType<typeof listTenantUsersFromDb>>),
      listTenantUsersFromDb("dev-students").catch(() => [] as Awaited<ReturnType<typeof listTenantUsersFromDb>>),
    ]);

    // Deduplicate by email — same person can appear in multiple tenants if they
    // re-logged in with a different role tab. Keep the most-privileged row per email.
    const ROLE_RANK: Record<string, number> = { super_admin: 3, manager_admin: 2, user: 1 };
    const byEmail = new Map<string, typeof adminUsers[number]>();
    for (const u of [...adminUsers, ...teacherUsers, ...studentUsers]) {
      const existing = byEmail.get(u.email);
      if (!existing || ROLE_RANK[u.role] > ROLE_RANK[existing.role]) {
        byEmail.set(u.email, u);
      }
    }
    const allUsers = Array.from(byEmail.values());

    // Build tree: big-boss → teachers → students
    const bigBoss = allUsers.filter(u => u.role === "super_admin");
    const teachers = allUsers.filter(u => u.role === "manager_admin");
    const students = allUsers.filter(u => u.role === "user");

    const tree = bigBoss.map(boss => ({
      ...boss,
      children: teachers
        .filter(t => t.managerUserId === boss.id || !t.managerUserId)
        .map(teacher => ({
          ...teacher,
          children: students.filter(s => s.managerUserId === teacher.id)
        }))
    }));

    const unassigned = students.filter(s => !s.managerUserId);

    res.json({ tree, unassigned, stats: { bigBoss: bigBoss.length, teachers: teachers.length, students: students.length } });
  } catch (err) { next(err); }
});

// ── GET /v1/auth/all-users ─────────────────────────────────────────────────────
// Returns all users in tenant — super_admin only.
authRouter.get("/auth/all-users", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, tenantId } = req.auth!;
    if (role !== "super_admin") throw createApiError("FORBIDDEN", "super_admin only", false, req.traceId);
    const users = await listTenantUsersFromDb(tenantId);
    res.json({ users });
  } catch (err) { next(err); }
});
