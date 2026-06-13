/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../auth/middleware.js";
import { corsair } from "../integrations/corsair.js";
import { getCorsairTenant } from "../integrations/corsair-tenant.js";
import { createApiError } from "../security/errors.js";
import { env } from "../security/env.js";
import { generateOAuthUrl, processOAuthCallback } from "corsair/oauth";

export const connectRouter = Router();

const REDIRECT_URI = `${env.BACKEND_URL ?? "http://localhost:4000"}/v1/me/connect/callback`;
const PLUGINS = ["gmail", "googlecalendar"] as const;
type Plugin = (typeof PLUGINS)[number];

// ── GET /v1/me/connect/status ────────────────────────────────────────────────
// Returns { gmail: boolean, googlecalendar: boolean } for the signed-in user.
connectRouter.get("/me/connect/status", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.auth!;
    const corsairTenantId = getCorsairTenant(userId);
    const tenant = corsair.withTenant(corsairTenantId);
    const connected: Record<string, boolean> = {};

    for (const plugin of PLUGINS) {
      try {
        // Try fetching the access token — succeeds only if user has OAuth tokens stored
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keys = (tenant as any)[plugin]?.keys;
        if (!keys) { connected[plugin] = false; continue; }
        const token = await keys.get_access_token();
        connected[plugin] = typeof token === "string" && token.length > 0;
      } catch {
        connected[plugin] = false;
      }
    }

    res.json({ connected });
  } catch (err) {
    next(err);
  }
});

// ── POST /v1/me/connect/:plugin/init ───────────────────────────────────────
// Authenticated: generates and returns the OAuth URL for the frontend to open.
connectRouter.post("/me/connect/:plugin/init", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { plugin } = req.params;
    if (!PLUGINS.includes(plugin as Plugin)) {
      throw createApiError("VALIDATION_ERROR", `Unknown plugin: ${plugin}`, false, req.traceId);
    }
    const { userId } = req.auth!;
    const corsairTenantId = getCorsairTenant(userId);
    const { url, state } = await generateOAuthUrl(corsair, plugin, { tenantId: corsairTenantId, redirectUri: REDIRECT_URI });
    res.json({ url, state });
  } catch (err) {
    next(err);
  }
});

// ── GET /v1/me/connect/callback ──────────────────────────────────────────────
// Google redirects here after consent. Exchanges the code for tokens.
connectRouter.get("/me/connect/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendBase = env.FRONTEND_URL ?? "http://localhost:3000";

  if (error || !code || !state) {
    return res.redirect(`${frontendBase}?connect=error&reason=${encodeURIComponent(error ?? "missing_code")}`);
  }

  try {
    const result = await processOAuthCallback(corsair, { code, state, redirectUri: REDIRECT_URI });
    // Close the popup / redirect to inbox
    return res.send(`
      <html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'CONNECT_SUCCESS', plugin: '${result.plugin}' }, '${frontendBase}');
          window.close();
        } else {
          window.location.href = '${frontendBase}/inbox?connect=success&plugin=${result.plugin}';
        }
      </script><p>Connected! You can close this window.</p></body></html>
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return res.send(`
      <html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'CONNECT_ERROR', error: '${encodeURIComponent(msg)}' }, '${frontendBase}');
          window.close();
        } else {
          window.location.href = '${frontendBase}?connect=error&reason=${encodeURIComponent(msg)}';
        }
      </script><p>Error: ${msg}</p></body></html>
    `);
  }
});
