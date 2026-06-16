/**
 * Next.js-flavored auth helpers (Phase 3, step 15).
 *
 * Express middleware in ./middleware.ts and ./feature-gate.ts remains intact
 * to keep the legacy backend/ runnable during cutover. These functions are
 * called by every app/api/v1/* Route Handler in apps/web.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import type { Role } from "./roles";
import { ROLE } from "./roles";
import { verifyAccessToken } from "./token";
import { verifyClerkJWT, looksLikeClerkJWT } from "./clerk-jwt";
import { createApiError, statusFromApiError } from "../security/errors";
import { env } from "../security/env";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { listFeatureAccessForUser } from "@googenie/db/featureRequests";

export type AuthCtx = { userId: string; tenantId: string; role: Role };

export type AuthOk = { ok: true; auth: AuthCtx; traceId: string };
export type AuthErr = { ok: false; response: NextResponse; traceId: string };

export function traceIdFrom(req: NextRequest | Request): string {
  const hdr = (req as Request).headers.get("x-trace-id");
  return hdr && hdr.length > 0 ? hdr : randomUUID();
}

function bearerFrom(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim();
}

function envelope(code: import("../contracts/api-error.js").ApiErrorCode, message: string, traceId: string, retryable = false) {
  const err = createApiError(code, message, retryable, traceId);
  return NextResponse.json(err, { status: statusFromApiError(code) });
}

/**
 * Dual-token verification: Clerk RS256 JWT first, HMAC fallback.
 * Returns either {ok: true, auth} or {ok: false, response} ready to return
 * from a Route Handler.
 */
export async function requireAuth(req: Request): Promise<AuthOk | AuthErr> {
  const traceId = traceIdFrom(req as NextRequest);
  const token = bearerFrom(req);
  if (!token) {
    return { ok: false, response: envelope("UNAUTHORIZED", "Missing bearer token", traceId), traceId };
  }

  // Clerk JWT path
  if (looksLikeClerkJWT(token)) {
    try {
      const payload = await verifyClerkJWT(token);
      if (!payload) {
        return { ok: false, response: envelope("UNAUTHORIZED", "Invalid or expired Clerk token", traceId), traceId };
      }
      let role: Role = "user";
      let tenantId = env.DEFAULT_TENANT_ID;
      try {
        const dbUser = await getUserByClerkId(payload.sub);
        if (dbUser) {
          role = (dbUser.role as Role) ?? "user";
          tenantId = dbUser.tenantId ?? tenantId;
        }
      } catch {
        /* DB hiccup — keep defaults */
      }
      return { ok: true, auth: { userId: payload.sub, tenantId, role }, traceId };
    } catch {
      return { ok: false, response: envelope("UNAUTHORIZED", "Token verification failed", traceId), traceId };
    }
  }

  // HMAC fallback (demo tokens, tests, gen-tokens.ts)
  const hmac = verifyAccessToken(token);
  if (hmac) {
    return { ok: true, auth: { userId: hmac.sub, tenantId: hmac.tenant_id, role: hmac.role }, traceId };
  }
  return { ok: false, response: envelope("UNAUTHORIZED", "Invalid or expired access token", traceId), traceId };
}

export async function requireRole(req: Request, roles: Role[]): Promise<AuthOk | AuthErr> {
  const res = await requireAuth(req);
  if (!res.ok) return res;
  if (!roles.includes(res.auth.role)) {
    return { ok: false, response: envelope("FORBIDDEN", "Role is not allowed for this operation", res.traceId), traceId: res.traceId };
  }
  return res;
}

/**
 * DB-backed feature gate. super_admin bypasses.
 */
export async function requireFeature(
  req: Request,
  featureKey: string
): Promise<AuthOk | AuthErr> {
  const res = await requireAuth(req);
  if (!res.ok) return res;
  const { auth, traceId } = res;
  if (auth.role === ROLE.SUPER_ADMIN) return res;

  try {
    const dbUser =
      (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
    const tenantId = dbUser?.tenantId ?? auth.tenantId;
    const userId = dbUser?.id ?? auth.userId;
    const toggles = await listFeatureAccessForUser(tenantId, userId);

    if (toggles.length === 0) {
      return {
        ok: false,
        response: envelope("FORBIDDEN", `Feature '${featureKey}' is not yet provisioned for this account`, traceId),
        traceId,
      };
    }
    const toggle = toggles.find((t) => t.featureKey === featureKey);
    if (!toggle || !toggle.isEnabled) {
      return {
        ok: false,
        response: envelope("FORBIDDEN", `Feature '${featureKey}' is disabled for this account`, traceId),
        traceId,
      };
    }
    return res;
  } catch {
    // Fail open on transient DB errors so a hiccup doesn't lock everyone out.
    return res;
  }
}
