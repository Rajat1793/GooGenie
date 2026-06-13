/**
 * Auto-seed on first startup.
 * Creates Anirudh (Big Boss) + Hitesh + Piyush if they don't exist yet.
 * Safe to run multiple times — uses upsert/onConflictDoNothing.
 */
import { hash } from "bcryptjs";
import { db, schema } from "../db/client.js";
import { env } from "../security/env.js";

const TENANT_ID = env.DEFAULT_TENANT_ID;

const ACCOUNTS = [
  {
    id: "admin-super",
    email: "anirudh@googenie.ai",
    displayName: "Anirudh",
    role: "super_admin" as const,
    password: "SuperAdmin@2024",
    managerUserId: null as string | null,
  },
  {
    id: "teacher-hitesh",
    email: "hitesh@googenie.ai",
    displayName: "Hitesh Choudhary",
    role: "manager_admin" as const,
    password: "Hitesh@2024",
    managerUserId: "admin-super",
  },
  {
    id: "teacher-piyush",
    email: "piyush@googenie.ai",
    displayName: "Piyush Garg",
    role: "manager_admin" as const,
    password: "Piyush@2024",
    managerUserId: "admin-super",
  },
];

export async function seedOnStartup(): Promise<void> {
  try {
    // Ensure tenant exists
    await db.insert(schema.tenants)
      .values({ id: TENANT_ID, name: "GooGenie" })
      .onConflictDoNothing();

    for (const acc of ACCOUNTS) {
      const passwordHash = await hash(acc.password, 12);
      await db.insert(schema.users)
        .values({
          id: acc.id,
          tenantId: TENANT_ID,
          email: acc.email,
          displayName: acc.displayName,
          role: acc.role,
          passwordHash,
          managerUserId: acc.managerUserId,
          isActive: true,
        })
        .onConflictDoNothing(); // skip if already exists

      const features = ["email_read", "calendar_read", "calendar_write"];
      for (const fk of features) {
        await db.insert(schema.userFeatureAccess)
          .values({ tenantId: TENANT_ID, userId: acc.id, featureKey: fk, isEnabled: true })
          .onConflictDoNothing();
      }
    }
    console.log(`[seed] Accounts ready: Anirudh, Hitesh, Piyush in tenant '${TENANT_ID}'`);
  } catch (err) {
    // Non-fatal — log and continue
    console.warn("[seed] Auto-seed warning:", (err as Error).message);
  }
}
