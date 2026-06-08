# Sprint 0: Access and Refresh Token Lifecycle

## Token Types
- Access token:
  - Short-lived bearer token used on API requests.
  - Carries: sub (user id), tenant_id, role, exp.
  - Signed with NIMBUS_ACCESS_TOKEN_SECRET.
- Refresh token:
  - Long-lived token used to obtain new access tokens.
  - Signed and validated with NIMBUS_REFRESH_TOKEN_SECRET.
  - Rotation and revocation store will be implemented in Sprint 1.

## Lifecycle Rules
1. Login:
- Issue access token and refresh token.

2. API calls:
- Client sends access token in Authorization: Bearer <token>.
- If missing/invalid/expired: return 401 UNAUTHORIZED.

3. Authorization:
- After authentication, route-level role and scope policy checks run.
- If role or scope disallows access: return 403 FORBIDDEN.

4. Refresh:
- Client calls refresh endpoint with refresh token.
- On success, issue new access token and rotate refresh token.

5. Revoke/logout:
- Refresh token is invalidated server-side.
- Access token naturally expires.

## Web and Mobile Guidance
- Web and mobile use same token model and API contracts.
- Different OAuth client IDs are recommended per platform.
- Keep token storage platform-appropriate (HTTP-only cookies for web, secure keychain storage for mobile).
