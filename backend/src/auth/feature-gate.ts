import type { NextFunction, Request, Response } from "express";

import { ROLE } from "./roles.js";
import { isFeatureEnabled } from "./policy-store.js";
import { createApiError } from "../security/errors.js";

export function requireFeature(featureKey: string) {
  return function featureGate(req: Request, _res: Response, next: NextFunction): void {
    const auth = req.auth;
    if (!auth) {
      next(createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId));
      return;
    }

    if (auth.role === ROLE.SUPER_ADMIN) {
      next();
      return;
    }

    const enabled = isFeatureEnabled(auth.tenantId, auth.userId, featureKey);
    if (!enabled) {
      next(createApiError("FORBIDDEN", `Feature ${featureKey} is disabled for this user`, false, req.traceId));
      return;
    }

    next();
  };
}
