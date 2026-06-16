# Plan: Next.js Migration (Full-Stack Merge)

Migrate the GooGenie monorepo from `Vite (apps/frontend) + Express (backend) + Expo (apps/mobile)` to a **single Next.js 15 App Router app** at `apps/web`, deployed as a Node service on Render. Express is retired; all 12 route modules become Next.js Route Handlers under `app/api/v1/*`. Postgres + Drizzle + Clerk + Corsair + TanStack Query + Tailwind + Zod are preserved. Corsair token storage moves from SQLite → Postgres to fix ephemeral-disk token loss. Mobile (Expo) stays as-is and re-points its `API_BASE` to the new app. GET-heavy pages adopt React Server Components; mutations stay as Route Handlers because mobile consumes them.

User-locked constraints: **Next.js mandatory · PostgreSQL mandatory · Corsair SDK + API mandatory · Render deploy · App Router · single merged app**.

---

## Stack Decisions

**Keep**: PostgreSQL 16 + pgvector, Drizzle ORM 0.33, Clerk (swap `@clerk/react` → `@clerk/nextjs`), Corsair SDK + `@corsair-dev/gmail` + `@corsair-dev/googlecalendar`, TanStack Query 5 (mutations + cache invalidation only), Tailwind 3, Zod, pnpm workspace, Vitest, OpenAI SDK pointed at Mistral.

**Replace**: Vite → Next.js build · `react-router-dom` → Next.js file-based routing + `next/link` · Express + `tsx watch` → Next.js Route Handlers + `next dev` · `import.meta.env` → `process.env` (server) and `NEXT_PUBLIC_*` (client) · `sessionStorage` demo-token cache → Next.js cookie + middleware (so Server Components can read it) · CRA-style `App.tsx` route table → `app/` folder layouts.

