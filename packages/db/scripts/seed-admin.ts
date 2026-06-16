/**
 * Seeds the hardcoded super_admin and manager_admin accounts into PostgreSQL.
 * Run once: pnpm tsx scripts/seed-admin.ts
 *
 * Credentials:
 *   super@nimbus.dev     / SuperAdmin@2024
 *   manager@nimbus.dev   / Manager@2024
 */
import "dotenv/config";
import { hash } from "bcryptjs";
import { db, schema } from "../src/db/client.js";
import { eq, and } from "drizzle-orm";

const TENANT_ID = "dev";

const accounts = [
  {
    id: "admin-super",
    email: "anirudh@googenie.ai",
    displayName: "Anirudh",
    role: "super_admin" as const,
    password: "SuperAdmin@2024",
  },
];

async function seed() {
  console.log("Seeding admin accounts...");

  // Ensure tenant exists
  await db.insert(schema.tenants)
    .values({ id: TENANT_ID, name: "Nimbus Dev" })
    .onConflictDoNothing();

  for (const acc of accounts) {
    const passwordHash = await hash(acc.password, 12);
    await db.insert(schema.users)
      .values({
        id: acc.id,
        tenantId: TENANT_ID,
        email: acc.email,
        displayName: acc.displayName,
        role: acc.role,
        passwordHash,
        managerUserId: acc.managerUserId ?? null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { passwordHash, displayName: acc.displayName, role: acc.role, updatedAt: new Date() }
      });

    // Feature access
    const features = ["email_read", "calendar_read", "calendar_write"];
    for (const fk of features) {
      await db.insert(schema.userFeatureAccess)
        .values({ tenantId: TENANT_ID, userId: acc.id, featureKey: fk, isEnabled: true })
        .onConflictDoNothing();
    }

    console.log(`  ✓ ${acc.role}: ${acc.email} (password: ${acc.password})`);
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
