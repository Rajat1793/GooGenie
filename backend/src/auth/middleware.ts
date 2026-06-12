/// <reference path="../contracts/request.d.ts" />
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import type { Role } from "./roles.js";
import { verifyAccessToken } from "./token.js";
import { verifyClerkJWT, looksLikeClerkJWT } from "./clerk-jwt.js";
import { createApiError } from "../security/errors.js";

export function attachTraceId(req: Request, _res: Response, next: NextFunction): void {
  req.traceId = req.traceId ?? randomUUID();
  next();
}

/**
 * Accepts two token formats:
 *  1. Clerk RS256 JWT — issued by Clerk after sign-in (primary auth)
 *  2. Legacy HMAC token — used by existing tests, backward compat
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(createApiError("UNAUTHORIZED", "Missing bearer token", false, req.traceId));
    return;
  }

  const token = header.slice("Bearer ".length);

  if (looksLikeClerkJWT(token)) {
    // Clerk JWT — verify async then continue
    verifyClerkJWT(token).then((payload) => {
      if (!payload) {
        next(createApiError("UNAUTHORIZED", "Invalid or expired Clerk token", false, req.traceId));
        return;
      }
      // Map Clerk userId to our auth context
      // Role: check publicMetadata via Clerk dashboard, default to "user"
      const role: Role = ((payload as unknown as Record<string, unknown>)["role"] as Role) ?? "user";
      req.auth = {
        userId: payload.sub,
        tenantId: "demo-tenant",
        role
      };
      next();
    }).catch(() => {
      next(createApiError("UNAUTHORIZED", "Token verification failed", false, req.traceId));
    });
    return;
  }

  // Legacy HMAC token (tests + gen-tokens.ts)
  const hmacPayload = verifyAccessToken(token);
  if (hmacPayload) {
    req.auth = { userId: hmacPayload.sub, tenantId: hmacPayload.tenant_id, role: hmacPayload.role };
    next();
    return;
  }

  next(createApiError("UNAUTHORIZED", "Invalid or expired access token", false, req.traceId));
}

export function requireRole(roles: Role[]) {
  return function checkRole(req: Request, _res: Response, next: NextFunction): void {
    const role = req.auth?.role;
    if (!role) {
      next(createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId));
      return;
    }
    if (!roles.includes(role)) {
      next(createApiError("FORBIDDEN", "Role is not allowed for this operation", false, req.traceId));
      return;
    }
    next();
  };
}
