/// <reference path="./contracts/request.d.ts" />
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";

import { attachTraceId } from "./auth/middleware.js";
import type { ApiError } from "./contracts/api-error.js";
import { statusFromApiError } from "./security/errors.js";
import { idempotency } from "./security/idempotency.js";
import { recordRequest } from "./security/metrics.js";
import { secureHeaders } from "./security/secure-headers.js";
import { env } from "./security/env.js";

import { systemRouter } from "./routes/system.js";
import { meRouter } from "./routes/me.js";
import { adminRouter } from "./routes/admin.js";
import { managerRouter } from "./routes/manager.js";
import { contentRouter } from "./routes/content.js";

export const app = express();
app.disable("x-powered-by");
app.use(attachTraceId);
app.use(secureHeaders);
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(idempotency);

// Request timing → metrics
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    recordRequest({
      durationMs: Date.now() - start,
      statusCode: res.statusCode,
      wasAuthz: Boolean(req.auth),
      wasGranted: res.statusCode < 400
    });
  });
  next();
});

// ── Route modules ─────────────────────────────────────────────────────────
app.use(systemRouter);          // /health, /v1/auth/config, /v1/metrics, /v1/alerts
app.use("/v1/me", meRouter);    // /v1/me/profile, /v1/me/features, /v1/me/activity
app.use("/v1/admin", adminRouter);     // /v1/admin/users, /v1/admin/activity
app.use("/v1/manager", managerRouter); // /v1/manager/users, /v1/manager/bulk-actions
app.use("/v1", contentRouter);         // /v1/email/threads, /v1/calendar/events

// ── Error handlers ────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next({ code: "NOT_FOUND", message: "Route not found", trace_id: _req.traceId ?? "", retryable: false } satisfies ApiError);
});

app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  res.status(statusFromApiError(err.code)).json(err);
});

const port = env.PORT;
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`Googenie backend listening on port ${port}`));
}
