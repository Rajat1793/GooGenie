// Next.js auto-loads .env.local; tsx-loader scripts also load .env. We keep
// `dotenv/config` out of the package source so webpack doesn't try to bundle
// dotenv (it pulls Node builtins like `fs`/`path` and breaks the client bundle).
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  NIMBUS_ACCESS_TOKEN_SECRET: z.string().min(1).default("nimbus-dev-secret-key-32chars-min-fallback"),
  NIMBUS_REFRESH_TOKEN_SECRET: z.string().min(1).default("nimbus-dev-refresh-key-32chars-min-fallback"),
  // Clerk — publishable key so backend can derive the JWKS endpoint for JWT verification
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  // Corsair SDK
  CORSAIR_KEK: z.string().min(32).optional(),
  // CORSAIR_DB_PATH retained as optional for backward-compat with legacy
  // backend/ during cutover. Phase 8: token storage moved to Postgres so this
  // is unused by @googenie/server (see integrations/corsair.ts).
  CORSAIR_DB_PATH: z.string().optional(),
  // Mistral / AI compatibility key (optional, graceful degradation)
  MISTRAL_API_KEY: z.string().optional(),
  // Google OAuth credentials (used by Corsair plugins)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // PostgreSQL
  DATABASE_URL: z.string().optional(),
  // Default tenant ID used when resolving Clerk JWTs (no tenant claim in token)
  DEFAULT_TENANT_ID: z.string().default("dev"),
  // Public backend URL for OAuth redirect URI (defaults to localhost for dev)
  BACKEND_URL: z.string().optional(),
  // Demo tokens (pre-generated HMAC tokens for demo accounts)
  DEMO_TOKEN_SUPER_ADMIN: z.string().optional(),
  DEMO_TOKEN_MANAGER: z.string().optional(),
  DEMO_TOKEN_USER: z.string().optional(),
  DEMO_TOKEN_HITESH: z.string().optional(),
  DEMO_TOKEN_PIYUSH: z.string().optional(),
  // Frontend origin for post-OAuth redirects
  FRONTEND_URL: z.string().optional(),
});

export const env = envSchema.parse(process.env);
