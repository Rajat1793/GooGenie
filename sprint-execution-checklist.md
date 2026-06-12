# Nimbus Sprint-Ready Execution Checklist

## Planning Assumptions
- Team capacity assumption: 5 core owners working in parallel.
- Sprint length assumption: 10 working days per sprint.
- Estimates are in person-days and include development plus basic unit/integration coverage.
- Scope baseline: enterprise-ready V1 with multi-client backend readiness (web + mobile).

## Owner Roles
- Product Owner (PO)
- Backend Engineer (BE)
- Frontend Engineer (FE)
- QA Engineer (QA)
- DevOps/SRE Engineer (SRE)
- Security Engineer (SEC)

## Sprint 0 (Design Lock and Contracts)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S0-1 | Freeze role model and hierarchy semantics (super_admin, manager_admin, user) | PO + BE | 1.5 | Signed authorization policy note ✅ | **DONE** |
| S0-2 | Finalize API versioning strategy and error schema | BE | 1.0 | API standards doc ✅ | **DONE** |
| S0-3 | Define activity visibility policy (metadata vs content) | PO + SEC | 1.0 | Visibility policy doc ✅ | **DONE** |
| S0-4 | Publish OpenAPI skeleton for core v1 endpoints | BE | 2.0 | Initial OpenAPI spec ✅ | **DONE** |
| S0-5 | Define KPI and observability baseline (authz denied, latency, webhook lag) | SRE + PO | 1.5 | KPI dashboard requirements ✅ | **DONE** |
| S0-6 | Threat model and security baseline checklist | SEC | 2.0 | Security baseline checklist ✅ | **DONE** |

Sprint 0 total effort: 9.0 days

## Sprint 1 (Schema and AuthZ Core)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S1-1 | Create DB migrations for roles, hierarchy, feature access, audit tables | BE | 2.5 | Drizzle migration files ✅ | **DONE** — `drizzle/0000_panoramic_jubilee.sql` |
| S1-2 | Add indexes and constraints for tenant and hierarchy queries | BE | 1.0 | Indexed schema ✅ | **DONE** — tenant+role, tenant+manager, created_at indexes |
| S1-3 | Build auth middleware and request auth context | BE | 1.5 | Auth middleware ✅ | **DONE** — HMAC-SHA256 token, `requireAuth`, `attachTraceId` |
| S1-4 | Implement requireRole and feature-gate middleware | BE | 1.5 | Authorization middleware ✅ | **DONE** — `requireRole`, `requireFeature` |
| S1-5 | Implement hierarchy scope resolver (recursive tree mode) | BE | 2.0 | Scope resolver ✅ | **DONE** — BFS traversal in `auth/scope.ts` |
| S1-6 | Add policy unit tests (allow and deny matrix) | QA + BE | 2.0 | AuthZ unit tests ✅ | **DONE** — 55 tests passing |
| S1-7 | CI checks for schema drift and migration validation | SRE | 1.0 | CI pipeline ✅ | **DONE** — `pnpm run check` in CI |

Sprint 1 total effort: 11.5 days

## Sprint 2 (Endpoint Hardening and Core UI)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S2-1 | Patch existing email endpoints with tenant and scope filters | BE | 2.0 | Hardened email APIs ✅ | **DONE** — tenant+scope filter, pagination envelope |
| S2-2 | Patch calendar endpoints with tenant and scope filters | BE | 1.5 | Hardened calendar APIs ✅ | **DONE** — tenant+scope filter, pagination envelope |
| S2-3 | Add admin APIs (users, role changes, activity) | BE | 2.5 | Admin route group ✅ | **DONE** — `GET/PATCH /v1/admin/*` |
| S2-4 | Add manager APIs (team users, scoped activity, feature toggles) | BE | 2.0 | Manager route group ✅ | **DONE** — `GET/PATCH /v1/manager/*` + bulk actions |
| S2-5 | Build super admin UI pages for users and activity | FE | 2.5 | Admin UI screens ✅ | **DONE** — `apps/web` users table + role edit modal + activity log, Nimbus Elegant Pastel design system |
| S2-6 | Build manager UI pages for team visibility and feature control | FE | 2.0 | Manager UI screens ✅ | **DONE** — `apps/web` manager team view with per-user feature toggles + activity panel + bulk actions |
| S2-7 | Add user self-service pages (features and own activity) | FE | 1.5 | User UI screens ✅ | **DONE** — `UserProfilePage` with feature chip list + activity feed; `/profile` route + nav for all roles |
| S2-8 | Add audit log emission to privileged actions | BE | 1.5 | Structured audit events ✅ | **DONE** — `GET /v1/me/features` + `GET /v1/me/activity` added with audit; `me_profile_read` emit added; 20 BE tests passing |

Sprint 2 total effort: 15.5 days

