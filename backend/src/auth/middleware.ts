/// <reference path="../contracts/request.d.ts" />
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import type { Role } from "./roles.js";
import { verifyAccessToken } from "./token.js";
import { createApiError } from "../security/errors.js";

export function attachTraceId(req: Request, _res: Response, next: NextFunction): void {
  req.traceId = req.traceId ?? randomUUID();
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(createApiError("UNAUTHORIZED", "Missing bearer token", false, req.traceId));
    return;
  }

  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token);
  if (!payload) {
    next(createApiError("UNAUTHORIZED", "Invalid or expired access token", false, req.traceId));
    return;
  }

  req.auth = {
    userId: payload.sub,
    tenantId: payload.tenant_id,
    role: payload.role
  };

  next();
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
