import { NextResponse } from "next/server";
import { generateOAuthUrl } from "corsair/oauth";
import { withApiMiddleware, corsair, env, createApiError, statusFromApiError } from "@googenie/server";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLUGINS = ["gmail", "googlecalendar"] as const;

function callbackUri(): string {
  const base = env.BACKEND_URL ?? "http://localhost:3000";
  return `${base}/api/v1/me/connect/callback`;
}

export const POST = withApiMiddleware(async (_req, { auth, traceId, params }) => {
  const plugin = paramString(params.plugin);
  if (!(PLUGINS as readonly string[]).includes(plugin)) {
    return NextResponse.json(
      createApiError("VALIDATION_ERROR", `Unknown plugin: ${plugin}`, false, traceId),
      { status: statusFromApiError("VALIDATION_ERROR") }
    );
  }
  const corsairTenantId = getCorsairTenant(auth!.userId);
  const { url, state } = await generateOAuthUrl(corsair, plugin, {
    tenantId: corsairTenantId,
    redirectUri: callbackUri(),
  });
  return NextResponse.json({ url, state });
});
