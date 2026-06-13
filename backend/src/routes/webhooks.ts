/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { handleWebhookRequest, webhookStore } from "../integrations/webhooks.js";
import { requireAuth } from "../auth/middleware.js";
import { requireRole } from "../auth/middleware.js";
import { env } from "../security/env.js";

export const webhooksRouter = Router();

/** Resolve tenant from query param, falling back to DEFAULT_TENANT_ID */
function resolveTenant(req: Request): string {
  return typeof req.query.tenantId === "string" ? req.query.tenantId : env.DEFAULT_TENANT_ID;
}

/**
 * POST /v1/webhooks/gmail
 * Receives Gmail push notifications from Google Cloud Pub/Sub.
 * No auth required — Corsair verifies the webhook signature internally.
 */
webhooksRouter.post("/webhooks/gmail", async (req: Request, res: Response) => {
  const result = await handleWebhookRequest(req, resolveTenant(req));
  if (result.duplicate) {
    res.status(200).json({ status: "duplicate", plugin: result.plugin, action: result.action });
    return;
  }
  res.status(200).json({ status: result.handled ? "processed" : "ignored", plugin: result.plugin, action: result.action });
});

/**
 * POST /v1/webhooks/googlecalendar
 * Receives Google Calendar push notifications.
 */
webhooksRouter.post("/webhooks/googlecalendar", async (req: Request, res: Response) => {
  const result = await handleWebhookRequest(req, resolveTenant(req));
  if (result.duplicate) {
    res.status(200).json({ status: "duplicate", plugin: result.plugin, action: result.action });
    return;
  }
  res.status(200).json({ status: result.handled ? "processed" : "ignored", plugin: result.plugin, action: result.action });
});

/**
 * GET /v1/webhooks/events
 * Returns recent webhook events for auditing. Admin only.
 */
webhooksRouter.get("/webhooks/events", requireAuth, requireRole(["super_admin"]), (req: Request, res: Response) => {
  const tenantId = req.auth?.tenantId;
  const events = webhookStore.list(tenantId);
  res.status(200).json({ events, total: events.length });
});
