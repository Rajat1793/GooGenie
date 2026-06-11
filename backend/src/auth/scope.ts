/// <reference path="../contracts/request.d.ts" />
import type { NextFunction, Request, Response } from "express";

import { ROLE } from "./roles.js";
import { getTenantUsers } from "./policy-store.js";
import type { AuthContext } from "./context.js";
import { createApiError } from "../security/errors.js";

export function resolveAllowedUserIds(auth: AuthContext): Set<string> {
  const tenantUsers = getTenantUsers(auth.tenantId);

  if (auth.role === ROLE.SUPER_ADMIN) {
    return new Set(tenantUsers.map((user) => user.id));
  }

  if (auth.role === ROLE.USER) {
    return new Set([auth.userId]);
  }

  const allowed = new Set<string>();
  const queue = [auth.userId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const directReports = tenantUsers.filter((user) => user.managerUserId === current).map((user) => user.id);
    for (const report of directReports) {
      if (!allowed.has(report)) {
        allowed.add(report);
        queue.push(report);
      }
    }
  }

  return allowed;
}

export function requireUserScope(getTargetUserId: (req: Request) => string | undefined) {
  return function scopeGuard(req: Request, _res: Response, next: NextFunction): void {
    const auth = req.auth;
    if (!auth) {
      next(createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId));
      return;
    }

    const targetUserId = getTargetUserId(req);
    if (!targetUserId) {
      next(createApiError("VALIDATION_ERROR", "Missing target user id", false, req.traceId));
      return;
    }

    const allowed = resolveAllowedUserIds(auth);
    if (!allowed.has(targetUserId) && auth.userId !== targetUserId) {
      next(createApiError("FORBIDDEN", "Target user is out of scope", false, req.traceId));
      return;
    }

    next();
  };
}
