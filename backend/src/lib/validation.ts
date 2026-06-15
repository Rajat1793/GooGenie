/**
 * Zod validation helpers shared across all routes.
 *
 * Eliminates the 20+ instances of:
 *   const parsed = schema.safeParse(req.body);
 *   if (!parsed.success) throw createApiError("VALIDATION_ERROR", "...", false, req.traceId);
 *   const { ... } = parsed.data;
 *
 * Usage:
 *   const data = validateBody(schema, req, "Invalid xyz payload");
 *   const query = validateQuery(querySchema, req);
 *
 * The helper throws on validation failure (caught by the global error
 * middleware) so the call site is a single line.
 */
import type { Request } from "express";
import type { z } from "zod";
import { createApiError } from "../security/errors.js";

/**
 * Parses `req.body` against the schema. On failure, throws a 400
 * VALIDATION_ERROR with the supplied message (default: "Invalid request body").
 *
 * Uses `z.infer<S>` so schemas with `.default(...)` resolve to their *output*
 * type (defaults applied) — matching the historical `parsed.data` typing.
 */
export function validateBody<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  message = "Invalid request body"
): z.infer<S> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw createApiError("VALIDATION_ERROR", message, false, req.traceId);
  }
  return parsed.data;
}

/**
 * Parses `req.query` against the schema. On failure, throws a 400
 * VALIDATION_ERROR with the supplied message (default: "Invalid query params").
 */
export function validateQuery<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  message = "Invalid query params"
): z.infer<S> {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    throw createApiError("VALIDATION_ERROR", message, false, req.traceId);
  }
  return parsed.data;
}
