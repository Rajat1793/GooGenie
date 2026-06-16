/**
 * Local helpers used by /api/v1/email/* and /api/v1/calendar/* Route Handlers.
 * Mirrors getScopedUserIds (Express scope.ts) for the Next.js handler shape.
 */
import { NextResponse } from "next/server";
import {
  type AuthCtx,
  createApiError,
  resolveAllowedUserIds,
  statusFromApiError,
  requireFeature as nextRequireFeature,
} from "@googenie/server";

export function getScopedUserIds(auth: AuthCtx): Set<string> {
  const scoped = resolveAllowedUserIds({ userId: auth.userId, tenantId: auth.tenantId, role: auth.role });
  scoped.add(auth.userId);
  return scoped;
}

export function forbidden(message: string, traceId: string) {
  return NextResponse.json(createApiError("FORBIDDEN", message, false, traceId), {
    status: statusFromApiError("FORBIDDEN"),
  });
}

export function notFound(message: string, traceId: string) {
  return NextResponse.json(createApiError("NOT_FOUND", message, false, traceId), {
    status: statusFromApiError("NOT_FOUND"),
  });
}

/**
 * Run feature-gate check inside a handler (in addition to withApiMiddleware's
 * auth check). Returns null on success, or a NextResponse to return immediately.
 */
export async function checkFeature(req: Request, featureKey: string) {
  const res = await nextRequireFeature(req, featureKey);
  if (!res.ok) return res.response;
  return null;
}
