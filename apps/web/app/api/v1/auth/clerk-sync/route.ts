/**
 * POST /api/v1/auth/clerk-sync — upsert Clerk user into our DB (Phase 6 step 29).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { upsertClerkUser, getUserByClerkId, type Role } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_TENANT: Record<string, string> = {
  super_admin: "dev-admin",
  manager_admin: "dev-teachers",
  user: "dev-students",
};

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const parsed = await validateBody(
    z.object({
      email: z.string().email(),
      displayName: z.string().min(1),
      role: z.enum(["super_admin", "manager_admin", "user"]).optional(),
    }),
    req,
    { traceId, message: "Email and displayName required" }
  );
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const clerkUserId = auth!.userId;

  let chosenRole: Role;
  let tenantId: string;

  if (body.role) {
    chosenRole = body.role;
    tenantId = ROLE_TENANT[chosenRole] ?? "dev-admin";
  } else {
    const existing = await getUserByClerkId(clerkUserId);
    if (existing) {
      chosenRole = existing.role as Role;
      tenantId = existing.tenantId;
    } else {
      chosenRole = "user";
      tenantId = ROLE_TENANT.user!;
    }
  }

  const user = await upsertClerkUser({
    clerkUserId,
    tenantId,
    email: body.email,
    displayName: body.displayName,
    role: chosenRole,
  });

  const needsManager = !user.managerUserId && (user.role === "user" || user.role === "manager_admin");
  return NextResponse.json({ user, needsManager });
});
