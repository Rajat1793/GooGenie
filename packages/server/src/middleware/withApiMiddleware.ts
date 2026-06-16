/**
 * Phase 6 step 39 — `withApiMiddleware`
 *
 * Composes the full Express middleware stack into a single Next.js Route
 * Handler wrapper. Order mirrors backend/src/index.ts:
 *   attachTraceId → secureHeaders → (compression: native in Next) →
 *   cors (handled by apps/web/middleware.ts) →
 *   body-limit (validated on read) → requireAuth (if not public) →
 *   idempotency (tenant-scoped key) → rateLimiter → handler → metrics record
 *
 * Each Route Handler exports `export const POST = withApiMiddleware(handler, opts)`.
 *
 * NOTE: requireAuth runs BEFORE idempotency here (improvement over Express
 * order). Idempotency cache keys are tenant-scoped, not anonymous — see
 * migration_plan.md recheck §7.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import type { AuthCtx } from "../auth/requireAuth";
import { requireAuth as nextRequireAuth } from "../auth/requireAuth";
import { recordRequest } from "../security/metrics";
import { createApiError, statusFromApiError } from "../security/errors";
import { emitAuditEventRaw } from "../security/audit";

export type ApiHandler = (
  req: NextRequest,
  ctx: ApiHandlerCtx
) => Promise<Response> | Response;

export interface ApiHandlerCtx {
  auth: AuthCtx | null;
  traceId: string;
  params: Record<string, string | string[]>;
}

export interface ApiMiddlewareOpts {
  /** When false the handler is public (no auth required). Default true. */
  auth?: boolean;
  /** Apply idempotency cache for mutating methods. Default true on POST/PATCH/PUT, false elsewhere. */
  idempotent?: boolean;
  /** Apply rate-limit bucket. Default true. */
  rateLimit?: boolean;
  /** Optional override: max JSON body size in bytes (default 64 KiB). */
  bodyLimitBytes?: number;
  /** Set true to skip writing the standard secure response headers. */
  noSecurityHeaders?: boolean;
}

// ── In-memory token bucket (single instance) ────────────────────────────────
const BUCKET_WINDOW_MS = 60_000;
const BUCKET_LIMITS: Record<string, number> = {
  super_admin: 600,
  manager_admin: 400,
  user: 300,
  anon: 60,
};
interface Bucket { tokens: number; windowStart: number; }
const buckets = new Map<string, Bucket>();

function consume(key: string, limit: number, cost: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= BUCKET_WINDOW_MS) {
    buckets.set(key, { tokens: limit - cost, windowStart: now });
    return true;
  }
  if (b.tokens < cost) return false;
  b.tokens -= cost;
  return true;
}

// ── Idempotency store ──────────────────────────────────────────────────────
interface CachedRes { status: number; body: string; expiresAt: number; }
const idemStore = new Map<string, CachedRes>();
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;

function evictIdem() {
  const now = Date.now();
  for (const [k, e] of idemStore) if (e.expiresAt < now) idemStore.delete(k);
}

// ── Secure headers ──────────────────────────────────────────────────────────
function applySecureHeaders(headers: Headers, req: Request) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if ((req as NextRequest).headers.get("x-forwarded-proto") === "https") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

// ── Auto-audit ──────────────────────────────────────────────────────────────
/**
 * Derive a stable action code from the request method + path so every API
 * call lands in the activity log without each route having to call
 * `emitAuditEvent` explicitly.
 *
 * Examples:
 *   GET    /api/v1/email/threads         → email_threads_read
 *   GET    /api/v1/email/threads/abc123  → email_thread_read
 *   POST   /api/v1/email/messages/send   → email_messages_send
 *   PATCH  /api/v1/admin/users/u1/role   → admin_users_role_update
 *   DELETE /api/v1/calendar/events/e1    → calendar_events_delete
 *
 * Path segments that look like opaque IDs (UUIDs, alphanumerics > 8 chars) are
 * dropped so the action codes group similar requests together.
 */
