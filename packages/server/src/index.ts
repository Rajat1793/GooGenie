/**
 * @googenie/server entry — explicitly server-only.
 * Importing from a client component will fail the build (good).
 */
import "server-only";

export * from "./auth/requireAuth";
export { ROLE } from "./auth/roles";
export type { Role } from "./auth/roles";
export type { AuthContext } from "./auth/context";
export { resolveAllowedUserIds } from "./auth/scope";
export { verifyAccessToken, createAccessToken } from "./auth/token";
export { prewarmJwksCache, verifyClerkJWT, looksLikeClerkJWT } from "./auth/clerk-jwt";

export { env } from "./security/env";
export { createApiError, statusFromApiError } from "./security/errors";
export { recordRequest, getCounters, getLatency, evaluateAlerts } from "./security/metrics";
export { paginate } from "./security/pagination";
export { emitAuditEvent, listAuditEvents, emitAuditEventRaw } from "./security/audit";

export { withApiMiddleware } from "./middleware/withApiMiddleware";
export type { ApiHandler, ApiHandlerCtx, ApiMiddlewareOpts } from "./middleware/withApiMiddleware";

export { validateBody, validateQuery } from "./lib/validateNext";

export { corsair, isCorsairConfigured, setupCorsair } from "./integrations/corsair";
export { publish, subscribe } from "./integrations/event-bus";
export type { LiveEvent } from "./integrations/event-bus";

export type { ApiError, ApiErrorCode, FieldError } from "./contracts/api-error";
