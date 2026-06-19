import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { adminUpdateManagerSchema } from "@googenie/server/contracts/schemas";
import { db, schema } from "@googenie/db";
import {
  getUserById,
  getUserByClerkId,
  getAdminSubtree,
  setUserManager,
} from "@googenie/db/users";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const parsed = await validateBody(adminUpdateManagerSchema, req, { traceId, message: "Invalid manager update payload" });
  if (!parsed.ok) return parsed.response;

  const target = await getUserById(userId);
  if (!target) {
    return NextResponse.json(createApiError("NOT_FOUND", "Target user not found", false, traceId), {
      status: statusFromApiError("NOT_FOUND"),
    });
  }

  // Per-admin isolation: caller may only re-assign users in their own subtree
  // or orphans (no manager yet). Cannot move users out of another admin's tree.
  const subtree = await getAdminSubtree(me.id);
  const isInSubtree = subtree.allIds.has(target.id);
  const isOrphan = !target.managerUserId && target.role !== "super_admin";
  if (!isInSubtree && !isOrphan) {
    return NextResponse.json(
      createApiError("FORBIDDEN", "Target user is not in your team", false, traceId),
      { status: statusFromApiError("FORBIDDEN") },
    );
  }

  // The new manager (if any) must also be inside caller's subtree
  // (caller themselves for teachers, or one of caller's teachers for students).
  if (parsed.data.manager_user_id) {
    const newMgr = await getUserById(parsed.data.manager_user_id);
    if (!newMgr || !subtree.allIds.has(newMgr.id)) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "New manager is not in your team", false, traceId),
        { status: statusFromApiError("FORBIDDEN") },
      );
    }
    await setUserManager(target.id, parsed.data.manager_user_id);
  } else {
    await db
      .update(schema.users)
      .set({ managerUserId: null, updatedAt: new Date() })
      .where(eq(schema.users.id, target.id));
  }

  const updated = await getUserById(target.id);
  return NextResponse.json({ user: updated });
});
