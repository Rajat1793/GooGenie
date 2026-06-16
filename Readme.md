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
| Google Calendar view + create | `/calendar` |
| Org chart | `/org` |
| Feature-access requests + approval | `/profile` |
| Real-time notifications (SSE + browser push + chime) | Bell icon |
| Manager team management | `/manager/team` |
| Admin user roster | `/admin/users` |
| AI agent (⌘K) — Gmail / Calendar tool calling via Mistral | Floating button |

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
