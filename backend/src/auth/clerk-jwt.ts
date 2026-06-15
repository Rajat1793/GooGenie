/**
 * Verifies Clerk-issued JWTs using Clerk's public JWKS endpoint.
 *
 * Clerk JWTs are standard RS256 tokens. The JWKS URL is derived from
 * the publishable key: pk_test_<base64(frontend-api-domain)>
 *
 * Payload shape: { sub: "user_xxx", azp, iss, exp, iat, ... }
 */
import { createRequire } from "node:module";
import https from "node:https";
const _require = createRequire(import.meta.url);
// eslint-disable-next-line
const jwt = _require("jsonwebtoken") as typeof import("jsonwebtoken");
import JwksRsa from "jwks-rsa";
import { env } from "../security/env.js";

export interface ClerkJWTPayload {
  sub: string;       // Clerk user ID e.g. user_3F4JHShaPhPfFI0FYluG1Y8MVlX
  azp?: string;      // authorized party
  iss: string;       // issuer  e.g. https://proven-crab-79.clerk.accounts.dev
  exp: number;
  iat: number;
  // Clerk public metadata is NOT in the JWT by default — role comes from here if configured
  org_role?: string;
}

function getJwksUri(): string | null {
  const pk = env.CLERK_PUBLISHABLE_KEY;
  if (!pk) return null;
  // pk_test_<base64url(frontend-api-host)>$  →  decode the middle part
  const match = pk.match(/^pk_(test|live)_(.+)$/);
  if (!match) return null;
  try {
    const host = Buffer.from(match[2], "base64url").toString("utf8").replace(/\$+$/, "");
    return `https://${host}/.well-known/jwks.json`;
  } catch {
    return null;
  }
}

const jwksUri = getJwksUri();

const jwksClient = jwksUri
  ? JwksRsa({
      jwksUri,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 10 * 60 * 1000, // 10 minutes
      // On corporate/dev networks with SSL inspection the JWKS fetch fails with
      // "unable to get local issuer certificate". Use a permissive agent in dev only.
      requestHeaders: {},
      ...(env.NODE_ENV !== "production" && {
        requestAgent: new https.Agent({ rejectUnauthorized: false })
      })
    })
  : null;

/**
 * Pre-fetch all signing keys from Clerk's JWKS endpoint so the cache is warm
 * before the first real request arrives. Call once at server startup.
 */
export async function prewarmJwksCache(): Promise<void> {
  if (!jwksClient) return;
  try {
    await jwksClient.getSigningKeys();
    console.log("[clerk-jwt] JWKS pre-warmed ✓");
  } catch (err) {
    console.warn("[clerk-jwt] JWKS pre-warm failed (will retry on first request):", (err as Error).message);
  }
}

export async function verifyClerkJWT(token: string): Promise<ClerkJWTPayload | null> {
  if (!jwksClient) return null;

  try {
    // Decode header to get kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.header.kid) return null;

    // Fetch signing key
    const signingKey = await jwksClient.getSigningKey(decoded.header.kid);
    const publicKey = signingKey.getPublicKey();

    // Verify signature + expiry
    const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as ClerkJWTPayload;
    return payload;
  } catch {
    return null;
  }
}

/** Returns true if the token looks like a Clerk JWT (has 3 parts, RS256 header) */
export function looksLikeClerkJWT(token: string): boolean {
  try {
    const decoded = jwt.decode(token, { complete: true });
    return Boolean(decoded && typeof decoded !== "string" && decoded.header.alg === "RS256");
  } catch {
    return false;
  }
}
