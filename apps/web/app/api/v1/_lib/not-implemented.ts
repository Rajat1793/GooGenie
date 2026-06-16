/**
 * Returns a uniform "not yet ported from backend/" 501 envelope so the
 * Next.js API surface is complete even before every Express endpoint has
 * been mirrored. See migration_plan.md Phase 6 for the porting plan.
 *
 * Replace these wrappers with native handlers as part of the follow-up
 * porting passes.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";

export function notImplementedHandler(name: string) {
  return withApiMiddleware(
    async (_req, { traceId }) => {
      const err = {
        ...createApiError("INTERNAL_ERROR", `Endpoint "${name}" is scaffolded but not yet ported. See migration_plan.md Phase 6.`, false, traceId),
        not_implemented: true,
      };
      return NextResponse.json(err, { status: 501 });
    },
    { auth: false, rateLimit: false, idempotent: false }
  );
}