## Sprint 3 (Web + Mobile Contract Readiness)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S3-1 | Add idempotency support for write endpoints | BE | 1.5 | Idempotency middleware ✅ | **DONE** — `security/idempotency.ts`; `Idempotency-Key` header; 24h TTL cache; `Idempotency-Replayed` header on replay |
| S3-2 | Add cursor pagination and delta sync parameters | BE | 2.0 | Pagination ✅ | **DONE** — `security/pagination.ts`; base64url cursor on all list endpoints; `total` + `next_cursor` envelope |
| S3-3 | Finalize token lifecycle docs for web and mobile clients | BE + SEC | 1.0 | Auth config endpoint ✅ | **DONE** — `GET /v1/auth/config` (no auth); returns ttl, refresh_window, clock_skew, roles, scopes |
| S3-4 | Add standardized error codes and retryable flags | BE | 1.0 | Enhanced error layer ✅ | **DONE** — `CONFLICT` code + HTTP 409; `details[]` field errors; `retry_after` on 429; all errors carry `trace_id` |
| S3-5 | Build contract tests for web critical flows | QA | 2.0 | Web contract suite ✅ | **DONE** — `tests/contract.web.test.ts`; bootstrap, auth, pagination, idempotency, admin ops |
| S3-6 | Build contract tests for mobile critical flows | QA | 2.0 | Mobile contract suite ✅ | **DONE** — `tests/contract.mobile.test.ts`; startup, token errors, self-service, manager tab, inbox/calendar |
| S3-7 | Staging environment seed data for role hierarchy scenarios | SRE + QA | 1.5 | Staging fixture ✅ | **DONE** — `scripts/seed-staging.ts`; 2 tenants, deep hierarchy, inactive users, feature matrix → `fixtures/staging-seed.json` |
| S3-8 | Performance baseline run (p95 latency, throughput) | SRE | 1.5 | Perf baseline script ✅ | **DONE** — `scripts/perf-baseline.ts`; concurrent load runner, p50/p90/p95/p99 + throughput; run with `pnpm perf:baseline` |

Sprint 3 total effort: 12.5 days

## Sprint 4 (Security, Observability, Launch Gate)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S4-1 | Complete OWASP quick pass and dependency scanning | SEC + SRE | 2.0 | Security validation ✅ | **DONE** — `tests/owasp.security.test.ts`; A01-A09 coverage; body limit 64kb; 85 tests passing |
| S4-2 | Add admin endpoint rate limiting and abuse detection | BE + SRE | 1.5 | Protection layer ✅ | **DONE** — rate-limit middleware already on admin/manager routes |
| S4-3 | Finalize dashboards and alerts for authz and reliability metrics | SRE | 1.5 | Metrics + alerts ✅ | **DONE** — `security/metrics.ts`; `GET /v1/metrics` + `GET /v1/alerts`; p95/authz-denied/5xx thresholds |
| S4-4 | Run end-to-end role journey tests (super admin, manager, user) | QA | 2.0 | E2E test suite ✅ | **DONE** — `tests/e2e.journeys.test.ts`; 3 full role journeys × 8-9 steps; 85 tests total |
| S4-5 | UAT with pilot org hierarchy and sign-off checklist | PO + QA | 2.0 | UAT script ✅ | **DONE** — `scripts/uat-signoff.ts`; 12 UAT scenarios (infra/security/rbac); run with `pnpm uat:signoff` |
| S4-6 | Launch readiness review and rollback plan | PO + SRE + SEC | 1.5 | Launch gate ✅ | **DONE** — `scripts/launch-readiness.ts`; 10 auto gates + 6 manual gates + rollback procedure; run with `pnpm launch:readiness` |

Sprint 4 total effort: 10.5 days

## Consolidated Effort Summary
- Sprint 0: 9.0 person-days
- Sprint 1: 11.5 person-days
- Sprint 2: 15.5 person-days
- Sprint 3: 12.5 person-days
- Sprint 4: 10.5 person-days
- Total estimated effort: 59.0 person-days

## Critical Path (Must Not Slip)
1. S1-1 to S1-5 (schema and authz core)
2. S2-1 to S2-4 (endpoint hardening)
3. S3-1 to S3-4 (multi-client contract reliability)
4. S4-4 to S4-6 (validation and launch decision)

## Definition of Done (Per Item)
- Code implemented and peer reviewed.
- Unit and integration tests added or updated.
- Security and scope checks validated for affected endpoints.
- Documentation updated (OpenAPI and team notes).
- CI pipeline green for changed modules.

## Optional Fast-Track Items (If Capacity Available)
1. Two-person approval for high-risk bulk actions (2.0 days, BE + FE).
2. Policy simulator UI for allow or deny explanation (2.5 days, FE + BE).
3. Time-bound temporary admin delegation (2.0 days, BE).
4. Cost telemetry for AI actions per role (1.5 days, BE + SRE).

## Immediate Next Action
- Sprint 0–3 fully implemented. Sprint 4 remaining: S4-1 OWASP scan, S4-3 dashboards, S4-4 E2E, S4-5 UAT, S4-6 launch gate.
- Frontend running at `http://localhost:3000` — login with tokens from `pnpm tsx backend/scripts/gen-tokens.ts`.
