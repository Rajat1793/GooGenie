/**
 * Seeds Hitesh and Piyush as teachers (manager_admin) + generates their demo tokens.
 * Also updates labels to use GooGenie role names.
 */
import "dotenv/config";
import { hash } from "bcryptjs";
import { createAccessToken } from "../src/auth/token.js";
import { db, schema } from "../src/db/client.js";

const TENANT_ID = "dev";
const EXP = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

const teachers = [
  {
    id: "teacher-hitesh",
    email: "hitesh@googenie.ai",
    displayName: "Hitesh Choudhary",
    password: "Hitesh@2024",
    managerUserId: "admin-super",
  },
  {
    id: "teacher-piyush",
    email: "piyush@googenie.ai",
    displayName: "Piyush Garg",
    password: "Piyush@2024",
    managerUserId: "admin-super",
  },
];

async function seed() {
  console.log("Seeding teachers (Hitesh & Piyush)...");

  // Ensure tenant + super admin exist
  await db.insert(schema.tenants)
    .values({ id: TENANT_ID, name: "GooGenie" })
    .onConflictDoNothing();

  for (const t of teachers) {
    const passwordHash = await hash(t.password, 12);
    await db.insert(schema.users)
      .values({
        id: t.id,
        tenantId: TENANT_ID,
        email: t.email,
        displayName: t.displayName,
        role: "manager_admin",
        passwordHash,
        managerUserId: t.managerUserId,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { passwordHash, displayName: t.displayName, managerUserId: t.managerUserId, updatedAt: new Date() }
      });

    // Full feature access
    for (const fk of ["email_read", "calendar_read", "calendar_write"]) {
      await db.insert(schema.userFeatureAccess)
        .values({ tenantId: TENANT_ID, userId: t.id, featureKey: fk, isEnabled: true })
        .onConflictDoNothing();
    }

    const token = createAccessToken({ sub: t.id, tenant_id: TENANT_ID, role: "manager_admin", exp: EXP });
    console.log(`  ✓ ${t.displayName} (${t.email}) — password: ${t.password}`);
    console.log(`    token: ${token}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
