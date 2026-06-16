/**
 * Validates that Corsair can reach Gmail and Google Calendar for tenant 'dev'.
 * Run after completing the OAuth flow:
 *   CORSAIR_KEK=... pnpm tsx scripts/validate-phase-a.ts
 */
import "dotenv/config";
import { corsair } from "../src/integrations/corsair.js";

const TENANT = "dev";

async function validateGmail() {
  console.log("\n── Gmail ───────────────────────────────────────────");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = corsair.withTenant(TENANT) as any;
  const result = await tenant.gmail.api.threads.list({ maxResults: 5, labelIds: ["INBOX"] });
  const threads = result?.threads ?? [];
  console.log(`  ✓ ${threads.length} thread(s) returned`);
  threads.slice(0, 3).forEach((t: { id?: string; snippet?: string }) => {
    console.log(`    [${t.id}] ${(t.snippet ?? "").slice(0, 60)}`);
  });
}

async function validateCalendar() {
  console.log("\n── Google Calendar ─────────────────────────────────");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = corsair.withTenant(TENANT) as any;
  const result = await tenant.googlecalendar.api.events.getMany({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: 5,
    singleEvents: true,
    orderBy: "startTime"
  });
  const events = result?.items ?? [];
  console.log(`  ✓ ${events.length} event(s) returned`);
  events.slice(0, 3).forEach((e: { id?: string; summary?: string; start?: { dateTime?: string } }) => {
    console.log(`    [${e.id}] ${e.summary ?? "Untitled"} @ ${e.start?.dateTime ?? "?"}`);
  });
}

(async () => {
  console.log("Validating Corsair Phase A connections for tenant:", TENANT);
  try {
    await validateGmail();
    await validateCalendar();
    console.log("\n✓ Phase A validation complete — both integrations live\n");
  } catch (err) {
    console.error("\n✗ Validation failed:", err);
    console.error("  Run the OAuth flow first:");
    console.error("    CORSAIR_KEK=... pnpm corsair auth --plugin=gmail --tenant=dev");
    console.error("    CORSAIR_KEK=... pnpm corsair auth --plugin=googlecalendar --tenant=dev\n");
    process.exit(1);
  }
})();
