/// <reference path="../contracts/request.d.ts" />
import type { NextFunction, Request, Response } from "express";

import { createApiError } from "./errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function createRateLimitMiddleware(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options;

  return function rateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = `${req.path}:${req.auth?.userId ?? req.ip}`;
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      next(createApiError("TOO_MANY_REQUESTS", "Rate limit exceeded for this route", true, req.traceId));
      return;
    }

    next();
  };
}

export function resetRateLimitBuckets(): void {
  buckets.clear();
}
