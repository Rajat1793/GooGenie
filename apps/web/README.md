# @googenie/web — Next.js full-stack app

Single Render service that replaces `backend/` (Express) + `apps/frontend/` (Vite).
See `migration_plan.md` for the full migration spec and `Readme.md` for an overview.

## Stack

- Next.js 15 (App Router, React 19, Node runtime)
- Clerk Next (`@clerk/nextjs`)
- TanStack Query 5 — **with `@tanstack/react-query-persist-client` + `@tanstack/query-sync-storage-persister`** so the cache survives page reloads via localStorage
- Tailwind 3 + CSS variables (light/dark)
- Workspace packages: `@googenie/server`, `@googenie/db`, `@googenie/contracts`

## Layout

```
apps/web/
  app/                  ← Next.js App Router pages + API routes
    layout.tsx          ← ClerkProvider + QueryProvider (persisted) + ThemeProvider
    page.tsx            ← LandingPage (RSC delegator → src/pages-legacy)
    pricing/page.tsx
    login/page.tsx
    book/[slug]/page.tsx       ← Public Calendly-style booking page
    (app)/                     ← Authenticated route group with Shell
      inbox/page.tsx           ← Inbox + folder sub-nav via `?folder=`
      calendar/page.tsx
      snippets/page.tsx        ← Reusable text templates (NEW)
      booking-links/page.tsx   ← Manage booking links (NEW)
      org/page.tsx
      profile/page.tsx         ← + "Take the tour" replay button
      api-docs/page.tsx        ← Swagger UI (super_admin)
      api-docs/openapi.json/   ← Spec route handler
      admin/users/page.tsx
      admin/activity/page.tsx
      manager/team/page.tsx
    api/v1/             ← Route Handlers (all `runtime = "nodejs"`)
      health/    auth/    me/    admin/    manager/    email/
      calendar/  ai/      agent/ connect/ → me/connect/   stream/
      webhooks/  demo/tokens/    metrics/  alerts/  booking/
  src/
    api/                ← Browser API client (paths relative; SSR-safe)
                        ←  + queryClient.ts (qk factory: emailThreads, emailDrafts,
                        ←    emailSent, calendarEvents, connectStatus, bookingLinks,
                        ←    snippets) + hooks.ts (useEmailThreads, useDrafts,
                        ←    useSentThreads, useCalendarEvents, useBookingLinks,
                        ←    useSnippets, …)
    components/         ← Shell, AgentBar, modals, DemoTour, BookingLinksPanel,
                        ←  SnippetsPanel, QueryProvider (persisted), Icon, …
    contexts/           ← AuthContext, FeatureContext, ThemeContext
    hooks/              ← useLiveCacheStream, useNotifications, useClerkReady
    lib/                ← chime, storage, roles, errors, formatActivity
    pages-legacy/       ← Original Vite pages, ported via rewrite-imports.mjs
                        ←  (includes new SnippetsPage + BookingLinksPage)
    styles/index.css    ← Tailwind + CSS variables (carried from frontend)
  scripts/
    copy-standalone-assets.mjs   ← postbuild copy (Phase 11)
    rewrite-imports.mjs          ← one-shot codemod used during the port
  middleware.ts         ← Clerk middleware (matcher excludes /api/*)
  instrumentation.ts    ← runs setupCorsair + runStartupMigrations + JWKS prewarm
  next.config.mjs       ← output: "standalone", transpilePackages, NFT root
  tailwind.config.js, postcss.config.js, tsconfig.json, next-env.d.ts
```

## Performance notes

- `QueryProvider` wraps the tree in `PersistQueryClientProvider`. Cache key:
  `googenie-query-cache`. Bump the `CACHE_BUSTER` string in
  [src/components/QueryProvider.tsx](src/components/QueryProvider.tsx) to nuke
  every user's persisted cache when query shapes change across deploys.
- `Shell.tsx` runs a three-wave data warm-up (300/900/1600 ms) gated on the
  demo token being present, plus a `router.prefetch()` loop for every sidebar
  route bundle. The `DemoTour` runs an additional two-wave warm-up while the
  user reads the onboarding cards.
- Server-side `TTL` constants live in
  [packages/server/src/security/cache.ts](../../packages/server/src/security/cache.ts):
  threads 5min, thread 10min, calendar 5min, connect 10min.

## Environment

Required:
- `DATABASE_URL` — Postgres connection string
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NIMBUS_ACCESS_TOKEN_SECRET`, `NIMBUS_REFRESH_TOKEN_SECRET` (HMAC tokens)
- `CORSAIR_KEK` (32+ chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `BACKEND_URL`, `FRONTEND_URL` (both = `https://<your-render-app>.onrender.com`)

Optional:
- `MISTRAL_API_KEY` (AI summary/compose graceful degradation)
- `DEMO_TOKEN_SUPER_ADMIN`, `DEMO_TOKEN_HITESH`, `DEMO_TOKEN_PIYUSH`, `DEMO_TOKEN_USER`

## Scripts

```bash
pnpm --filter @googenie/web dev          # next dev on :3000
pnpm --filter @googenie/web build        # next build + standalone copy
pnpm --filter @googenie/web start        # node .next/standalone/apps/web/server.js
pnpm --filter @googenie/web typecheck
pnpm --filter @googenie/db   db:migrate  # Drizzle migrate (run during build)
```

## What's done & what's pending

See `migration_plan.md` for the comprehensive per-step checklist. High-level:

- ✅ Workspace + packages scaffolded (`@googenie/db`, `@googenie/server`, `@googenie/contracts`).
- ✅ All 12 Express route modules mirrored as Next.js Route Handlers (high-leverage
  endpoints implemented natively; complex ones — `ai/index-emails`, `ai/search-emails`,
  `ai/suggest-slots`, `agent/execute` — currently return `501 NOT_IMPLEMENTED` with
  a precise pointer back to the source file).
- ✅ SSE `/api/v1/stream` ported via native `ReadableStream`.
- ✅ Corsair token store moved to Postgres (Phase 8) — pg.Pool fed directly.
- ✅ `render.yaml` collapsed to a single `googenie-web` service.
- ✅ Mobile `API_BASE` patched to `https://<host>/api`.
- 🟡 Pages are delegated to `src/pages-legacy/*` (mechanically rewritten with
  `scripts/rewrite-imports.mjs`); some `useNavigate(...)` → `router.push(...)`
  call sites need manual review before deploy. Search for `useRouter()` in
  `src/pages-legacy/`.
- 🟡 Tests (`backend/tests/*`) are copied to `packages/server/tests/` but still
  use `supertest` against the Express app. Phase 10 refactor pending.
- ❌ Phase 0c (Render SSE smoke test) requires a Render account.
