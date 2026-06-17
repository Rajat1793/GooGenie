import { NextResponse } from "next/server";
import { withApiMiddleware, corsair } from "@googenie/server";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLUGINS = ["gmail", "googlecalendar"] as const;
const STATUS_TTL_MS = 30_000;
const statusCache = new Map<string, { connected: boolean; expiresAt: number }>();

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
  await t.googlecalendar.api.calendarList.get({ calendarId: "primary" });
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
      connected[plugin] = cached.connected;
      continue;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = (tenant as any)[plugin]?.keys;
      if (!keys) {
        connected[plugin] = false;
        statusCache.set(cacheKey, { connected: false, expiresAt: now + STATUS_TTL_MS });
        continue;
      }
      const token = await keys.get_access_token();
      const hasToken = typeof token === "string" && token.length > 0;
      if (!hasToken) {
        connected[plugin] = false;
        statusCache.set(cacheKey, { connected: false, expiresAt: now + STATUS_TTL_MS });
        continue;
      }

      const liveConnected = await probePluginConnection(tenant, plugin);
      connected[plugin] = liveConnected;
      statusCache.set(cacheKey, { connected: liveConnected, expiresAt: now + STATUS_TTL_MS });
    } catch {
      connected[plugin] = false;
      statusCache.set(cacheKey, { connected: false, expiresAt: now + STATUS_TTL_MS });
    }
  }
  return NextResponse.json({ connected });
});
