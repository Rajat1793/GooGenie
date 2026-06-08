# Sprint 0: Authorization Policy Freeze

## Roles
- super_admin: full tenant access, role assignment, policy and integration controls.
- manager_admin: access only to assigned hierarchy users and their scoped operations.
- user: own-data access only, constrained by feature gate settings.

## Core Enforcement Rules
- Deny by default.
- Backend APIs enforce role and scope checks.
- UI visibility controls do not replace backend authorization.
- Every protected query must apply tenant and scope filters.

## 401 vs 403 Semantics
- 401: missing or invalid authentication.
- 403: authenticated but role or hierarchy scope disallows operation.

## Review Status
- Status: Implemented baseline middleware and role guards in Sprint 0.
- Next update: Sprint 1 for hierarchy scope resolver and endpoint-wide adoption.