function actionFromRequest(method: string, path: string): string {
  const stripped = path
    .replace(/^\/api\/v1\//, "")
    .replace(/^\/v1\//, "")
    .replace(/\?.*$/, "");
  const parts = stripped.split("/").filter(Boolean);
  const namedParts = parts.filter((p) => {
    // Drop anything that looks like an ID rather than a verb/noun.
    if (/^[a-f0-9-]{8,}$/i.test(p)) return false; // UUIDs / long hex IDs
    if (/^\d+$/.test(p)) return false;            // numeric IDs
    if (p.length >= 16 && /[A-Z0-9]/.test(p)) return false; // opaque tokens
    return true;
  });
  const verb = method === "GET"
    ? "read"
    : method === "POST"
    ? namedParts.includes("send") || namedParts.includes("init") ? "" : "create"
    : method === "PATCH" || method === "PUT"
    ? "update"
    : method === "DELETE"
    ? "delete"
    : method.toLowerCase();
  const base = namedParts.join("_") || "request";
  return verb ? `${base}_${verb}` : base;
}

// Endpoints that are too noisy / not user-meaningful to audit. Polling reads
// (status, feature-requests/incoming) and the audit log itself fire on every
// page render, so logging them produces an unreadable feed dominated by
// boilerplate rather than user actions.
const AUDIT_SKIP_PATHS = new Set([
  "/api/v1/health",
  "/api/v1/auth/config",
  "/api/v1/demo/tokens",
  "/api/v1/stream",
  "/api/v1/me/activity",                  // listing the log itself
  "/api/v1/me/feature-requests/incoming", // polled every render
  "/api/v1/me/connect/status",            // polled every render
]);

// ── Wrapper ────────────────────────────────────────────────────────────────
export function withApiMiddleware(
  handler: ApiHandler,
  opts: ApiMiddlewareOpts = {}
) {
  const {
    auth: needsAuth = true,
    idempotent,
    rateLimit = true,
    noSecurityHeaders = false,
  } = opts;

  return async function wrapped(
    req: NextRequest,
    rctx: { params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]> } = {}
  ): Promise<Response> {
    const traceId = req.headers.get("x-trace-id") ?? randomUUID();
    const start = Date.now();
    let statusCode = 200;
    let wasAuthz = false;
    let wasGranted = false;
    let auth: AuthCtx | null = null;

    const finalize = (res: Response): Response => {
      statusCode = res.status;
      if (!noSecurityHeaders) applySecureHeaders(res.headers, req);
      res.headers.set("x-trace-id", traceId);
      recordRequest({
        durationMs: Date.now() - start,
        statusCode,
        wasAuthz,
        wasGranted: wasGranted || statusCode < 400,
      });

      // Auto-audit successful authenticated requests so the activity log on
      // /profile populates without each route having to call emitAuditEvent.
      // We skip noisy boilerplate endpoints (health, polling reads, the
      // activity log itself) to keep the feed user-meaningful.
      try {
        const path = req.nextUrl?.pathname ?? "";
        if (
          auth &&
          statusCode >= 200 &&
          statusCode < 400 &&
          !AUDIT_SKIP_PATHS.has(path)
        ) {
          emitAuditEventRaw({
            userId: auth.userId,
            tenantId: auth.tenantId,
            role: auth.role,
            route: path,
            method: req.method,
            action: actionFromRequest(req.method, path),
            metadata: { traceId },
          });
        }
      } catch {
        /* never fail a response over an audit-write failure */
      }

      return res;
    };

    try {
      // 1) Auth
      if (needsAuth) {
        const a = await nextRequireAuth(req);
        wasAuthz = true;
        if (!a.ok) {
          return finalize(a.response);
        }
        auth = a.auth;
        wasGranted = true;
      }

      // 2) Rate limit
      if (rateLimit) {
        const role = auth?.role ?? "anon";
        const isAuthedRead = auth && req.method === "GET";
        if (!isAuthedRead) {
          const identity = auth ? `${auth.tenantId}:${auth.userId}` : (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
          const limit = BUCKET_LIMITS[role] ?? BUCKET_LIMITS.user!;
          const cost = auth ? 2 : 1;
          if (!consume(`${role}:${identity}`, limit, cost)) {
            return finalize(NextResponse.json(
              createApiError("TOO_MANY_REQUESTS", "Too many requests. Please retry after 60 seconds.", true, traceId),
              { status: 429, headers: { "Retry-After": "60" } }
            ));
          }
        }
      }

      // 3) Idempotency lookup
      const method = req.method.toUpperCase();
      const idemDefault = method === "POST" || method === "PATCH" || method === "PUT";
      const useIdem = idempotent ?? idemDefault;
      const idemKey = req.headers.get("idempotency-key");
      let idemCacheKey: string | null = null;
      if (useIdem && idemKey) {
        evictIdem();
        idemCacheKey = `${auth?.tenantId ?? "anon"}:${idemKey}`;
        const cached = idemStore.get(idemCacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return finalize(new NextResponse(cached.body, {
            status: cached.status,
            headers: { "Content-Type": "application/json", "Idempotency-Replayed": "true" },
          }));
        }
      }

      // 4) Resolve params (Next.js 15 makes these async)
      const params = rctx.params ? (await rctx.params) : {};

      // 5) Run handler
      const res = await handler(req, { auth, traceId, params });

      // 6) Cache idempotent successful response
      if (idemCacheKey && res.status < 500) {
        try {
          const cloned = res.clone();
          const body = await cloned.text();
          idemStore.set(idemCacheKey, { status: res.status, body, expiresAt: Date.now() + IDEM_TTL_MS });
        } catch {
          /* non-text body — skip caching */
        }
      }

      return finalize(res);
    } catch (e) {
      // Production error envelope (mirrors backend/src/index.ts 500 handler)
      console.error("[api:500]", {
        method: req.method,
        path: req.nextUrl?.pathname,
        userId: auth?.userId,
        tenantId: auth?.tenantId,
        traceId,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      const body = createApiError("INTERNAL_ERROR" as const, "An unexpected error occurred", false, traceId);
      return finalize(NextResponse.json(body, { status: statusFromApiError("INTERNAL_ERROR" as const) }));
    }
  };
}

/** Test reset hook */
export function _resetApiMiddlewareStores(): void {
  buckets.clear();
  idemStore.clear();
}
