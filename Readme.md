# GooGenie — AI Workspace

Role-aware Gmail + Google Calendar workspace with RBAC, real-time notifications, and AI-assisted workflows.

---

## Architecture

```
apps/frontend/     React 18 + Vite + TanStack Query + Tailwind + Clerk React
backend/           Express + Drizzle ORM + PostgreSQL + Clerk JWT + Corsair SDK
packages/          Shared libraries (future tRPC types, etc.)
```

**Three roles / three tenants:**

| Role | Tenant | Label |
|---|---|---|
| `super_admin` | `dev-admin` | Big Boss |
| `manager_admin` | `dev-teachers` | Teacher |
| `user` | `dev-students` | Student |

---

## Local Development

### Prerequisites
- Node 20+, pnpm 9+
- Docker (for Postgres)
- A [Clerk](https://clerk.com) app (free tier)
- A Google Cloud project with Gmail + Calendar APIs enabled

### 1 — Start Postgres
```bash
docker run -d --name googenie-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=googenie \
  -p 55432:5432 postgres:16
```

### 2 — Configure environment
```bash
cp backend/.env.example backend/.env
# Fill in: DATABASE_URL, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
#          GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CORSAIR_KEK
```

Frontend env (single variable):
```bash
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." > apps/frontend/.env.local
```

### 3 — Install & run
```bash
pnpm install
pnpm --filter googenie-backend dev   # port 4000
pnpm --filter nimbus-web dev         # port 3000 (proxies /v1 → 4000)
```

### 4 — Authorise Google OAuth (Corsair)
```bash
cd backend
npx corsair auth --plugin=gmail --tenant=dev
npx corsair auth --plugin=googlecalendar --tenant=dev
```

### 5 — Sign in
Open `http://localhost:3000`, pick a role tab (Student / Teacher / Big Boss), sign in with Clerk.

---

## Key Features

| Feature | Where |
|---|---|
| Gmail inbox + compose + reply | `/inbox` |
| Google Calendar view + create | `/calendar` |
| Org chart (hierarchy) | `/org` |
| Feature-access requests + approval | `/profile` |
| Real-time notifications (SSE + browser push + chime) | Bell icon |
| Manager team management | `/manager` |
| Admin user roster (cross-tenant) | `/admin` |

### Feature-request flow
```
Student clicks "Request" on a disabled feature
  → SSE push → Manager's bell badge lights up instantly + chime
  → Manager approves/denies from bell or Profile page
    → SSE push → Student's feature toggles immediately + chime + OS notification
```

---

## Commands

| Task | Command |
|---|---|
| Install all | `pnpm install` |
| Backend dev | `pnpm --filter googenie-backend dev` |
| Frontend dev | `pnpm --filter nimbus-web dev` |
| Typecheck all | `npx tsc --noEmit -p backend/tsconfig.json && npx tsc --noEmit -p apps/frontend/tsconfig.json` |
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

See [`backend/docs/deployment-options.md`](backend/docs/deployment-options.md) for the full step-by-step guide.
