/**
 * S3-7: Staging seed script
 * Run: pnpm tsx scripts/seed-staging.ts
 *
 * Outputs a JSON fixture that can be loaded by the in-memory policy store
 * or applied to Postgres via drizzle seed. Covers all role hierarchy scenarios:
 *  - 2 tenants (alpha-corp, beta-org)
 *  - Deep hierarchy: super_admin → manager_admin → manager_admin → user
 *  - Cross-tenant isolation scenario
 *  - Inactive user scenario
 *  - Feature toggle matrix (all combos)
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedUser {
  id: string;
  tenantId: string;
  role: "super_admin" | "manager_admin" | "user";
  email: string;
  displayName: string;
  managerUserId?: string;
  isActive: boolean;
}

interface SeedFeatureToggle {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}

const FEATURES = ["email_read", "email_write", "calendar_read", "calendar_write", "ai_summary", "ai_compose"];

function allFeatures(tenantId: string, userId: string, enabled: boolean): SeedFeatureToggle[] {
  return FEATURES.map((f) => ({ tenantId, userId, featureKey: f, isEnabled: enabled }));
}

// ── Tenant: alpha-corp ──────────────────────────────────────────────────
const T1 = "alpha-corp";

const alphaCorp: SeedUser[] = [
  { id: "alpha-super-1", tenantId: T1, role: "super_admin", email: "admin@alpha-corp.dev", displayName: "Alpha Super Admin", isActive: true },
  // Tier 1 managers (report to super)
  { id: "alpha-mgr-1", tenantId: T1, role: "manager_admin", email: "mgr1@alpha-corp.dev", displayName: "Alpha Manager 1", managerUserId: "alpha-super-1", isActive: true },
  { id: "alpha-mgr-2", tenantId: T1, role: "manager_admin", email: "mgr2@alpha-corp.dev", displayName: "Alpha Manager 2", managerUserId: "alpha-super-1", isActive: true },
  // Tier 2 manager (nested — reports to alpha-mgr-1)
  { id: "alpha-mgr-3", tenantId: T1, role: "manager_admin", email: "mgr3@alpha-corp.dev", displayName: "Alpha Sub-Manager", managerUserId: "alpha-mgr-1", isActive: true },
  // Users under mgr-1
  { id: "alpha-user-1", tenantId: T1, role: "user", email: "user1@alpha-corp.dev", displayName: "Alpha User 1", managerUserId: "alpha-mgr-1", isActive: true },
  { id: "alpha-user-2", tenantId: T1, role: "user", email: "user2@alpha-corp.dev", displayName: "Alpha User 2", managerUserId: "alpha-mgr-1", isActive: true },
  // Users under mgr-3 (nested)
  { id: "alpha-user-3", tenantId: T1, role: "user", email: "user3@alpha-corp.dev", displayName: "Alpha User 3", managerUserId: "alpha-mgr-3", isActive: true },
  // Users under mgr-2
  { id: "alpha-user-4", tenantId: T1, role: "user", email: "user4@alpha-corp.dev", displayName: "Alpha User 4", managerUserId: "alpha-mgr-2", isActive: true },
  // Inactive user scenario
  { id: "alpha-user-5", tenantId: T1, role: "user", email: "user5@alpha-corp.dev", displayName: "Alpha User 5 (inactive)", managerUserId: "alpha-mgr-2", isActive: false }
];

// ── Tenant: beta-org (cross-tenant isolation) ───────────────────────────
const T2 = "beta-org";

const betaOrg: SeedUser[] = [
  { id: "beta-super-1", tenantId: T2, role: "super_admin", email: "admin@beta-org.dev", displayName: "Beta Super Admin", isActive: true },
  { id: "beta-mgr-1", tenantId: T2, role: "manager_admin", email: "mgr1@beta-org.dev", displayName: "Beta Manager 1", managerUserId: "beta-super-1", isActive: true },
  { id: "beta-user-1", tenantId: T2, role: "user", email: "user1@beta-org.dev", displayName: "Beta User 1", managerUserId: "beta-mgr-1", isActive: true }
];

const allUsers = [...alphaCorp, ...betaOrg];

// Feature toggle matrix — varied per user to exercise all code paths
const featureToggles: SeedFeatureToggle[] = [
  ...allFeatures(T1, "alpha-super-1", true),
  ...allFeatures(T1, "alpha-mgr-1", true),
  ...allFeatures(T1, "alpha-mgr-2", true),
  ...allFeatures(T1, "alpha-mgr-3", true),
  // user-1: all on
  ...allFeatures(T1, "alpha-user-1", true),
  // user-2: partial
  { tenantId: T1, userId: "alpha-user-2", featureKey: "email_read", isEnabled: true },
  { tenantId: T1, userId: "alpha-user-2", featureKey: "email_write", isEnabled: false },
  { tenantId: T1, userId: "alpha-user-2", featureKey: "calendar_read", isEnabled: true },
  { tenantId: T1, userId: "alpha-user-2", featureKey: "calendar_write", isEnabled: false },
  { tenantId: T1, userId: "alpha-user-2", featureKey: "ai_summary", isEnabled: true },
  { tenantId: T1, userId: "alpha-user-2", featureKey: "ai_compose", isEnabled: false },
  // user-3: AI-only
  { tenantId: T1, userId: "alpha-user-3", featureKey: "email_read", isEnabled: false },
  { tenantId: T1, userId: "alpha-user-3", featureKey: "email_write", isEnabled: false },
  { tenantId: T1, userId: "alpha-user-3", featureKey: "calendar_read", isEnabled: false },
  { tenantId: T1, userId: "alpha-user-3", featureKey: "calendar_write", isEnabled: false },
  { tenantId: T1, userId: "alpha-user-3", featureKey: "ai_summary", isEnabled: true },
  { tenantId: T1, userId: "alpha-user-3", featureKey: "ai_compose", isEnabled: true },
  // user-4: all off
  ...allFeatures(T1, "alpha-user-4", false),
  // inactive user — features don't matter but seed anyway
  ...allFeatures(T1, "alpha-user-5", false),
  // beta tenant
  ...allFeatures(T2, "beta-super-1", true),
  ...allFeatures(T2, "beta-mgr-1", true),
  ...allFeatures(T2, "beta-user-1", true)
];

const fixture = { users: allUsers, featureToggles };

const outPath = join(__dirname, "../fixtures/staging-seed.json");
import { mkdirSync } from "node:fs";
mkdirSync(join(__dirname, "../fixtures"), { recursive: true });
writeFileSync(outPath, JSON.stringify(fixture, null, 2));

console.log(`✓ Staging seed written to ${outPath}`);
console.log(`  Users:          ${allUsers.length} (${allUsers.filter(u => u.isActive).length} active, ${allUsers.filter(u => !u.isActive).length} inactive)`);
console.log(`  Feature toggles: ${featureToggles.length}`);
console.log(`  Tenants:         ${[...new Set(allUsers.map(u => u.tenantId))].join(", ")}`);
