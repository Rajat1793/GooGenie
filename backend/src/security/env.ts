import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  NIMBUS_ACCESS_TOKEN_SECRET: z.string().min(32),
  NIMBUS_REFRESH_TOKEN_SECRET: z.string().min(32)
});

export const env = envSchema.parse(process.env);
