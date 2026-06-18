# GooGenie — AI Workspace

Role-aware Gmail + Google Calendar workspace with RBAC, real-time notifications, and AI-assisted workflows. Deployed at **https://googenie-web.onrender.com**.

---

## Architecture

```
apps/web/           Next.js 15 (App Router) — UI + API routes (port 3000)
apps/mobile/        Expo (React Native) — points to apps/web's API
packages/server/    Shared server lib: middleware, auth, integrations
packages/db/        Drizzle ORM + PostgreSQL schema + migrations
packages/contracts/ Shared Zod schemas + OpenAPI types
```

**Three roles:**

| Role | Label |
|---|---|
| `super_admin` | Admin |
| `manager_admin` | Manager |
| `user` | Member |

---

## Local Development

### Prerequisites
- Node 20+, pnpm 9+
- Docker (for Postgres)
- A [Clerk](https://clerk.com) app
- A Google Cloud project with Gmail + Calendar APIs enabled (**Web application** OAuth client)

### 1 — Start Postgres
```bash
docker run -d --name googenie-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=googenie \
  -p 55432:5432 postgres:16
```

### 2 — Configure environment
```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in: DATABASE_URL, CLERK_*, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#          GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/me/connect/callback,
#          CORSAIR_KEK, MISTRAL_API_KEY (optional).
```

### 3 — Install & run
```bash
pnpm install
pnpm dev        # apps/web on port 3000
```

Drizzle migrations run automatically on boot via `instrumentation.ts`.

### 4 — Sign in
Open `http://localhost:3000`, sign in with Clerk, then click **Connect** on the Inbox / Calendar pages to authorize Gmail and Google Calendar.

---

## Key Features

| Feature | Where |
|---|---|
| Gmail inbox + compose + reply | `/inbox` |
| Folder sidebar — All / Unread / Reply needed / Drafts / Sent / Primary / Social / Promotions / Updates / Forums | Sidebar under **Inbox** (URL: `?folder=…`) |
| AI **Reply Needed** triage queue | `/inbox?folder=reply_needed` |
| **Drafts** — inline Send / Edit / Delete on every Gmail draft | `/inbox?folder=drafts` |
| **Sent** folder — last 20 sent threads with search | `/inbox?folder=sent` |
| Google Calendar view + create + reschedule + conflict detection | `/calendar` |
| **Snippets** — reusable text templates expanded inline with `;hotkey` + Tab | `/snippets` |
| **Booking Links** — Calendly-style public booking pages (`/book/{slug}`) | `/booking-links` |
| **Demo Tour** — 10-step onboarding modal, auto-opens on first visit, replayable from Profile | All authenticated pages |
| Org chart | `/org` |
| Feature-access requests + approval | `/profile` |
| Real-time notifications (SSE + browser push + chime) | Bell icon |
| Manager team management | `/manager/team` |
| Admin user roster + activity log | `/admin/users`, `/admin/activity` |
| AI agent (⌘K) — Gmail / Calendar tool calling via Mistral | Floating button |
| OpenAPI / Swagger UI (super_admin only) | `/api-docs` |

---

## Performance

Built for sub-second feels on every interaction:

- **Persisted React Query cache** — every successful query is mirrored to `localStorage` (`googenie-query-cache`, throttled 1 write/sec, 24h max age) and restored before first paint. Hard reloads render last-known data **instantly**, then refetch silently. See [apps/web/src/components/QueryProvider.tsx](apps/web/src/components/QueryProvider.tsx).
- **Background prefetch waves** — on Shell mount and during the Demo Tour, the inbox / calendar / drafts / sent / connect status / booking links / snippets endpoints are prefetched in three staggered waves (300/900/1600 ms) so the dev server doesn't saturate its socket pool. See [apps/web/src/components/Shell.tsx](apps/web/src/components/Shell.tsx).
- **Route-bundle prefetch** — `router.prefetch()` is called for every sidebar entry on mount so Next dev mode can JIT-compile route chunks in the background.
- **Server-side TTL cache** — Gmail / Calendar list calls are cached in process for 5–10 min in [packages/server/src/security/cache.ts](packages/server/src/security/cache.ts).
- **Corsair DB-backed read path** — `fetchGmailThreads` resolves threads from the Corsair-synced Postgres mirror first, dropping per-thread Gmail API calls from ~11 to 0 on the hot path. See [packages/server/src/integrations/gmail.ts](packages/server/src/integrations/gmail.ts).
- **Dev mode reality check** — `next dev` JIT-compiles every API route on first hit (3–5 s blank-screen feel). Run `pnpm --filter @googenie/web build && pnpm --filter @googenie/web start` for a representative perf test.

---

## Commands

| Task | Command |
|---|---|
| Install all | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Reset local DB | See below |

### Reset local DB
```bash
docker exec googenie-postgres psql -U postgres -d googenie -c "
TRUNCATE TABLE feature_requests, user_feature_access, activity_logs, role_change_logs CASCADE;
DELETE FROM users;
"
```

---

## Deployment → Render

A single Render Node web service (`googenie-web`) backed by a managed Postgres (`googenie-postgres`). See [render.yaml](render.yaml) for the full Blueprint config.

Required env vars (see [apps/web/.env.example](apps/web/.env.example)):
`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CORSAIR_KEK`, `NIMBUS_ACCESS_TOKEN_SECRET`, `NIMBUS_REFRESH_TOKEN_SECRET`, `BACKEND_URL`, `FRONTEND_URL`, `HOSTNAME=0.0.0.0` (so Next.js standalone binds to all interfaces).
