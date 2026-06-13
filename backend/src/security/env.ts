import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  NIMBUS_ACCESS_TOKEN_SECRET: z.string().min(32),
  NIMBUS_REFRESH_TOKEN_SECRET: z.string().min(32),
  // Clerk — publishable key so backend can derive the JWKS endpoint for JWT verification
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  // Corsair SDK
  CORSAIR_KEK: z.string().min(32).optional(),
  CORSAIR_DB_PATH: z.string().default("./corsair.db"),
  // Google OAuth credentials (used by Corsair plugins)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional()
});

export const env = envSchema.parse(process.env);
