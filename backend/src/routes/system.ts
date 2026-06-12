/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { ALL_ROLES } from "../auth/roles.js";
import { getCounters, getLatency, evaluateAlerts, resetMetrics } from "../security/metrics.js";
import { env } from "../security/env.js";

export const systemRouter = Router();

systemRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "googenie-backend", roles: ALL_ROLES });
});

systemRouter.get("/v1/auth/config", (_req: Request, res: Response) => {
  res.status(200).json({
    token_type: "Bearer",
    algorithm: "HMAC-SHA256",
    access_token_ttl_seconds: 3600,
    refresh_token_ttl_seconds: 604800,
    refresh_window_seconds: 300,
    clock_skew_tolerance_seconds: 30,
    roles: ALL_ROLES,
    scopes: ["email_read", "email_write", "calendar_read", "calendar_write", "ai_summary", "ai_compose"]
  });
});

systemRouter.get("/v1/metrics", (_req: Request, res: Response) => {
  res.status(200).json({ counters: getCounters(), latency: getLatency(), collected_at: new Date().toISOString() });
});

systemRouter.get("/v1/alerts", (_req: Request, res: Response) => {
  const alerts = evaluateAlerts();
  const status = alerts.some((a) => a.status === "critical") ? "critical"
    : alerts.some((a) => a.status === "warn") ? "warn" : "ok";
  res.status(200).json({ status, alerts });
});

systemRouter.post("/v1/metrics/reset", (_req: Request, res: Response) => {
  if (env.NODE_ENV === "production") {
    res.status(403).json({ message: "Not available in production" });
    return;
  }
  resetMetrics();
  res.status(200).json({ reset: true });
});
