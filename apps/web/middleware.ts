/**
 * Clerk middleware (Phase 3, step 13).
 *
 * Matcher EXCLUDES /api/* — Route Handlers run their own dual-token
 * requireAuth() because:
 *  1. Clerk middleware runs on Edge runtime which can't load jsonwebtoken
 *  2. Mobile clients send HMAC demo tokens, not Clerk JWTs
 *  3. Webhook endpoints (/api/v1/webhooks/*) must stay anonymous
 *
 * UI pages still get Clerk SSR via clerkMiddleware() so server components
 * can call `auth()` from "@clerk/nextjs/server".
 */
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on every non-API, non-static page request.
    // Exclude: _next, api, anything with a file extension (favicon.ico, *.svg).
    "/((?!api|_next|.*\\..*).*)",
  ],
};
