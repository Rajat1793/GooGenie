-- Phase 8: Corsair token store tables (migrated from SQLite to Postgres).
-- Schema mirrors backend/node_modules/corsair/dist/db.d.ts CorsairKyselyDatabase.
-- Idempotent — also created at boot in runStartupMigrations() so fresh dev DBs work.

CREATE TABLE IF NOT EXISTS corsair_integrations (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  config JSONB,
  dek TEXT
);

CREATE TABLE IF NOT EXISTS corsair_accounts (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  config JSONB,
  dek TEXT
);
CREATE INDEX IF NOT EXISTS corsair_accounts_tenant_idx
  ON corsair_accounts(tenant_id, integration_id);

CREATE TABLE IF NOT EXISTS corsair_entities (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  version TEXT NOT NULL,
  data JSONB
);
CREATE INDEX IF NOT EXISTS corsair_entities_account_idx
  ON corsair_entities(account_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS corsair_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  status TEXT
);
CREATE INDEX IF NOT EXISTS corsair_events_account_idx
  ON corsair_events(account_id, event_type);

CREATE TABLE IF NOT EXISTS corsair_permissions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token TEXT NOT NULL,
  plugin TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  args TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS corsair_permissions_token_idx
  ON corsair_permissions(token);
