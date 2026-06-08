# Sprint 0: Security Baseline Checklist

## Baseline Controls
- [x] Access token and refresh token lifecycle documented. (docs/sprint0/token-lifecycle.md)
- [x] Secrets stored in environment variables only. (src/security/env.ts, .env.example)
- [x] Audit logging schema defined for privileged operations. (src/security/audit.ts)
- [x] Sensitive fields identified for redaction in logs. (src/security/redaction.ts)
- [x] Admin and manager routes marked for rate limiting. (src/index.ts, src/security/rate-limit.ts)
- [x] Dependency vulnerability scan enabled in CI. (.github/workflows/backend-checks.yml)
- [x] Deterministic 401 and 403 behavior documented. (docs/sprint0/authz-policy.md, docs/sprint0/token-lifecycle.md)

## Threat Notes
- Cross-tenant leakage risk: enforce tenant filter in all repository methods.
- Hierarchy bypass risk: always evaluate scope resolver before provider/API call.
- Replay risk on write endpoints: add idempotency keys in Sprint 3.

## Review Status
- Status: Implemented in Sprint 0 baseline.
- Owner: Security + Backend.
