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
| S0-1 | Freeze role model and hierarchy semantics (super_admin, manager_admin, user) | PO + BE | 1.5 | Signed authorization policy note | Role matrix approved |
| S0-2 | Finalize API versioning strategy and error schema | BE | 1.0 | API standards doc | Standard error format accepted |
| S0-3 | Define activity visibility policy (metadata vs content) | PO + SEC | 1.0 | Visibility policy doc | Policy sign-off complete |
| S0-4 | Publish OpenAPI skeleton for core v1 endpoints | BE | 2.0 | Initial OpenAPI spec | Contract review passed |
| S0-5 | Define KPI and observability baseline (authz denied, latency, webhook lag) | SRE + PO | 1.5 | KPI dashboard requirements | Metrics list approved |
| S0-6 | Threat model and security baseline checklist | SEC | 2.0 | Security baseline checklist | Risks accepted with mitigations |

Sprint 0 total effort: 9.0 days

## Sprint 1 (Schema and AuthZ Core)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S1-1 | Create DB migrations for roles, hierarchy, feature access, audit tables | BE | 2.5 | Drizzle migration files | Migration runs cleanly |
| S1-2 | Add indexes and constraints for tenant and hierarchy queries | BE | 1.0 | Indexed schema update | Query plan reviewed |
| S1-3 | Build auth middleware and request auth context | BE | 1.5 | Auth middleware module | Token validation tests pass |
| S1-4 | Implement requireRole and feature-gate middleware | BE | 1.5 | Authorization middleware module | Unit tests pass |
| S1-5 | Implement hierarchy scope resolver (recursive tree mode) | BE | 2.0 | Scope resolution service | Cross-scope tests pass |
| S1-6 | Add policy unit tests (allow and deny matrix) | QA + BE | 2.0 | AuthZ unit test suite | Minimum 90 percent pass target |
| S1-7 | CI checks for schema drift and migration validation | SRE | 1.0 | CI pipeline updates | CI green on migration job |

Sprint 1 total effort: 11.5 days

## Sprint 2 (Endpoint Hardening and Core UI)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S2-1 | Patch existing email endpoints with tenant and scope filters | BE | 2.0 | Hardened email APIs | Integration tests pass |
| S2-2 | Patch calendar endpoints with tenant and scope filters | BE | 1.5 | Hardened calendar APIs | Integration tests pass |
| S2-3 | Add admin APIs (users, role changes, activity) | BE | 2.5 | Admin route group | Role-based endpoint tests pass |
| S2-4 | Add manager APIs (team users, scoped activity, feature toggles) | BE | 2.0 | Manager route group | Scope guard tests pass |
| S2-5 | Build super admin UI pages for users and activity | FE | 2.5 | Admin UI screens ✅ | **DONE** — `apps/web` users table + role edit modal + activity log, Nimbus Elegant Pastel design system |
| S2-6 | Build manager UI pages for team visibility and feature control | FE | 2.0 | Manager UI screens ✅ | **DONE** — `apps/web` manager team view with per-user feature toggles + activity panel + bulk actions |
| S2-7 | Add user self-service pages (features and own activity) | FE | 1.5 | User UI screens ✅ | **DONE** — `UserProfilePage` with feature chip list + activity feed; `/profile` route + nav for all roles |
| S2-8 | Add audit log emission to privileged actions | BE | 1.5 | Structured audit events ✅ | **DONE** — `GET /v1/me/features` + `GET /v1/me/activity` added with audit; `me_profile_read` emit added; 20 BE tests passing |

Sprint 2 total effort: 15.5 days

## Sprint 3 (Web + Mobile Contract Readiness)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S3-1 | Add idempotency support for write endpoints | BE | 1.5 | Idempotency middleware/store | Retry safety tests pass |
| S3-2 | Add cursor pagination and delta sync parameters | BE | 2.0 | API query contract updates | Sync tests pass |
| S3-3 | Finalize token lifecycle docs for web and mobile clients | BE + SEC | 1.0 | Auth flow documentation | Security review passed |
| S3-4 | Add standardized error codes and retryable flags | BE | 1.0 | Unified error layer | Contract tests pass |
| S3-5 | Build contract tests for web critical flows | QA | 2.0 | Web API contract suite | CI green |
| S3-6 | Build contract tests for mobile critical flows | QA | 2.0 | Mobile API contract suite | CI green |
| S3-7 | Staging environment seed data for role hierarchy scenarios | SRE + QA | 1.5 | Seed scripts and fixtures | Staging test run successful |
| S3-8 | Performance baseline run (p95 latency, throughput) | SRE | 1.5 | Performance report | p95 targets achieved |

Sprint 3 total effort: 12.5 days

## Sprint 4 (Security, Observability, Launch Gate)
| ID | Checklist Item | Owner | Effort (Days) | Output | Status Gate |
|---|---|---|---:|---|---|
| S4-1 | Complete OWASP quick pass and dependency scanning | SEC + SRE | 2.0 | Security validation report | No critical open issues |
| S4-2 | Add admin endpoint rate limiting and abuse detection | BE + SRE | 1.5 | Protection layer | Load and abuse tests pass |
| S4-3 | Finalize dashboards and alerts for authz and reliability metrics | SRE | 1.5 | Monitoring dashboards | Alert tests pass |
| S4-4 | Run end-to-end role journey tests (super admin, manager, user) | QA | 2.0 | E2E test evidence | All priority scenarios pass |
| S4-5 | UAT with pilot org hierarchy and sign-off checklist | PO + QA | 2.0 | UAT report | Business sign-off complete |
| S4-6 | Launch readiness review and rollback plan | PO + SRE + SEC | 1.5 | Go-live decision pack | Go or no-go decision made |

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
- Run a kickoff meeting and assign named owners against each role-based owner slot in this checklist.
