import { corsair } from "../src/integrations/corsair.js";

for (const tenantId of ["dev", "new-user-id"]) {
  const tenant = corsair.withTenant(tenantId);
  const result: Record<string, boolean> = {};
  for (const plugin of ["gmail", "googlecalendar"] as const) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = (tenant as any)[plugin]?.keys;
      const token = keys ? await keys.get_access_token() : null;
      result[plugin] = typeof token === "string" && token.length > 0;
    } catch {
      result[plugin] = false;
    }
  }
  console.log(`Status for ${tenantId}:`, result);
}
process.exit(0);
