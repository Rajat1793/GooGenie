/**
 * PostgreSQL database connection via Drizzle ORM.
 * Connection string comes from DATABASE_URL env variable.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/googenie",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });
export { schema };

/**
 * Run additive migrations (ALTER TABLE IF NOT EXISTS) so the live DB
 * stays in sync with schema.ts without requiring a full migration tool.
 * Safe to call on every startup — all statements are idempotent.
 */
export async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS password_hash TEXT;

      CREATE INDEX IF NOT EXISTS users_clerk_user_id_idx ON users(clerk_user_id);

      -- Ensure all three role-based tenants exist.
      -- super_admin → dev-admin | manager_admin → dev-teachers | user → dev-students
      INSERT INTO tenants (id, name) VALUES
        ('dev-admin',    'GooGenie Admins'),
        ('dev-teachers', 'GooGenie Teachers'),
        ('dev-students', 'GooGenie Students')
      ON CONFLICT (id) DO NOTHING;
    `);
  } finally {
    client.release();
  }
}
