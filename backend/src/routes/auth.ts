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
// Returns whether manager selection is required (new user with no manager).
authRouter.post("/auth/clerk-sync", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId: clerkUserId, tenantId } = req.auth!;
    const parsed = z.object({
      email: z.string().email(),
      displayName: z.string().min(1),
      // Role set by the login tab — determines what the user sees after sign-in
      role: z.enum(["super_admin", "manager_admin", "user"]).optional(),
    }).safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Email and displayName required", false, req.traceId);

    const user = await upsertClerkUser({
      clerkUserId,
      tenantId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role as import("../auth/roles.js").Role | undefined,
    });

    // Only ask students to pick a teacher; Big Boss and Teachers don't need one
    const needsManager = user.role === "user" && !user.managerUserId;
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
// Returns all manager_admin users in the tenant (for the popup selector).
authRouter.get("/auth/managers", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.auth!;
    const managers = await listManagers(tenantId);
    res.json({ managers: managers.map(m => ({ id: m.id, displayName: m.displayName, email: m.email })) });
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
authRouter.get("/auth/org-tree", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.auth!;
    const allUsers = await listTenantUsersFromDb(tenantId);

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

    // Also include unassigned students
    const assignedStudentIds = new Set(students.filter(s => s.managerUserId).map(s => s.id));
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
