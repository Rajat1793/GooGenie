/**
 * Phase A: Corsair SDK singleton.
 * Docs: https://docs.corsair.dev/getting-started/quick-start
 *
 * Multi-tenant: each user connects their own Gmail + Calendar.
 * All credentials encrypted with CORSAIR_KEK.
 * API calls scoped via corsair.withTenant(userId).
 */
import { createCorsair, setupCorsair } from "corsair";
import { gmail } from "@corsair-dev/gmail";
import { googlecalendar } from "@corsair-dev/googlecalendar";
import { createRequire } from "node:module";
import { env } from "../security/env.js";

export { setupCorsair };

const _require = createRequire(import.meta.url);
// eslint-disable-next-line
const SqliteDatabase = _require("better-sqlite3") as (path: string) => unknown;

const db = SqliteDatabase(env.CORSAIR_DB_PATH);

export const corsair = createCorsair({
  multiTenancy: true,
  plugins: [
    gmail({
      authType: "oauth_2",
      credentials: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      },
      // Observability for incoming Gmail push notifications (Pub/Sub).
      // The actual cache-invalidation + SSE broadcast happens in the route
      // handler (routes/webhooks.ts) — this is just a log hook so we can see
      // payloads in the server console during development.
      webhookHooks: {
        messageChanged: {
          before(ctx, args) {
            // eslint-disable-next-line no-console
            console.log("[corsair:gmail:messageChanged] before", { tenantId: (ctx as { tenantId?: string }).tenantId });
            return { ctx, args };
          },
          after(_ctx, _response) {
            // eslint-disable-next-line no-console
            console.log("[corsair:gmail:messageChanged] after");
          },
        },
      },
    }),
    googlecalendar({
      authType: "oauth_2",
      credentials: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      },
      webhookHooks: {
        onEventChanged: {
          before(ctx, args) {
            // eslint-disable-next-line no-console
            console.log("[corsair:googlecalendar:onEventChanged] before", { tenantId: (ctx as { tenantId?: string }).tenantId });
            return { ctx, args };
          },
          after(_ctx, _response) {
            // eslint-disable-next-line no-console
            console.log("[corsair:googlecalendar:onEventChanged] after");
          },
        },
      },
    })
  ],
  database: db as never,
  kek: env.CORSAIR_KEK ?? "dev-fallback-kek-32chars-minimum-length",
  connect: {
    baseUrl: `${env.BACKEND_URL ?? "http://localhost:4000"}/v1/me/connect`,
    redirectUri: `${env.BACKEND_URL ?? "http://localhost:4000"}/v1/me/connect/callback`
  }
});

export function isCorsairConfigured(): boolean {
  return Boolean(env.CORSAIR_KEK && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
