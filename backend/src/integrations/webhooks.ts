/**
 * Webhook infrastructure for Gmail and Google Calendar Corsair plugins.
 *
 * - processWebhook: dispatches incoming webhook requests through Corsair
 * - WebhookEventStore: in-memory deduplication (replace with DB in production)
 */
import { processWebhook } from "corsair";
import { corsair } from "./corsair.js";
import { emitAuditEvent } from "../security/audit.js";
import { cache } from "../security/cache.js";
import type { Request } from "express";

// ── Deduplication store ───────────────────────────────────────────────────────
interface WebhookEvent {
  id: string;
  tenantId: string;
  plugin: string;
  action: string;
  receivedAt: string;
  processedAt: string;
  status: "processed" | "duplicate" | "error";
}

const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class WebhookEventStore {
  private readonly events = new Map<string, WebhookEvent>();

  /** Returns true if this event ID has already been seen (duplicate). */
  isDuplicate(tenantId: string, plugin: string, eventId: string): boolean {
    return this.events.has(`${tenantId}:${plugin}:${eventId}`);
  }

  record(event: Omit<WebhookEvent, "processedAt">): void {
    const key = `${event.tenantId}:${event.plugin}:${event.id}`;
    this.events.set(key, { ...event, processedAt: new Date().toISOString() });
    // Evict old entries
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [k, v] of this.events) {
      if (new Date(v.receivedAt).getTime() < cutoff) this.events.delete(k);
    }
  }

  list(tenantId?: string): WebhookEvent[] {
    const all = [...this.events.values()];
    return tenantId ? all.filter((e) => e.tenantId === tenantId) : all;
  }
}

export const webhookStore = new WebhookEventStore();

// ── Webhook processor ─────────────────────────────────────────────────────────

export async function handleWebhookRequest(
  req: Request,
  tenantId?: string
): Promise<{ handled: boolean; plugin?: string; action?: string; duplicate?: boolean }> {
  try {
    const result = await processWebhook(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      corsair as any,
      req.headers as Record<string, string | string[] | undefined>,
      req.body,
      { ...(tenantId ? { tenantId } : {}), ...Object.fromEntries(
        Object.entries(req.query as Record<string, string | string[]>)
      )}
    );

    if (!result.plugin) {
      return { handled: false };
    }

    // Generate a stable event ID from the request (use header if present)
    const eventId =
      (req.headers["x-goog-message-number"] as string | undefined) ??
      (req.headers["x-webhook-id"] as string | undefined) ??
      crypto.randomUUID();

    const resolvedTenant = tenantId ?? (result as unknown as Record<string, string>).tenantId ?? "unknown";
    const isDuplicate = webhookStore.isDuplicate(resolvedTenant, result.plugin, eventId);

    webhookStore.record({
      id: eventId,
      tenantId: resolvedTenant,
      plugin: result.plugin,
      action: result.action ?? "unknown",
      receivedAt: new Date().toISOString(),
      status: isDuplicate ? "duplicate" : "processed"
    });

    if (isDuplicate) {
      return { handled: true, plugin: result.plugin, action: result.action ?? undefined, duplicate: true };
    }

    // Emit audit event for security trail
    emitAuditEvent(req, "webhook_received", {
      plugin: result.plugin,
      action: result.action,
      event_id: eventId,
      tenant_id: resolvedTenant
    });

    // Invalidate caches so next load reflects new data from Corsair DB sync
    if (result.plugin === "gmail") {
      cache.invalidatePrefix(`threads:${resolvedTenant}`);
      cache.delete(`labels:${resolvedTenant}`);
    } else if (result.plugin === "googlecalendar") {
      cache.invalidatePrefix(`events:${resolvedTenant}`);
    }

    return { handled: true, plugin: result.plugin, action: result.action ?? undefined, duplicate: false };
  } catch {
    return { handled: false };
  }
}