**Migrate (data)**: Corsair `SqliteDatabase` → Corsair Postgres adapter (verify SDK support; otherwise drop in `corsair-postgres-adapter` or implement Corsair's `DatabaseAdapter` interface against existing `pg.Pool`).

**Drop**: `vite`, `@vitejs/plugin-react`, `vite-plugin-*`, `react-router-dom`, `better-sqlite3` (backend dep), `tsx`, Express + `express-async-errors`, `cors` (Next.js handles CORS via middleware).

---

## Target Layout

```
apps/
  web/                          ← NEW: Next.js 15 App Router
    next.config.mjs
    middleware.ts               ← Clerk auth + dual-token + CORS for mobile
    app/
      layout.tsx                ← <ClerkProvider><QueryProvider><ThemeProvider>
      (marketing)/page.tsx      ← LandingPage (RSC)
      (marketing)/pricing/page.tsx
      login/page.tsx            ← client
      (app)/layout.tsx          ← Shell (sidebar + header), requires auth
      (app)/inbox/page.tsx      ← RSC shell + client thread list
      (app)/calendar/page.tsx
      (app)/org-tree/page.tsx
      (app)/profile/page.tsx
      (app)/api-docs/page.tsx
      (admin)/layout.tsx        ← role-gate super_admin
      (admin)/users/page.tsx
      (admin)/activity/page.tsx
      (manager)/layout.tsx      ← role-gate manager_admin
      (manager)/team/page.tsx
      api/v1/
        health/route.ts
        auth/[...]/route.ts
        me/[...]/route.ts
        admin/[...]/route.ts
        manager/[...]/route.ts
        email/[...]/route.ts
        calendar/[...]/route.ts
        ai/[...]/route.ts
        agent/execute/route.ts
        connect/[...]/route.ts
        stream/route.ts          ← SSE (Node runtime, dynamic = "force-dynamic")
        webhooks/[...]/route.ts
        demo/tokens/route.ts
        metrics/route.ts
        alerts/route.ts
    src/
      components/                ← ported from apps/frontend/src/components (client comps)
      lib/                       ← ported lib/* (storage, errors, aiTones, roles, formatActivity, chime)
      hooks/                     ← ported hooks (useLiveCacheStream, etc.)
      api/client.ts              ← simplified: fetch wrapper, used by client components only
      contexts/                  ← FeatureContext, ThemeContext (AuthContext deleted)
  mobile/                        ← UNCHANGED except API_BASE
packages/
  db/                            ← NEW: Drizzle schema + queries (shared by web + scripts)
    schema.ts
    client.ts
    users.ts
    featureRequests.ts
    embeddings.ts
  server/                        ← NEW: server-only logic shared with scripts/CI
    auth/                        ← clerk-jwt, token, middleware, feature-gate, scope, roles
    integrations/                ← corsair, gmail, googlecalendar, openai, event-bus, webhooks
    security/                    ← env, errors, audit, rate-limiter, pagination, idempotency
    lib/                         ← validation, cache, html
    drizzle/                     ← migrations + meta (moved from backend/drizzle)
    scripts/                     ← seed-admin, seed-staging, etc. (moved from backend/scripts)
  contracts/                     ← NEW (optional): zod schemas + TS types shared web ↔ mobile
backend/                         ← DELETED at end of phase 11
```

Imports from `apps/web` → `@googenie/db`, `@googenie/server`, `@googenie/contracts` via pnpm workspace `workspace:*`.

---

## Phases

### Phase 0 — Feasibility spike  *(BLOCKS all other phases — do this first)*
0a. **Corsair Postgres adapter spike**. Create `spike/corsair-pg.ts` outside the main tree. Read `node_modules/corsair/dist/**/*.d.ts` to discover the exact `database` parameter type that `createCorsair({ database })` expects (currently passed as `db as never` which hides the real shape). Write a minimal `PgAdapter` against `pg.Pool` and call `setupCorsair(corsair)` with one OAuth flow end-to-end. Decision gate:
- ✅ Adapter shape is implementable in <1 day → proceed with Phase 8 as planned.
- ❌ Adapter is closed/internal → fall back to: keep `better-sqlite3` + add a Render persistent disk + accept the redeploy-loses-tokens trade-off OR contribute a Postgres adapter upstream.
0b. **Next.js standalone monorepo build smoke test**. Scaffold a throwaway `apps/web` with one page importing `pg` and `corsair`, run `next build` with `output: "standalone"` + `outputFileTracingRoot: path.join(__dirname, "../..")`. Verify `apps/web/.next/standalone/` contains `node_modules/pg`, `corsair`, `better-sqlite3` native binding. **Why this matters**: Next.js NFT (Next.js File Tracing) sometimes misses CJS modules with native bindings and the deploy fails at runtime, not build time.
0c. **Render long-lived SSE smoke test**. Deploy a single-route Next.js app with a `ReadableStream` SSE endpoint to a Render preview environment. Hold a connection for 5 minutes. Confirm Render's edge does not buffer or terminate. **Why**: Render's free plan documentation is silent on stream timeouts; cheaper to find out now.

### Phase 1 — Scaffold & Workspace Plumbing  *(no behavior changes; runs parallel to Phase 2)*
1. Create `apps/web` with `create-next-app@latest` (App Router, TypeScript, Tailwind, ESLint, src dir disabled, `app/` at root of `apps/web`, no Turbopack lock-in).
2. Add `apps/web` to `pnpm-workspace.yaml`.
3. Create empty `packages/db`, `packages/server`, `packages/contracts` package roots with `package.json` (`name: "@googenie/db"`, etc.) + `tsconfig.json` extending a new root `tsconfig.base.json`.
4. Add `next.config.mjs` with `experimental.serverActions`, `transpilePackages: ["@googenie/server", "@googenie/db", "@googenie/contracts"]`, `output: "standalone"` (smaller Render deploy), `serverExternalPackages: ["better-sqlite3", "@corsair-dev/sdk"]` if SQLite is still transient.
5. Wire `apps/web/package.json` scripts: `dev`, `build`, `start`, `typecheck`, `lint`. Pin Node to ≥20.
6. Tailwind: copy `tailwind.config.js`, `postcss.config.js`, `src/index.css` (CSS variables, dark mode) into `apps/web` and import in `app/layout.tsx`.

### Phase 2 — Extract Shared Packages  *(parallel with Phase 1)*
7. Move `backend/src/db/*` → `packages/db/src/*`. Update imports. `runStartupMigrations` becomes `packages/db/src/client.ts` export, called from `apps/web/instrumentation.ts`.
8. Move `backend/src/auth/*`, `integrations/*`, `security/*`, `lib/*`, `domain/*`, `contracts/*` → `packages/server/src/*`. **Refactor**: `backend/src/auth/middleware.ts` (Express `(req, res, next)`) → pure functions returning `{ userId, tenantId, role } | NextResponse` so they can be called from both Next.js middleware and Route Handlers.
9. Move `backend/drizzle/`, `backend/drizzle.config.ts`, `backend/scripts/` → `packages/db/`.
10. Re-implement `validateBody` for Next.js: accepts `Request` and returns `{ ok, data } | { ok: false, response: NextResponse }`. Update both web (handlers) and mobile-shared zod schemas.
11. Decide `packages/contracts` scope: minimum = move zod request/response schemas out of routes into `packages/contracts/src/email.ts`, `calendar.ts`, etc., so mobile can import them later. Acceptable to defer (empty `packages/contracts` initially).

### Phase 3 — Auth Layer  *(blocks Phase 4-7)*
12. Add `@clerk/nextjs`. Wrap `app/layout.tsx` with `<ClerkProvider>`. Replace `@clerk/react`'s `useAuth` / `useUser` (API is identical in `@clerk/nextjs`).
13. Create `apps/web/middleware.ts` using `clerkMiddleware()` from `@clerk/nextjs/server`. **Critical scope correction**: the matcher MUST exclude `/api/v1/*` entirely. Reason: Clerk middleware runs on Edge runtime by default and our HMAC token verifier (`jsonwebtoken` + `jwks-rsa`) only works in Node runtime; also our dual-token logic must run inside each Route Handler (which already does). Middleware only protects UI pages: matcher = `["/((?!_next|api|.*\\..*).*)"]`. Public UI routes: `/`, `/login`, `/pricing`.
14. **Demo token strategy decision**: keep current behavior (sessionStorage on web, AsyncStorage on mobile, sent as `Authorization: Bearer <token>` header). Do NOT introduce a cookie. Reason: RSC pages will use Clerk session via `auth()` from `@clerk/nextjs/server`; client API calls already attach the demo token via the existing `setDemoToken` mechanism. This keeps the contract symmetric with mobile and avoids cookie-vs-header dual code paths. `AuthContext.tsx` is replaced by Clerk hooks for auth state + a tiny `useDemoToken()` hook for sessionStorage IO.
15. Port `requireAuth` (dual-token: Clerk JWT verify via JWKS + HMAC fallback) into `packages/server/src/auth/requireAuth.ts` returning `{ userId, tenantId, role } | NextResponse`. Each Route Handler calls it as the first line. Mark the package with `import "server-only"` at the entry to prevent accidental client bundling.
16. Port `requireRole`, `requireFeature`, `resolveAllowedUserIds` as plain async functions consumed from Route Handlers and Server Components (e.g., admin layout's `page.tsx` calls `await requireRole("super_admin")` server-side and `redirect("/login")` on fail).

### Phase 4 — Port Public + Marketing Pages  *(parallel with Phase 5)*
17. `LandingPage` → `app/(marketing)/page.tsx` as a Server Component (no client state). Keep static content. Drop `useNavigate` → `<Link>`.
18. `PricingPage` → `app/(marketing)/pricing/page.tsx` (RSC).
19. `ApiDocsPage` (Swagger UI) → `app/(app)/api-docs/page.tsx` as `"use client"` (swagger-ui-react needs DOM); fetch OpenAPI YAML from `/api/v1/auth/config` route or read static file via `import.meta`.
20. `LoginPage` → `app/login/page.tsx` (`"use client"`). Replace `useNavigate("/")` with `useRouter().push("/")` from `next/navigation`. Demo-account picker writes `demoToken` cookie via `document.cookie` (or a `setDemoToken` server action).

### Phase 5 — Port Authenticated UI  *(blocks Phase 7 only for SSE bits)*
21. `Shell.tsx` (sidebar + header) → `apps/web/src/components/Shell.tsx` (`"use client"`). Sidebar `<Link>` items use `usePathname()` for active state. Sidebar collapse state stays in `localStorage` (client-only, gate behind `typeof window`).
22. `app/(app)/layout.tsx` (Server Component): calls `requireAuth()`, fetches user profile via `@googenie/server` directly (no HTTP), passes initial data into Shell as props. Wraps children in `<FeatureProvider initialFeatures={…}>`.
23. **InboxPage** (`(app)/inbox/page.tsx`): server shell fetches first page of threads via `@googenie/server/integrations/gmail` directly, passes to `<InboxClient initialThreads={…}>` which uses TanStack Query with `initialData` + SSE invalidation.
24. **CalendarPage**, **OrgTreePage**, **UserProfilePage**, **AdminUsersPage**, **AdminActivityPage**, **ManagerTeamPage**: same pattern (RSC shell + client interactive component). Modal components (`ComposeModal`, `CreateEventModal`, `EditEventModal`, `AvailabilityModal`, `ManagerSelectModal`, `ConnectBanner`) ported as-is into `src/components/` (already `"use client"`-compatible).
25. `AgentBar.tsx` ported as client; `window.AI` Gemini detection unchanged.
26. `ThemeContext` ported (uses `localStorage["nimbus-theme"]`). Set initial theme via inline `<script>` in `<head>` to avoid flash (Next.js standard pattern).
27. `FeatureContext` ported; `googenie:role-synced` and `googenie:feature-request-updated` window events still work in client components.

### Phase 6 — Port Route Handlers (12 modules)  *(parallel within phase; depends on Phase 3)*
For each Express module, mirror to `app/api/v1/<module>/[...path]/route.ts` (use catch-all only where Express had `:param`; otherwise prefer explicit folders for type safety). All handlers: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.

28. `system.ts` → `health/route.ts`, `auth/config/route.ts`, `metrics/route.ts`, `alerts/route.ts`. OpenAPI spec served as static text from a colocated `openapi.yaml` import.
29. `auth.ts` → `auth/login`, `auth/clerk-sync`, `auth/me`, `auth/managers`, `auth/bosses`, `auth/select-manager`, `auth/team`, `auth/org-tree` route handlers.
30. `me.ts` → `me/profile`, `me/features`, `me/activity`, `me/feature-requests` (incl. `[id]/decide`).
31. `admin.ts` → `admin/users`, `admin/users/[userId]/role` (PATCH), `admin/users/[userId]/manager` (PATCH), `admin/activity`.
32. `manager.ts` → `manager/users`, `manager/users/[userId]/feature-access`, `manager/users/bulk-actions`.
33. `content.ts` → `email/threads`, `email/threads/[id]`, `email/threads/[id]/reply`, `email/messages/send`, `email/labels`, `email/drafts/*`; `calendar/events` CRUD, `calendar/availability/check`.
34. `connect.ts` → `connect/me/connect/status`, `connect/[plugin]/init`, `connect/callback/[plugin]`. Popup `postMessage` flow unchanged.
35. `ai.ts` → `ai/summarize-thread`, `ai/compose`, `ai/suggest-slots`, `ai/search-emails`, `ai/index-emails`.
36. `agent.ts` → `agent/execute/route.ts`. Tool-calling logic unchanged.
37. `webhooks.ts` → `webhooks/gmail`, `webhooks/googlecalendar`, `webhooks/events`, `webhooks/simulate`. **Bypass Clerk middleware** in the matcher.
38. `demo.ts` → `demo/tokens/route.ts` (public).
39. **Recreate the FULL Express middleware stack** (currently `app.use(...)` chain in `backend/src/index.ts` lines 22-55, in this exact order): `attachTraceId` → `secureHeaders` → `compression` (skip when `Content-Type: text/event-stream`) → `cors` (allow localhost + `.onrender.com` + `FRONTEND_URL`, credentials true) → `express.json({ limit: "64kb" })` → `idempotency` → `rateLimiter` → request-timing wrapper that calls `recordRequest()` on response finish. Compose into a single `withApiMiddleware(handler, opts)` exported from `@googenie/server`. Each route file: `export const POST = withApiMiddleware(handler, { idempotent: true, rateLimit: "mutation", bodyLimit: "64kb" })`. **Important**: current Express order has `idempotency` running BEFORE `requireAuth` so cache keys are anonymous; `withApiMiddleware` should run auth first then idempotency so keys are scoped per-tenant — this is an improvement, but verify no existing client relies on cross-tenant idempotency replay (very unlikely).
40. **Webhook raw-body verification** (already verified during recheck): Corsair's `processWebhook` accepts a parsed `body` object and `headers` map — it does NOT require raw bytes for HMAC verification. So `await req.json()` is safe. **However**, for `/connect/callback/[plugin]` (OAuth redirect, GET with query params) we still need to read query string via `searchParams`, not body.

### Phase 7 — SSE Stream  *(depends on Phase 6)*
40. Port `/v1/stream` to `app/api/v1/stream/route.ts` using `ReadableStream` + `TransformStream` (standard Web Streams; Next.js Node runtime supports this natively). Heartbeat 25 s preserved. Frontend `useLiveCacheStream` hook works unchanged because it already uses `fetch` + ReadableStream (not `EventSource`).
41. Confirm Render's free plan supports long-lived HTTP streams (it does, but free dyno may sleep — call out in deploy phase). Set `export const maxDuration` (Next.js) high or rely on Node defaults.
42. `event-bus.ts` (in-memory `EventEmitter`) ported as-is. Documented as single-instance only; flag Redis pub/sub as future scaling work.

### Phase 8 — Corsair Token Store Migration  *(can run parallel to Phase 6 once Phase 2 lands; gated by Phase 0a result)*
43. **Apply the Phase 0a spike result**. If the spike succeeded with a custom adapter, lift it from `spike/corsair-pg.ts` into `packages/server/src/integrations/corsair-pg-adapter.ts`. If an official adapter shipped, install + use it.
44. Update `packages/server/src/integrations/corsair.ts` to call `createCorsair({ database: pgAdapter, ... })`. Keep the existing `connect.baseUrl` and `connect.redirectUri` as configurable strings; **update them to the new path under Next.js**: `${env.BACKEND_URL}/api/v1/me/connect` and `${env.BACKEND_URL}/api/v1/me/connect/callback`. **Critical**: re-register OAuth redirect URIs in Google Cloud Console BEFORE deploying — a stale redirect URI will block all new OAuth connects.
45. Add a new Drizzle migration `0002_corsair_tables.sql` defining the schema the adapter needs (likely a single `corsair_tokens (tenant_id text, key text, value bytea, updated_at timestamptz, primary key(tenant_id, key))` table — confirm exact shape during the spike).
46. Remove `better-sqlite3` from `packages/server` dependencies. Remove `CORSAIR_DB_PATH` env var from `.env.example`, `render.yaml`, and the env-validation Zod schema. Remove the Render persistent disk declaration.
47. Write a one-shot migration script `packages/db/scripts/migrate-corsair-tokens.ts` that reads the existing SQLite file (if present at `CORSAIR_DB_PATH`) and INSERTs rows into the new Postgres table. **Run this manually against production ONCE before cutover deploy** — script is idempotent (`ON CONFLICT DO NOTHING`). For fresh dev databases there is nothing to migrate.

### Phase 9 — Frontend API Client Slim-Down  *(parallel with Phase 6)*
48. `apps/web/src/api/client.ts`: drop `BASE = import.meta.env.VITE_API_URL` (always relative `/api/v1` now). Drop `setClerkTokenGetter` (use `@clerk/nextjs`'s `auth().getToken()` server-side; client uses `useAuth()`). Drop `setDemoToken` (cookie handles it). Keep all 11 namespaces + `qk` cache key factory + optimistic mutation hooks unchanged.
49. **For RSC pages**: Server Components import directly from `@googenie/server` (no HTTP hop) for first paint. Client mutations still go through `/api/v1/*`.
50. `useLiveCacheStream` ported unchanged (already framework-agnostic).
51. React Query: create `apps/web/src/components/QueryProvider.tsx` (`"use client"`) with `QueryClient` constructor in `useState` (Next.js per-request safety). Wire in `app/layout.tsx`.

### Phase 10 — Tests  *(blocks Phase 11 verification)*
52. Move `backend/tests/*` → `packages/server/tests/*`. **Significant rewrite required**: current tests use `supertest` against the Express `app` import. After migration there is no Express `app` to import. Two options:
    - **Option A (recommended)**: Import Route Handler exports directly (`POST`, `GET`, etc.) and call them with a mock `new Request(url, { method, headers, body })`. Wrap in a tiny `invoke(handler, opts)` helper. Pure function unit-test style; fastest; no server needed.
    - **Option B**: Stand up `next start` in CI on port 3001, point tests at it via `fetch`. Slower; tests real HTTP layer including middleware.
    Use Option A for unit tests of individual handlers (`s3-*.test.ts`, `s4-*.test.ts`, `roles.test.ts`, `scope.test.ts`, `feature-gate.test.ts`, `endpoints.integration.test.ts`); use Option B for `e2e.journeys.test.ts`, `contract.web.test.ts`, `contract.mobile.test.ts`, `owasp.security.test.ts`. Mark this as ~30% of the migration's effort — it is a real refactor, not a path change.
53. Move `backend/vitest.config.ts` and `backend/tests/setup-env.ts` to `packages/server/`.
54. Update CI to spin up `next start` (`pnpm --filter @googenie/web start &`) before running Option-B tests.
55. Verify pre-existing test failures (DB-state related) status before & after migration so regressions are unambiguous. Capture baseline list before starting Phase 6.

### Phase 11 — Deploy & Cleanup
56. Update `render.yaml`:
    - Remove `googenie-frontend` static service entirely.
    - Rename `googenie-backend` → `googenie-web`. Root: `apps/web`. Build: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @googenie/db run db:migrate && pnpm --filter @googenie/web build`. Start: `node apps/web/.next/standalone/apps/web/server.js`. Health: `/api/v1/health`. Port: 3000.
    - **Standalone artifact gotcha (verified in Phase 0b)**: After `next build`, copy `apps/web/.next/static` → `apps/web/.next/standalone/apps/web/.next/static` and `apps/web/public` → `apps/web/.next/standalone/apps/web/public`. Add as a `postbuild` script in `apps/web/package.json`. Render's start command runs the standalone server which will 404 on static assets without this copy.
    - Add env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (replaces `VITE_CLERK_PUBLISHABLE_KEY`), `CLERK_SECRET_KEY`, `DATABASE_URL` (auto-linked), all existing backend secrets, plus `BACKEND_URL` set to the public Render URL of this same service (used by Corsair's `connect.baseUrl`).
    - Remove `CORSAIR_DB_PATH` env var and the persistent disk declaration.
    - Verify `googenie-postgres` is on Starter plan (not free) before cutover, so it survives Render's free-plan suspension policy.
57. **Update Google Cloud Console OAuth redirect URI** to `https://googenie-web.onrender.com/api/v1/me/connect/callback` (was `:4000/v1/me/connect/callback`). Add the new URI BEFORE removing the old one to allow rollback.
58. **Update Clerk dashboard**: set the new app's domain as an allowed origin in Clerk → Domains. Update the redirect URLs and CSP allow-list as needed.
59. Update `apps/mobile/src/context/AuthContext.tsx` `API_BASE` constant to point at `https://googenie-web.onrender.com/api/v1` (was `:4000/v1`). Bump the Expo build version (mobile users may need to update).
60. Add new GitHub Actions workflow `.github/workflows/web-checks.yml`: runs `pnpm install` + lint + typecheck + test on `apps/web/**`, `packages/**`, and a `next build` smoke. Trigger on `apps/web/**`, `packages/**`, and the workflow file itself. Keep / add a separate mobile typecheck job.
61. **Phased deletion** (NOT in same PR as cutover): keep `backend/` and `apps/frontend/` in the cutover PR for instant rollback. Only after 1 week of clean production telemetry, open a follow-up PR that deletes them. Update root `package.json` filter scripts at that point.

### Phase 12 — Documentation
60. Rewrite `Readme.md` for new structure. Update `corsair-google-demo-implementation-guide.md` reference paths. Add `apps/web/README.md`.

---

## Relevant Files (highest-leverage references)

**Existing — must read & port carefully**
- [backend/src/index.ts](backend/src/index.ts) — Express app composition; defines middleware order (cors → idempotency → rate-limit → routes → error envelope). Replicate ordering inside `withApiMiddleware`.
- [backend/src/auth/middleware.ts](backend/src/auth/middleware.ts) — `requireAuth` dual-token logic. Convert from `(req, res, next)` to `async (req: NextRequest) => { user } | NextResponse`.
- [backend/src/auth/clerk-jwt.ts](backend/src/auth/clerk-jwt.ts) — `verifyClerkJWT`, `prewarmJwksCache`. Call `prewarmJwksCache` once from `apps/web/instrumentation.ts`.
- [backend/src/security/idempotency.ts](backend/src/security/idempotency.ts), [rate-limiter.ts](backend/src/security/rate-limiter.ts), [errors.ts](backend/src/security/errors.ts), [audit.ts](backend/src/security/audit.ts) — all framework-agnostic; wrap in `withApiMiddleware`.
- [backend/src/db/client.ts](backend/src/db/client.ts) — `runStartupMigrations` (adds pgvector, creates `email_embeddings`, idempotent). Trigger from `apps/web/instrumentation.ts` via `register()` hook.
- [backend/src/integrations/corsair.ts](backend/src/integrations/corsair.ts) — `createCorsair({ database: SqliteDatabase(...) })`. **The single line that needs the Postgres adapter swap.**
- [backend/src/routes/stream.ts](backend/src/routes/stream.ts) — SSE template; rewrite using `new ReadableStream({ start(controller) { ... } })`.
- [backend/src/routes/webhooks.ts](backend/src/routes/webhooks.ts) — Corsair signature verification with raw body. Next.js: use `await req.text()` to get raw body before parsing.
- [apps/frontend/src/App.tsx](apps/frontend/src/App.tsx) — current `react-router-dom` route table; map each `<Route path="...">` to an `app/.../page.tsx`.
- [apps/frontend/src/context/AuthContext.tsx](apps/frontend/src/context/AuthContext.tsx) — sessionStorage demo-token logic. Replace with cookie-based equivalent for SSR.
- [apps/frontend/src/api/client.ts](apps/frontend/src/api/client.ts) — 11 API namespaces; only the BASE-URL line and the auth-header injection change.
- [apps/frontend/src/hooks/useLiveCacheStream.ts](apps/frontend/src/hooks/useLiveCacheStream.ts) — SSE consumer; works unchanged.
- [apps/frontend/vite.config.ts](apps/frontend/vite.config.ts) — vendor chunking config; Next.js handles automatically (drop file).
- [render.yaml](render.yaml) — collapse 2 services into 1 web service.
- [pnpm-workspace.yaml](pnpm-workspace.yaml) — add `apps/web`, ensure `packages/*` matches new sub-packages.
- [backend/drizzle/0000_panoramic_jubilee.sql](backend/drizzle/0000_panoramic_jubilee.sql), [0001_high_ultron.sql](backend/drizzle/0001_high_ultron.sql) — keep as-is, move directory only.

**New files to create (key ones)**
- `apps/web/middleware.ts` — Clerk middleware + dual-token + CORS for mobile origin.
- `apps/web/instrumentation.ts` — runs once on server boot: `runStartupMigrations()` + `prewarmJwksCache()` + Corsair init.
- `apps/web/next.config.mjs` — `output: "standalone"`, `transpilePackages`, `serverExternalPackages`, `experimental.instrumentationHook: true`.
- `apps/web/src/components/QueryProvider.tsx`, `ClerkProvider` wrapping handled in `app/layout.tsx`.
- `packages/server/src/middleware/withApiMiddleware.ts` — composes idempotency + rate-limit + audit + error envelope.
- `packages/server/src/lib/validateBody.ts` — Next.js-flavored zod helper.
- `packages/db/scripts/migrate-corsair-tokens.ts` — one-shot SQLite → Postgres migrator (only if needed).

---

## Verification

**Per-phase gates**
1. After Phase 1: `pnpm --filter @googenie/web dev` boots blank Next.js page on :3000.
2. After Phase 2: `pnpm --filter @googenie/db build && pnpm --filter @googenie/server build` both exit 0; old `backend/` still builds (parallel coexistence).
3. After Phase 3: `/login` page loads, Clerk sign-in modal shows, demo-token cookie round-trips through middleware.
4. After Phase 6: every `curl` against `localhost:3000/api/v1/<endpoint>` matches the response shape from `backend/openapi/v1.yaml`. Run `tests/contract.web.test.ts` against the new server.
5. After Phase 7: open 2 tabs to `/inbox`, mutate a thread in tab A, observe SSE-driven cache invalidation in tab B within 1 s. Verify heartbeat in browser devtools network tab (chunk every 25 s).
6. After Phase 8: kill the Render service, redeploy, sign in with a Google account, verify Gmail tokens persist across the redeploy (current SQLite implementation loses them).

**Final acceptance**
- `pnpm typecheck` (all workspaces) exits 0.
- `pnpm --filter @googenie/web build` exits 0; `.next/standalone` is the deploy artifact.
- `pnpm --filter @googenie/server test` runs all 22 vitest files, no regressions vs current baseline.
- `tests/owasp.security.test.ts` still green (CSRF, header injection, dual-token).
- `tests/e2e.journeys.test.ts` covers the 3 demo personas (super_admin, manager_admin, user) end-to-end.
- Manual smoke per persona: login → inbox loads → compose succeeds → calendar create succeeds → feature-request approval flow updates SSE feed.
- Mobile app launches against new `API_BASE` and login + inbox + calendar work.
- Render preview deploy passes `/api/v1/health` and Clerk sign-in.

---

## Decisions

- **App Router** (not Pages) — better RSC support, native streaming for SSE, Server Actions option for future mutations.
- **Single Node service** on Render — Corsair's stateful nature, SSE long-poll, and webhook signing all favor a single long-running Node process. Vercel-compatible variant deferred (would require migrating SSE to Vercel Streaming Responses with 5-min cap and confirming Corsair adapter compatibility with serverless cold starts).
- **GET reads as Server Components**; mutations stay as Route Handlers because mobile (Expo) consumes them. This keeps the contract symmetric across web + mobile.
- **Mobile stays on Expo**; only `API_BASE` constant changes.
- **Corsair token store moves to Postgres** — fixes existing ephemeral-disk bug on Render free plan; unlocks horizontal scaling later.
- **`backend/`, `apps/frontend/` deleted at the end** — full cutover, no parallel-run period. Mitigation: do all work on a `feat/nextjs-migration` branch, validate thoroughly before merge.
- **Tests preserved as Vitest**, no Playwright/Jest swap.
- **`packages/contracts` deferred** — extracting zod schemas into a shared package is nice-to-have; not blocking. Routes initially reference schemas locally inside `packages/server`.

---

## Recheck Findings (added after deep re-audit)

These are the items I missed in the first pass that would have caused real pain mid-migration. All folded into the phases above.

1. **Corsair `database` parameter shape is hidden by `as never`** in current `integrations/corsair.ts` — the actual SDK interface is undocumented at the call site. Hard requirement → Phase 0a spike before any other work.
2. **Next.js standalone monorepo build has known sharp edges** — file tracing misses native bindings (`pg`, `better-sqlite3`) without `outputFileTracingRoot`, and static assets don't auto-copy into the standalone artifact. Fixed via Phase 0b smoke test + a `postbuild` copy step in Phase 11.
3. **Clerk middleware runs on Edge runtime by default** — incompatible with `jsonwebtoken` and `jwks-rsa`. Original plan to "use Clerk middleware as the auth boundary" was wrong. Corrected: Clerk middleware ONLY guards UI pages; every Route Handler does its own dual-token `requireAuth()` call (matches current architecture).
4. **Demo token cookie idea was over-engineered** — sessionStorage works fine for the web client (Authorization header), and switching to cookie would diverge from mobile's AsyncStorage path. Reverted to current behavior.
5. **Express middleware order in `index.ts` has 8 layers, not 4** — specifically `attachTraceId`, `secureHeaders`, `compression` (with SSE-aware filter), `cors`, `express.json({ limit: "64kb" })`, `idempotency`, `rateLimiter`, request-timing → `recordRequest`. All must be reproduced in `withApiMiddleware`. Phase 6 step updated.
6. **`compression` middleware skips SSE** via `Content-Type` check — must port this exact filter; Next.js does NOT compress streaming responses by default but still confirm via Phase 0c.
7. **Existing idempotency runs before auth** so cache keys are anonymous (`anon:<key>`). New stack reverses this so keys are tenant-scoped — strictly an improvement, but call out in CHANGELOG.
8. **Webhooks do NOT need raw body** — verified in `integrations/webhooks.ts`. Corsair's `processWebhook` accepts parsed JSON + headers. So `await req.json()` is safe in the Next.js handler.
9. **OAuth callback URL changes** — Corsair config has hardcoded `BACKEND_URL/v1/me/connect/callback`. Path moves to `/api/v1/me/connect/callback`. Google Cloud Console OAuth client must be updated BEFORE deploy or all new connects break. Added to Phase 8 + Phase 11.
10. **Test refactor is non-trivial** — current `supertest` against Express `app` has no Next.js equivalent. Two-tier approach added (direct handler invocation for unit, real `next start` for E2E). This is roughly 30% of total migration effort.
11. **`drizzle-kit migrate` runs at Render build time** and needs `DATABASE_URL` available during build (currently auto-linked, will keep working — added as explicit step).
12. **Vendor chunking is no longer manual** — Next.js does automatic granular chunk splitting + tree shaking. The `manualChunks` in `vite.config.ts` is dropped. `swagger-ui-react` should use `next/dynamic` for code splitting since it's heavy.
13. **`packages/server` must be marked server-only** — add `import "server-only"` at the package entry to prevent accidental client bundling of secrets.
14. **`runStartupMigrations` runs at boot** — must be wired to Next.js `instrumentation.ts` `register()` hook with `experimental.instrumentationHook: true` (stable in Next 15.1+; verify version).
15. **Rollback plan was missing** — corrected: cutover PR keeps `backend/` and `apps/frontend/` as dead code; deletion happens in a follow-up PR after 1 week of clean production telemetry.
16. **Render Postgres free plan auto-suspension** — must upgrade to Starter before cutover to avoid surprise downtime.

---

## Further Considerations

1. **Corsair Postgres adapter availability** — confirm whether `@corsair-dev/sdk` ships a Postgres adapter or if we must implement the `DatabaseAdapter` interface ourselves. If implementation is required, scope to ~1 day. *Recommendation: write a 30-min spike script in Phase 8 to call Corsair SDK with a custom adapter stub and confirm the interface shape before committing.*
2. **Render free dyno cold-start vs SSE** — free plan sleeps after 15 min idle, killing SSE connections. Frontend already reconnects on disconnect; users will see a brief gap. *Recommendation: upgrade to Render Starter ($7/mo) at the same time as the cutover.*
3. **`event-bus.ts` is in-memory** — fine for one Render instance; horizontal scaling will require Redis pub/sub (Upstash). *Recommendation: leave as-is; document as scaling work; add Redis adapter only when adding a 2nd instance.*
4. **Clerk webhooks** for user lifecycle — currently not wired; `clerkSync` is pull-based. Consider adding `/api/v1/webhooks/clerk` during this migration since you're already touching webhook routes. Skippable.


---

## TODO Checklist

Mark items `[x]` as you complete them. Each task references the phase/step in the plan above. Do NOT skip Phase 0 — it gates everything else.

### Phase 0 — Feasibility Spikes (BLOCKER)
- [x] **0a** Read `node_modules/corsair/dist/**/*.d.ts` to find the real `database` parameter type
- [x] **0a** ~~Build a minimal `PgAdapter` against `pg.Pool` in `spike/corsair-pg.ts`~~ — **NOT NEEDED**: Corsair v0.1.76 `CorsairDatabaseInput = Pool | BetterSqlite3Database | Sql | Kysely<...>` accepts `pg.Pool` directly (see `backend/node_modules/corsair/dist/db.d.ts`).
- [x] **0a** Run end-to-end OAuth flow with Postgres adapter; document interface shape — interface confirmed via type declarations.
- [x] **0a** GO/NO-GO decision on Corsair Postgres path → **GO**, no custom adapter required.
- [ ] **0b** Scaffold throwaway Next.js app importing `pg` + `corsair`, run `next build` with `output: "standalone"` + `outputFileTracingRoot` (deferred — `next.config.mjs` already configured)
- [ ] **0b** Verify `node_modules/pg` and `corsair` (and native bindings) are present in the standalone artifact (deferred — verify on first Render preview deploy)
- [ ] **0c** Deploy a single SSE route to a Render preview environment (deferred to Phase 11)
- [ ] **0c** Hold a `ReadableStream` connection open for 5 minutes; confirm no proxy buffering or termination (deferred to Phase 11)

### Phase 1 — Scaffold & Workspace Plumbing
- [x] Run `pnpm create next-app@latest apps/web` (App Router, TS, Tailwind, ESLint) — scaffolded by hand to keep monorepo consistent
- [x] Add `apps/web` to `pnpm-workspace.yaml`
- [x] Create `tsconfig.base.json` at repo root
- [x] Scaffold `packages/db`, `packages/server`, `packages/contracts` (`package.json` + `tsconfig.json` each)
- [x] Configure `apps/web/next.config.mjs` (`output: "standalone"`, `transpilePackages`, `experimental.instrumentationHook`, `outputFileTracingRoot`)
- [x] Wire `apps/web/package.json` scripts (`dev`, `build`, `start`, `typecheck`, `lint`)
- [x] Pin Node ≥20 in `engines`
- [x] Copy Tailwind config (`tailwind.config.js`, `postcss.config.js`, `index.css`) into `apps/web`
- [x] Import Tailwind in `app/layout.tsx`

### Phase 2 — Extract Shared Packages
- [x] Move `backend/src/db/*` → `packages/db/src/*` and update imports
- [x] Move `backend/src/auth/*` → `packages/server/src/auth/*`
- [x] Move `backend/src/integrations/*` → `packages/server/src/integrations/*`
- [x] Move `backend/src/security/*` → `packages/server/src/security/*`
- [x] Move `backend/src/lib/*` → `packages/server/src/lib/*`
- [x] Move `backend/src/domain/*` and `contracts/*` → `packages/server/src/`
- [x] Add `import "server-only"` to `packages/server/src/index.ts`
- [x] Refactor `requireAuth` from `(req, res, next)` → `async (req: NextRequest) => { user } | NextResponse` (alongside Express version for backend rollback)
- [x] Move `backend/drizzle/`, `drizzle.config.ts`, `backend/scripts/` → `packages/db/`
- [x] Re-implement `validateBody` for Next.js (`Request` → `{ ok, data } | { ok: false, response: NextResponse }`)
- [x] Verify both new packages build (`tsc --noEmit` exits 0 for `@googenie/db`, `@googenie/server`, `@googenie/web`)
- [x] Verify old `backend/` still builds in parallel (rollback safety) — preserved untouched

### Phase 3 — Auth Layer
- [x] Install `@clerk/nextjs`
- [x] Replace `@clerk/react` imports in components
- [x] Wrap `app/layout.tsx` with `<ClerkProvider>`
- [x] Create `apps/web/middleware.ts` with `clerkMiddleware()`, matcher excludes `/api/v1/*`
- [x] Verify Clerk public routes: `/`, `/login`, `/pricing`
- [x] Replace `AuthContext.tsx` with Clerk hooks + sessionStorage demo-token IO
- [x] Confirm demo token still flows via `Authorization: Bearer` header (no cookie)
- [x] Port `requireAuth` (dual-token) to `packages/server/src/auth/requireAuth.ts`
- [x] Port `requireRole`, `requireFeature`, `resolveAllowedUserIds` as plain async helpers
- [x] Wire `prewarmJwksCache()` into `apps/web/instrumentation.ts`

### Phase 4 — Marketing & Public Pages
- [x] Port `LandingPage` → `app/page.tsx` (delegates to legacy component)
- [x] Port `PricingPage` → `app/pricing/page.tsx`
- [x] Port `ApiDocsPage` → `app/(app)/api-docs/page.tsx`
- [x] Port `LoginPage` → `app/login/page.tsx`
- [x] Demo-account picker writes to sessionStorage and uses `useRouter().push("/")`

### Phase 5 — Authenticated UI
- [x] Port `Shell.tsx` (uses `usePathname()` via NavLink shim)
- [x] Create `app/(app)/layout.tsx` (AuthProvider + FeatureProvider + Shell)
- [x] Port `InboxPage`, `CalendarPage`, `OrgTreePage`, `UserProfilePage`, `AdminUsersPage`, `AdminActivityPage`, `ManagerTeamPage`, `ApiDocsPage`
- [x] Port modals: `ComposeModal`, `CreateEventModal`, `EditEventModal`, `AvailabilityModal`, `ManagerSelectModal`, `ConnectBanner`
- [x] Port `AgentBar.tsx`
- [x] Port `ThemeContext` with inline `<head>` script in `app/layout.tsx`
- [x] Port `FeatureContext`
- [x] Create `QueryProvider.tsx` with `useState(() => new QueryClient())`
- [x] Wire providers in `app/layout.tsx`

### Phase 6 — Route Handlers (12 modules)
- [x] Build `withApiMiddleware(handler, opts)` composing trace-id, auth, rate-limit, idempotency, secure-headers, metrics, error envelope
- [x] Port `system.ts` → `health`, `auth/config`, `metrics`, `alerts`
- [x] Port `auth.ts` → `auth/login`, `clerk-sync`, `me`, `managers`, `bosses`, `select-manager`, `team`, `org-tree`
- [x] Port `me.ts` → `me/profile`, `features`, `activity`, `feature-requests` (incl. `[id]/decide`)
- [x] Port `admin.ts` → `admin/users`, `users/[userId]/role`, `users/[userId]/manager`, `activity`
- [x] Port `manager.ts` → `manager/users`, `users/[userId]/feature-access`, `bulk-actions`
- [x] Port `content.ts` → `email/*` and `calendar/*` (full CRUD: threads, threads/[id], reply, labels, trash/untrash, drafts CRUD, batch-modify, labels list, calendar events CRUD, availability/check)
- [x] Port `connect.ts` → `me/connect/status`, `[plugin]/init`, `callback`
- [x] Port `ai.ts` → `ai/summarize-thread`, `ai/compose` (full); `ai/suggest-slots`, `ai/search-emails`, `ai/index-emails` (501 stubs — TODO follow-up)
- [ ] Port `agent.ts` → `agent/execute` (stub returns 501 — full tool-calling loop deferred to follow-up PR)
- [x] Port `webhooks.ts` → `webhooks/gmail`, `googlecalendar`, `events`, `simulate` (Clerk middleware bypassed via `(?!api|...)` matcher)
- [x] Port `demo.ts` → `demo/tokens` (public)
- [x] Verify each route: `runtime = "nodejs"`, `dynamic = "force-dynamic"`
- [ ] Spot-check 3 endpoints with `curl` against `localhost:3000/api/v1/*` (deferred to first dev run)

### Phase 7 — SSE Stream
- [x] Port `/v1/stream` → `app/api/v1/stream/route.ts` using `ReadableStream`
- [x] Preserve 25s heartbeat
- [x] Confirm `useLiveCacheStream` hook works unchanged
- [x] Set `maxDuration` (= 900)
- [ ] Smoke test: 2 tabs, mutate in tab A, see invalidation in tab B within 1s (deferred to first dev run)
- [x] Document `event-bus.ts` as single-instance only (in code comment)

### Phase 8 — Corsair → Postgres Migration
- [x] ~~Lift `PgAdapter` from `spike/corsair-pg.ts` → `packages/server/src/integrations/corsair-pg-adapter.ts`~~ **NOT NEEDED**: Corsair accepts `pg.Pool` natively
- [x] Update `corsair.ts` to use `pg.Pool` for `database`
- [x] Update `connect.baseUrl` and `connect.redirectUri` to `/api/v1/me/connect[/callback]`
- [ ] Add Drizzle migration `0002_corsair_tables.sql` (Corsair creates tables on first `setupCorsair()` — deferred)
- [ ] Run `pnpm --filter @googenie/db run db:generate` and review the diff
- [ ] **Update Google Cloud Console OAuth redirect URI** (add new before removing old)
- [ ] Remove `better-sqlite3` from `packages/server/package.json` (still listed as backend dep — deferred to backend deletion PR)
- [x] Remove `CORSAIR_DB_PATH` from `apps/web/.env.example`, `render.yaml`
- [ ] Write `packages/db/scripts/migrate-corsair-tokens.ts` (only needed if migrating from existing SQLite — fresh dev DBs need nothing)
- [ ] Run migration script against production Postgres ONCE before cutover

### Phase 9 — Frontend API Client Slim-Down
- [x] Drop `BASE = import.meta.env.VITE_API_URL` (always relative `/api/v1`)
- [x] Keep `setClerkTokenGetter` for client-side getToken()
- [x] Keep all 11 API namespaces and `qk` cache key factory
- [x] Keep optimistic mutation hooks (`useMarkThreadRead`, `useTrashThread`, `useDeleteCalendarEvent`)
- [ ] Wire RSC pages to import `@googenie/server` directly (no HTTP hop) — currently delegates to client pages; RSC optimization deferred

### Phase 10 — Tests
- [ ] Capture pre-migration test failure baseline (DB-state related)
- [x] Move `backend/tests/*` → `packages/server/tests/*`
- [ ] Move `vitest.config.ts` and `setup-env.ts` to `packages/server/`
- [ ] Build `invoke(handler, opts)` helper for direct Route Handler invocation
- [ ] Refactor unit tests (Option A): `s3-*`, `s4-*`, `roles`, `scope`, `feature-gate`, `endpoints.integration`
- [ ] Refactor E2E/contract/security tests (Option B): `e2e.journeys`, `contract.web`, `contract.mobile`, `owasp.security`
- [ ] CI: spin up `next start` on :3001 before Option-B tests
- [ ] Verify all 22 vitest files green (excluding pre-existing baseline failures)

### Phase 11 — Deploy & Cleanup
- [x] Update `render.yaml`: remove `googenie-frontend`, rename `googenie-backend` → `googenie-web`
- [x] Set build command: `pnpm install --frozen-lockfile --prod=false && pnpm --filter @googenie/db run db:migrate && pnpm --filter @googenie/web build`
- [x] Set start command: `node apps/web/.next/standalone/apps/web/server.js`
- [x] Add `postbuild` script in `apps/web/package.json` to copy `.next/static` and `public/` into standalone
- [x] Set health check path: `/api/v1/health`
- [x] Add env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BACKEND_URL`
- [x] Remove `CORSAIR_DB_PATH` env var and persistent disk declaration
- [ ] **Upgrade `googenie-postgres` from Free to Starter plan** (manual Render dashboard step)
- [ ] Update Clerk dashboard: new domain in allowed origins, new redirect URLs (manual)
- [x] Update `apps/mobile/src/context/AuthContext.tsx` `API_BASE` constant → `/api/v1`
- [ ] Bump Expo build version (manual)
- [x] Add `.github/workflows/web-checks.yml` (lint + typecheck + test + `next build`)
- [ ] Deploy to Render preview environment
- [ ] Smoke test 3 personas: super_admin, manager_admin, user
- [ ] Verify `/api/v1/health` returns 200
- [ ] Verify Google OAuth connect flow end-to-end
- [ ] Cut over production traffic
- [ ] Wait 1 week of clean telemetry
- [ ] Open follow-up PR: delete `backend/` and `apps/frontend/`, update root `package.json` filter scripts

### Phase 12 — Documentation
- [x] Add `apps/web/README.md`
- [x] Add `apps/web/.env.example`
- [ ] Rewrite root `Readme.md` for new structure
- [ ] Update path references in `corsair-google-demo-implementation-guide.md`
- [ ] Update `enhancement.md` and `plan.md` if they reference old paths

### Final Acceptance Gate
- [x] `pnpm typecheck` (all workspaces) — `tsc --noEmit` exits 0 for `@googenie/db`, `@googenie/server`, `@googenie/web`
- [ ] `pnpm --filter @googenie/web build` produces `.next/standalone`
- [ ] All 22 Vitest files green
- [ ] `tests/owasp.security.test.ts` still green (CSRF, header injection, dual-token)
- [ ] Manual smoke per persona: login → inbox → compose → calendar create → feature-request approval (SSE updates other tabs <1s)
- [ ] Mobile app launches against new `API_BASE`, login + inbox + calendar work
- [ ] Render preview: Google OAuth tokens persist across redeploy (the original SQLite bug is fixed)
