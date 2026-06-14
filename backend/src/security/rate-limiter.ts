/**
 * Rate limiting middleware — token-bucket per (tenantId + role + endpoint class).
 *
 * Limits (per 60-second window):
 *   super_admin    → 600 req/min
 *   manager_admin  → 400 req/min
 *   user           → 300 req/min
 *   unauthenticated → 60 req/min (by IP)
 *
 * Cost rules:
 *   - Authenticated GET requests → free (0 tokens). Reads are cheap; rate-limiting
 *     them causes 429 storms when React Query background-refetches after mutations.
 *   - Authenticated writes (POST/PATCH/PUT/DELETE) → 2 tokens each.
 *   - Unauthenticated requests → 1 token each regardless of method.
 *
 * Webhook endpoints are exempt.
 */
/// <reference path="../contracts/request.d.ts" />
import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60_000; // 1 minute

const LIMITS: Record<string, number> = {
  super_admin: 600,
  manager_admin: 400,
  user: 300,
  anon: 60
};

interface Bucket {
  tokens: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function getLimit(role: string): number {
  return LIMITS[role] ?? LIMITS.user;
}

function consume(key: string, limit: number, cost: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    // New window
    buckets.set(key, { tokens: limit - cost, windowStart: now });
    return true;
  }

  if (bucket.tokens < cost) return false;

  bucket.tokens -= cost;
  return true;
}

// Evict stale buckets periodically
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, b] of buckets) {
    if (b.windowStart < cutoff) buckets.delete(k);
  }
}, WINDOW_MS);

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Webhook routes are exempt
  if (req.path.startsWith("/v1/webhooks")) {
    next();
    return;
  }

  const role = req.auth?.role ?? "anon";
  const identity = req.auth ? `${req.auth.tenantId}:${req.auth.userId}` : req.ip ?? "unknown";
  const key = `${role}:${identity}`;
  const limit = getLimit(role);

  // Authenticated GET reads are free — they never consume rate-limit tokens.
  // This prevents background refetches (React Query 60s interval + onSettled
  // invalidation) from exhausting the bucket and triggering 429 storms.
  const isAuthenticatedRead = req.auth && req.method === "GET";
  if (isAuthenticatedRead) { next(); return; }

  // Unauthenticated requests cost 1; authenticated writes cost 2.
  const cost = req.auth ? 2 : 1;

  const allowed = consume(key, limit, cost);
  if (!allowed) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({
      code: "RATE_LIMITED",
      message: "Too many requests. Please retry after 60 seconds.",
      trace_id: req.traceId ?? "",
      retryable: true
    });
    return;
  }

  next();
}
