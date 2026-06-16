import { NextResponse } from "next/server";
import { withApiMiddleware, corsair } from "@googenie/server";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLUGINS = ["gmail", "googlecalendar"] as const;

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const corsairTenantId = getCorsairTenant(auth!.userId);
  const tenant = corsair.withTenant(corsairTenantId);
  const connected: Record<string, boolean> = {};

  for (const plugin of PLUGINS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = (tenant as any)[plugin]?.keys;
      if (!keys) { connected[plugin] = false; continue; }
      const token = await keys.get_access_token();
      connected[plugin] = typeof token === "string" && token.length > 0;
    } catch {
      connected[plugin] = false;
    }
  }
  return NextResponse.json({ connected });
});
