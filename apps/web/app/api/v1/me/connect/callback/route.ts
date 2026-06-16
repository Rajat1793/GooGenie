import { NextResponse } from "next/server";
import { processOAuthCallback } from "corsair/oauth";
import { corsair, env } from "@googenie/server";

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
    const html = `
<html><body><script>
  if (window.opener) {
    window.opener.postMessage({ type: 'CONNECT_SUCCESS', plugin: '${result.plugin}' }, '${frontendBase}');
    window.close();
  } else {
    window.location.href = '${frontendBase}/inbox?connect=success&plugin=${result.plugin}';
  }
</script><p>Connected! You can close this window.</p></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    const html = `
<html><body><script>
  if (window.opener) {
    window.opener.postMessage({ type: 'CONNECT_ERROR', error: '${encodeURIComponent(msg)}' }, '${frontendBase}');
    window.close();
  } else {
    window.location.href = '${frontendBase}?connect=error&reason=${encodeURIComponent(msg)}';
  }
</script><p>Error: ${msg}</p></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  }
}
