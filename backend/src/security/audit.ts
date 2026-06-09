import type { Request } from "express";

import { redactSensitive } from "./redaction.js";

export interface AuditEvent {
  at: string;
  action: string;
  actor_user_id: string;
  tenant_id: string;
  role: string;
  route: string;
  method: string;
  metadata?: Record<string, unknown>;
}

const auditEvents: AuditEvent[] = [];

export function emitAuditEvent(req: Request, action: string, metadata?: Record<string, unknown>): void {
  if (!req.auth) {
    return;
  }

  const event: AuditEvent = {
    at: new Date().toISOString(),
    action,
    actor_user_id: req.auth.userId,
    tenant_id: req.auth.tenantId,
    role: req.auth.role,
    route: req.path,
    method: req.method,
    metadata: redactSensitive(metadata ?? {})
  };

  auditEvents.push(event);

  console.log("[AUDIT]", JSON.stringify(event));
}

export function listAuditEvents(tenantId: string, filters?: { actorUserId?: string; action?: string }): AuditEvent[] {
  return auditEvents.filter((event) => {
    if (event.tenant_id !== tenantId) {
      return false;
    }
    if (filters?.actorUserId && event.actor_user_id !== filters.actorUserId) {
      return false;
    }
    if (filters?.action && event.action !== filters.action) {
      return false;
    }
    return true;
  });
}
