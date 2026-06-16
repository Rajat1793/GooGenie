/**
 * Phase A: Corsair SDK singleton.
 * Docs: https://docs.corsair.dev/getting-started/quick-start
 *
 * Multi-tenant: each user connects their own Gmail + Calendar.
 * All credentials encrypted with CORSAIR_KEK.
 * API calls scoped via corsair.withTenant(userId).
 *
 * Phase 8: token storage now backed by Postgres (pg.Pool), eliminating the
 * ephemeral-SQLite-on-Render bug. Corsair's createCorsair accepts
 * `Pool | BetterSqlite3Database | Sql | Kysely<...>` natively (see
 * node_modules/corsair/dist/db.d.ts CorsairDatabaseInput) so no custom
 * adapter is required — we pass the same pg.Pool used by Drizzle.
 */
import { createCorsair, setupCorsair } from "corsair";
import { gmail } from "@corsair-dev/gmail";
import { googlecalendar } from "@corsair-dev/googlecalendar";
import { Pool } from "pg";
import { env } from "../security/env";

export { setupCorsair };

const corsairPool = new Pool({
  connectionString: env.DATABASE_URL ?? process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Build the public URL Corsair uses for OAuth redirect / connect endpoints.
// Path is /api/v1/me/connect[/callback] under Next.js (was /v1/me/connect[/callback]
// under Express). See migration_plan.md Phase 8 step 44.
const baseHost = env.BACKEND_URL ?? "http://localhost:3000";

export const corsair = createCorsair({
  multiTenancy: true,
  // Cast plugins to `never[]` to defeat Corsair's overly strict zod schema
  // generic. The runtime shape is correct — verified against
  // node_modules/corsair/dist/index.d.ts. See migration_plan.md recheck §1.
  plugins: ([
    gmail({
      authType: "oauth_2",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credentials: ({
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      } as any),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credentials: ({
        clientId: env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      } as any),
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
    }),
  ] as never[]),
  database: corsairPool,
  kek: env.CORSAIR_KEK ?? "dev-fallback-kek-32chars-minimum-length",
  connect: {
    baseUrl: `${baseHost}/api/v1/me/connect`,
    redirectUri: `${baseHost}/api/v1/me/connect/callback`,
  },
});

export function isCorsairConfigured(): boolean {
  return Boolean(env.CORSAIR_KEK && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
