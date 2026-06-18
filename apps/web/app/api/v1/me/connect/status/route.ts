import { NextResponse } from "next/server";
import { withApiMiddleware, corsair } from "@googenie/server";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLUGINS = ["gmail", "googlecalendar"] as const;
const STATUS_TTL_MS = 30_000;

// In-process cache of *successful* probes only. Negative results
// (`connected: false`) are deliberately NOT cached — otherwise a user who
// just completed the OAuth popup would keep seeing the stale "not connected"
// state for up to 30 s because the first page-load probe cached `false`
// before any tokens existed. Caching only positives is cheap (the
// no-token branch returns instantly) and removes that footgun entirely.
const statusCache = new Map<string, { expiresAt: number }>();

/**
 * Invalidate cached "connected" entries for a single tenant. Called by the
 * OAuth callback route after a successful exchange so the next status
 * probe reflects reality immediately (defence-in-depth: we only cache
 * positives, so this matters mostly for reconnect-after-revoke flows).
 */
export function invalidateConnectStatusCache(corsairTenantId: string): void {
  for (const plugin of PLUGINS) {
    statusCache.delete(`${corsairTenantId}:${plugin}`);
  }
}

async function probePluginConnection(
  tenant: unknown,
  plugin: (typeof PLUGINS)[number],
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tenant as any;
  if (plugin === "gmail") {
    // Lightweight Gmail probe; fails if token is invalid/revoked.
    await t.gmail.api.labels.list({});
    return true;
  }
  // Lightweight Calendar probe; fails if token is invalid/revoked.
  // NOTE: the @corsair-dev/googlecalendar@0.1.4 plugin does NOT expose a
  // `calendarList` namespace — only `events.*` and `calendar.getAvailability`.
  // Using a non-existent path throws a TypeError synchronously, which the
  // outer try/catch silently turned into "not connected" and meant our probe
  // never even reached Corsair (no event was logged). `events.getMany` with
  // a 1-result cap is the cheapest read that actually exercises the token.
  await t.googlecalendar.api.events.getMany({
    calendarId: "primary",
    maxResults: 1,
    singleEvents: true,
    timeMin: new Date().toISOString(),
  });
  return true;
}

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const corsairTenantId = getCorsairTenant(auth!.userId);
  const tenant = corsair.withTenant(corsairTenantId);
  const connected: Record<string, boolean> = {};
  const now = Date.now();

  for (const plugin of PLUGINS) {
    const cacheKey = `${corsairTenantId}:${plugin}`;
    const cached = statusCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      // Only positives are cached — a hit means "connected: true".
      connected[plugin] = true;
      continue;
    }
    if (cached) statusCache.delete(cacheKey);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = (tenant as any)[plugin]?.keys;
      if (!keys) {
        connected[plugin] = false;
        continue;
      }
      const token = await keys.get_access_token();
      const hasToken = typeof token === "string" && token.length > 0;
      if (!hasToken) {
        connected[plugin] = false;
        continue;
      }

      const liveConnected = await probePluginConnection(tenant, plugin);
      // eslint-disable-next-line no-console
      console.log("[connect/status] probe", { tenantId: corsairTenantId, plugin, liveConnected });
      connected[plugin] = liveConnected;
      if (liveConnected) {
        statusCache.set(cacheKey, { expiresAt: now + STATUS_TTL_MS });
      }
    } catch (probeErr) {
      // eslint-disable-next-line no-console
      console.warn("[connect/status] probe-failed", { tenantId: corsairTenantId, plugin, msg: probeErr instanceof Error ? probeErr.message : String(probeErr) });
      connected[plugin] = false;
    }
  }
  return NextResponse.json({ connected });
});
