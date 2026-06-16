/**
 * Helpers shared by /api/v1/webhooks/* Next.js handlers.
 */
import { publish } from "@googenie/server";
import { cache } from "@googenie/server/security/cache";
import { env } from "@googenie/server";

export function resolveTenant(req: Request): string {
  const tid = new URL(req.url).searchParams.get("tenantId");
  return tid ?? env.DEFAULT_TENANT_ID;
}

export function extractUserIdFromTenant(tenantId: string): string | null {
  return tenantId.startsWith("u_") ? tenantId.slice(2) : null;
}

export function notifyEmailChanged(tenantId: string) {
  cache.invalidatePrefix(`threads:${tenantId}`);
  const userId = extractUserIdFromTenant(tenantId);
  if (userId) publish({ kind: "email.changed", userId });
}

export function notifyCalendarChanged(tenantId: string) {
  cache.invalidatePrefix(`events:${tenantId}`);
  const userId = extractUserIdFromTenant(tenantId);
  if (userId) publish({ kind: "calendar.changed", userId });
}

export function headersToObject(h: Headers): Record<string, string | string[] | undefined> {
  const obj: Record<string, string | string[] | undefined> = {};
  h.forEach((value, key) => {
    const lower = key.toLowerCase();
    const existing = obj[lower];
    if (existing === undefined) obj[lower] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else obj[lower] = [existing, value];
  });
  return obj;
}

export function queryToObject(req: Request): Record<string, string | string[]> {
  const url = new URL(req.url);
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing, v];
  }
  return out;
}
