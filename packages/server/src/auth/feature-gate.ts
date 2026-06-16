/// <reference path="../contracts/request.d.ts" />
import type { NextFunction, Request, Response } from "express";

import { ROLE } from "./roles";
import { createApiError } from "../security/errors";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { listFeatureAccessForUser } from "@googenie/db/featureRequests";

/**
 * DB-backed feature gate.
 * Reads from user_feature_access table so manager-controlled toggles actually
 * take effect. Previously used in-memory policy-store which always returned
 * true for real Clerk users — that's now fixed.
 */
export function requireFeature(featureKey: string) {
  return async function featureGate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const auth = req.auth;
    if (!auth) {
      next(createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId));
      return;
    }

    // Super-admin always bypasses feature checks
    if (auth.role === ROLE.SUPER_ADMIN) {
      next();
      return;
    }

    try {
      // Resolve actual DB row — auth.userId is Clerk sub (e.g. user_xxx), but
      // DB id is clerk_user_xxx. getUserByClerkId handles the mapping.
      const dbUser = (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
      const tenantId = dbUser?.tenantId ?? auth.tenantId;
      const userId   = dbUser?.id       ?? auth.userId;

      const toggles = await listFeatureAccessForUser(tenantId, userId);

      if (toggles.length === 0) {
        // No rows → clerkSync hasn't run yet (rare transient state). Deny.
        next(createApiError("FORBIDDEN", `Feature '${featureKey}' is not yet provisioned for this account`, false, req.traceId));
        return;
      }

      const toggle = toggles.find((t) => t.featureKey === featureKey);
      if (!toggle || !toggle.isEnabled) {
        next(createApiError("FORBIDDEN", `Feature '${featureKey}' is disabled for this account`, false, req.traceId));
        return;
      }

      next();
    } catch {
      // DB hiccup — fail open so a transient error doesn't lock everyone out
      next();
    }
  };
}
