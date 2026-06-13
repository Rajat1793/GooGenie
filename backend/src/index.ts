/// <reference path="./contracts/request.d.ts" />
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";

import { attachTraceId } from "./auth/middleware.js";
import type { ApiError } from "./contracts/api-error.js";
import { statusFromApiError } from "./security/errors.js";
import { idempotency } from "./security/idempotency.js";
import { rateLimiter } from "./security/rate-limiter.js";
import { recordRequest } from "./security/metrics.js";
import { secureHeaders } from "./security/secure-headers.js";
import { env } from "./security/env.js";

import { corsair, setupCorsair } from "./integrations/corsair.js";
import { systemRouter } from "./routes/system.js";
import { meRouter } from "./routes/me.js";
import { adminRouter } from "./routes/admin.js";
import { managerRouter } from "./routes/manager.js";
import { contentRouter } from "./routes/content.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { agentRouter } from "./routes/agent.js";
import { connectRouter } from "./routes/connect.js";
import { demoRouter } from "./routes/demo.js";
import { authRouter } from "./routes/auth.js";

export const app = express();
app.disable("x-powered-by");
app.use(attachTraceId);
app.use(secureHeaders);
// CORS: allow localhost in dev and the Render frontend in production
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      "http://localhost:3000",
      "http://localhost:5173",
      env.FRONTEND_URL,
      // Allow any onrender.com subdomain
    ].filter(Boolean);
    if (!origin || allowed.includes(origin) || origin.endsWith(".onrender.com")) {
      cb(null, true);
    } else {
      cb(null, true); // permissive for now — tighten in production
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "64kb" }));
app.use(idempotency);
app.use(rateLimiter);

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
app.use("/v1", contentRouter);          // /v1/email/*, /v1/calendar/*
app.use("/v1", webhooksRouter);         // /v1/webhooks/gmail, /v1/webhooks/googlecalendar
app.use("/v1", agentRouter);            // /v1/agent/execute
app.use("/v1", connectRouter);          // /v1/me/connect/*
app.use("/v1", demoRouter);             // /v1/demo/tokens
app.use("/v1", authRouter);             // /v1/auth/*

// ── Error handlers ────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next({ code: "NOT_FOUND", message: "Route not found", trace_id: _req.traceId ?? "", retryable: false } satisfies ApiError);
});

app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  res.status(statusFromApiError(err.code)).json(err);
});

const port = env.PORT;
if (process.env.NODE_ENV !== "test") {
  setupCorsair(corsair)
    .then(() => {
      app.listen(port, () => console.log(`Googenie backend listening on port ${port}`));
    })
    .catch((err) => {
      console.error("Corsair DB init failed:", err);
      process.exit(1);
    });
}
