/// <reference path="../contracts/request.d.ts" />
import type { Request, Response, NextFunction } from "express";

interface CachedResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

/** In-memory idempotency store — replace with Redis in production */
const store = new Map<string, CachedResponse>();

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function evict(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

/**
 * Idempotency middleware for mutating endpoints (POST / PATCH / PUT).
 * Clients send `Idempotency-Key: <uuid>`.
 * On a repeated key within 24h the cached response is returned with
 * `Idempotency-Replayed: true`.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PATCH" && method !== "PUT") {
    next();
    return;
  }

  const key = req.headers["idempotency-key"];
  if (!key || typeof key !== "string") {
    next();
    return;
  }

  evict();

  const cacheKey = `${req.auth?.tenantId ?? "anon"}:${key}`;
  const cached = store.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Idempotency-Replayed", "true");
    res.status(cached.status).json(cached.body);
    return;
  }

  // Intercept response to cache it
  const origJson = res.json.bind(res);
  res.json = function (body: unknown) {
    if (res.statusCode < 500) {
      store.set(cacheKey, {
        status: res.statusCode,
        body,
        expiresAt: Date.now() + TTL_MS
      });
    }
    return origJson(body);
  };

  next();
}

/** Exported for test reset */
export function clearIdempotencyStore(): void {
  store.clear();
}
