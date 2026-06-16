import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { adminUpdateManagerSchema } from "@googenie/server/contracts/schemas";
import { db, schema } from "@googenie/db";
import { getUserById, setUserManager } from "@googenie/db/users";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
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

  if (parsed.data.manager_user_id) {
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
