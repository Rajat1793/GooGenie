import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { adminUpdateRoleSchema } from "@googenie/server/contracts/schemas";
import { db, schema } from "@googenie/db";
import { getUserById, getUserByClerkId, getAdminSubtree, type Role } from "@googenie/db/users";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_TENANT: Record<string, string> = {
  super_admin: "dev-admin",
  manager_admin: "dev-teachers",
  user: "dev-students",
};

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
    });
  }

  // Resolve caller → DB user id.
  const me =
    (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "Caller not found", false, traceId), {
      status: statusFromApiError("UNAUTHORIZED"),
    });
  }

  const userId = paramString(params.userId);
  const parsed = await validateBody(adminUpdateRoleSchema, req, { traceId, message: "Invalid role update payload" });
  if (!parsed.ok) return parsed.response;

  const target = await getUserById(userId);
  if (!target) {
    return NextResponse.json(createApiError("NOT_FOUND", "Target user not found", false, traceId), {
      status: statusFromApiError("NOT_FOUND"),
    });
  }

  // Per-admin isolation: caller may only mutate users in their own subtree
  // (themselves + their teachers + their students) or orphans (no manager yet).
  const subtree = await getAdminSubtree(me.id);
  const isInSubtree = subtree.allIds.has(target.id);
  const isOrphan = !target.managerUserId && target.role !== "super_admin";
  if (!isInSubtree && !isOrphan) {
    return NextResponse.json(
      createApiError("FORBIDDEN", "Target user is not in your team", false, traceId),
      { status: statusFromApiError("FORBIDDEN") },
    );
  }

  const newTenantId = ROLE_TENANT[parsed.data.role] ?? target.tenantId;
  await db
    .update(schema.users)
    .set({ role: parsed.data.role as Role, tenantId: newTenantId, updatedAt: new Date() })
    .where(eq(schema.users.id, target.id));

  await db.insert(schema.roleChangeLogs).values({
    tenantId: newTenantId,
    changedByUserId: auth!.userId.startsWith("clerk_") ? auth!.userId : `clerk_${auth!.userId}`,
    targetUserId: target.id,
    oldRole: target.role,
    newRole: parsed.data.role,
    reason: parsed.data.reason,
  }).catch(() => null);

  const updated = await getUserById(target.id);
  return NextResponse.json({ user: updated, role_changes: [] });
});
