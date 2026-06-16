import { corsair } from "../src/integrations/corsair.js";

const tenant = corsair.withTenant("dev");

console.log("Testing Gmail...");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const threads = await (tenant as any).gmail.api.threads.list({ maxResults: 3, labelIds: ["INBOX"] });
console.log("Gmail OK — thread count:", threads?.threads?.length ?? 0);

console.log("Testing Calendar...");
const now = new Date().toISOString();
const tomorrow = new Date(Date.now() + 86400000).toISOString();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const events = await (tenant as any).googlecalendar.api.events.getMany({ timeMin: now, timeMax: tomorrow });
console.log("Calendar OK — event count:", Array.isArray(events) ? events.length : (events?.items?.length ?? 0));

process.exit(0);
