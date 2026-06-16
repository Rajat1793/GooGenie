/**
 * Phase A bootstrap: create Corsair DB tables and print OAuth instructions.
 * Run: pnpm tsx scripts/corsair-setup.ts
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(import.meta.url));
// eslint-disable-next-line
const SqliteDB = require("better-sqlite3");
const db = new SqliteDB("./corsair.db");

// Create Corsair's 4 required tables (schema from docs.corsair.dev)
db.exec(`
  CREATE TABLE IF NOT EXISTS corsair_integrations (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    name TEXT NOT NULL, config TEXT NOT NULL, dek TEXT
  );
  CREATE TABLE IF NOT EXISTS corsair_accounts (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    tenant_id TEXT NOT NULL, integration_id TEXT NOT NULL, config TEXT NOT NULL, dek TEXT
  );
  CREATE TABLE IF NOT EXISTS corsair_entities (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    account_id TEXT NOT NULL, entity_id TEXT NOT NULL, entity_type TEXT NOT NULL,
    version TEXT NOT NULL, data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS corsair_events (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    account_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT
  );
`);

// eslint-disable-next-line
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("\n✓ Corsair DB initialized");
console.log("  Tables:", tables.map((t: Record<string,string>) => t.name).join(", "));
console.log("\n─────────────────────────────────────────────────────");
console.log("Next: authorize Gmail + Google Calendar tokens");
console.log("(This will open a browser for Google consent)\n");
console.log("  CORSAIR_KEK=fCeQPjhhLjlkOX8yGOKArro78Djfo2npJKlEPAZCW9Q= \\");
console.log("  pnpm corsair auth --plugin=gmail --tenant=dev");
console.log("\n  CORSAIR_KEK=fCeQPjhhLjlkOX8yGOKArro78Djfo2npJKlEPAZCW9Q= \\");
console.log("  pnpm corsair auth --plugin=googlecalendar --tenant=dev");
console.log("\nPhase A success criteria:");
console.log("  ✓ Both plugins authenticated");
console.log("  ✓ pnpm tsx scripts/validate-phase-a.ts returns real emails/events");
console.log("─────────────────────────────────────────────────────\n");
