/**
 * POST /api/v1/auth/login — local admin login (Phase 6, step 29).
 */
import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { withApiMiddleware, env, createApiError, statusFromApiError } from "@googenie/server";
import { createAccessToken } from "@googenie/server/auth/token";
import { getUserByEmail } from "@googenie/db/users";
import { validateBody } from "@googenie/server/lib/validateNext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL = 24 * 60 * 60;

export const POST = withApiMiddleware(
  async (req, { traceId }) => {
    const body = await validateBody(
      z.object({ email: z.string().email(), password: z.string().min(1) }),
      req,
      { traceId, message: "Email and password required" }
    );
    if (!body.ok) return body.response;

    const user = await getUserByEmail(env.DEFAULT_TENANT_ID, body.data.email);
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        createApiError("UNAUTHORIZED", "Invalid email or password", false, traceId),
        { status: statusFromApiError("UNAUTHORIZED") }
      );
    }
    if (!["super_admin", "manager_admin"].includes(user.role)) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "Local login is only for admin accounts", false, traceId),
        { status: statusFromApiError("FORBIDDEN") }
      );
    }
    const valid = await compare(body.data.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        createApiError("UNAUTHORIZED", "Invalid email or password", false, traceId),
        { status: statusFromApiError("UNAUTHORIZED") }
      );
    }

    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
    const token = createAccessToken({
      sub: user.id,
      tenant_id: user.tenantId,
      role: user.role as "super_admin" | "manager_admin" | "user",
      exp,
    });

    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, tenantId: user.tenantId },
    });
  },
  { auth: false }
);
