import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  NIMBUS_ACCESS_TOKEN_SECRET: z.string().min(32),
  NIMBUS_REFRESH_TOKEN_SECRET: z.string().min(32),
  // Clerk — publishable key so backend can derive the JWKS endpoint for JWT verification
  CLERK_PUBLISHABLE_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
