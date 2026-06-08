import type { Request } from "express";

import { redactSensitive } from "./redaction.js";

export interface AuditEvent {
  action: string;
  actor_user_id: string;
  tenant_id: string;
  role: string;
  route: string;
  method: string;
  metadata?: Record<string, unknown>;
}

export function emitAuditEvent(req: Request, action: string, metadata?: Record<string, unknown>): void {
  if (!req.auth) {
    return;
  }

  const event: AuditEvent = {
    action,
    actor_user_id: req.auth.userId,
    tenant_id: req.auth.tenantId,
    role: req.auth.role,
    route: req.path,
    method: req.method,
    metadata: redactSensitive(metadata ?? {})
  };

  console.log("[AUDIT]", JSON.stringify(event));
}
