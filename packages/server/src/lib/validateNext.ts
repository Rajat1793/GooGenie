/**
 * Next.js-flavored zod validation helpers (Phase 2, step 10).
 *
 * Returns a discriminated union instead of throwing, so Route Handlers can
 * `return res.response` directly without depending on a global error
 * middleware.
 */
import type { z } from "zod";
import { NextResponse } from "next/server";
import { createApiError, statusFromApiError } from "../security/errors";

export type ParseOk<T> = { ok: true; data: T };
export type ParseErr = { ok: false; response: NextResponse };

function err(message: string, traceId?: string): ParseErr {
  const body = createApiError("VALIDATION_ERROR", message, false, traceId);
  return {
    ok: false,
    response: NextResponse.json(body, { status: statusFromApiError("VALIDATION_ERROR") }),
  };
}

export async function validateBody<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  opts: { traceId?: string; message?: string } = {}
): Promise<ParseOk<z.infer<S>> | ParseErr> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(opts.message ?? "Invalid JSON body", opts.traceId);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err(opts.message ?? "Invalid request body", opts.traceId);
  }
  return { ok: true, data: parsed.data };
}

export function validateQuery<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  opts: { traceId?: string; message?: string } = {}
): ParseOk<z.infer<S>> | ParseErr {
  const url = new URL(req.url);
  const raw: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const existing = raw[k];
    if (existing === undefined) {
      raw[k] = v;
    } else if (Array.isArray(existing)) {
      existing.push(v);
    } else {
      raw[k] = [existing, v];
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return err(opts.message ?? "Invalid query params", opts.traceId);
  }
  return { ok: true, data: parsed.data };
}
