import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";

import { requireAuth, requireRole, attachTraceId } from "./auth/middleware.js";
import { requireFeature } from "./auth/feature-gate.js";
import { ALL_ROLES, ROLE } from "./auth/roles.js";
import { requireUserScope, resolveAllowedUserIds } from "./auth/scope.js";
import type { ApiError } from "./contracts/api-error.js";
import { emitAuditEvent } from "./security/audit.js";
import { env } from "./security/env.js";
import { createApiError, statusFromApiError } from "./security/errors.js";
import { createRateLimitMiddleware } from "./security/rate-limit.js";
import { secureHeaders } from "./security/secure-headers.js";

const app = express();
app.disable("x-powered-by");
app.use(attachTraceId);
app.use(secureHeaders);
app.use(cors());
app.use(express.json());

const adminRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 30 });
const managerRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 60 });

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "googenie-backend",
    roles: ALL_ROLES
  });
});

app.get("/v1/me/profile", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  res.status(200).json({
    id: auth.userId,
    tenant_id: auth.tenantId,
    role: auth.role
  });
});

app.get(
  "/v1/admin/activity",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN]),
  adminRateLimit,
  (req: Request, res: Response) => {
    emitAuditEvent(req, "admin_activity_read");
    res.status(200).json({ activity: [] });
  }
);

app.get(
  "/v1/manager/users",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  (req: Request, res: Response) => {
    emitAuditEvent(req, "manager_users_read");
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const scopedUserIds = [...resolveAllowedUserIds(auth)];
    res.status(200).json({ users: scopedUserIds });
  }
);

app.get(
  "/v1/manager/users/:userId/activity",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  requireUserScope((req) => req.params.userId),
  (req: Request, res: Response) => {
    emitAuditEvent(req, "manager_user_activity_read", { target_user_id: req.params.userId });
    res.status(200).json({ activity: [], target_user_id: req.params.userId });
  }
);

app.get("/v1/email/threads", requireAuth, requireFeature("email_read"), (req: Request, res: Response) => {
  emitAuditEvent(req, "email_threads_read");
  res.status(200).json({ threads: [] });
});

app.use((_req: Request, _res: Response, next: NextFunction) => {
  const error: ApiError = createApiError("NOT_FOUND", "Route not found", false, _req.traceId);
  next(error);
});

app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  const status = statusFromApiError(err.code);
  res.status(status).json(err);
});

const port = env.PORT;
app.listen(port, () => {
  console.log(`Googenie backend listening on port ${port}`);
});
