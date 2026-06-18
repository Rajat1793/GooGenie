import { NextResponse } from "next/server";
import { processOAuthCallback } from "corsair/oauth";
import { corsair, env } from "@googenie/server";
import { invalidateConnectStatusCache } from "../status/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function callbackUri(): string {
  const base = env.BACKEND_URL ?? "http://localhost:3000";
  return `${base}/api/v1/me/connect/callback`;
}

/**
 * Public OAuth callback — Google redirects here after consent.
 * Renders a tiny HTML page that postMessages the result back to the opener.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const frontendBase = env.FRONTEND_URL ?? "http://localhost:3000";

  if (error || !code || !state) {
    return NextResponse.redirect(`${frontendBase}?connect=error&reason=${encodeURIComponent(error ?? "missing_code")}`);
  }

  try {
    const result = await processOAuthCallback(corsair, { code, state, redirectUri: callbackUri() });
    // eslint-disable-next-line no-console
    console.log("[connect/callback] success", { plugin: (result as { plugin?: string }).plugin, tenantId: (result as { tenantId?: string }).tenantId });
    // Bust any cached negative status for this tenant so the next probe
    // from the front-end sees the freshly-minted tokens immediately
    // rather than the stale "not connected" entry. The status cache only
    // stores positives now, but reconnect-after-revoke can still leave a
    // positive entry pointing at revoked tokens — clearing it is cheap.
    try {
      const tenantId = (result as { tenantId?: string }).tenantId;
      if (tenantId) invalidateConnectStatusCache(tenantId);
    } catch { /* non-fatal */ }
    // We notify the opener through TWO independent channels:
    //   1. window.opener.postMessage — fast, but breaks under strict COOP
    //      isolation when the popup navigates cross-origin and back.
    //   2. localStorage write+delete — same-origin storage events fire
    //      reliably across browsing contexts even when window.opener is
    //      severed. We write the payload then immediately remove the key
    //      so the opener sees a clean storage event regardless of any
    //      stale prior value.
    const payload = JSON.stringify({
      type: "CONNECT_SUCCESS",
      plugin: result.plugin,
      ts: Date.now(),
    });
    const html = `
<html><body><script>
  try {
    localStorage.setItem('googenie:connect:result', ${JSON.stringify(payload)});
    localStorage.removeItem('googenie:connect:result');
  } catch (e) { /* private mode — fall through to postMessage */ }
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'CONNECT_SUCCESS', plugin: '${result.plugin}' }, '${frontendBase}');
      window.close();
    } else {
      window.location.href = '${frontendBase}/inbox?connect=success&plugin=${result.plugin}';
    }
  } catch (e) {
    window.location.href = '${frontendBase}/inbox?connect=success&plugin=${result.plugin}';
  }
</script><p>Connected! You can close this window.</p></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    // eslint-disable-next-line no-console
    console.error("[connect/callback] failed", { msg, stack: err instanceof Error ? err.stack : undefined });
    const errPayload = JSON.stringify({ type: "CONNECT_ERROR", error: msg, ts: Date.now() });
    const html = `
<html><body><script>
  try {
    localStorage.setItem('googenie:connect:result', ${JSON.stringify(errPayload)});
    localStorage.removeItem('googenie:connect:result');
  } catch (e) { /* private mode */ }
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'CONNECT_ERROR', error: '${encodeURIComponent(msg)}' }, '${frontendBase}');
      window.close();
    } else {
      window.location.href = '${frontendBase}?connect=error&reason=${encodeURIComponent(msg)}';
    }
  } catch (e) {
    window.location.href = '${frontendBase}?connect=error&reason=${encodeURIComponent(msg)}';
  }
</script><p>Error: ${msg}</p></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  }
}
