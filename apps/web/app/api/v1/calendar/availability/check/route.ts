import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { availabilityCheckSchema } from "@googenie/server/contracts/schemas";
import { checkAvailability } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "calendar_read");
  if (gate) return gate;
  const parsed = await validateBody(availabilityCheckSchema, req, { traceId, message: "Invalid availability check payload" });
  if (!parsed.ok) return parsed.response;
  const availability = await checkAvailability(getCorsairTenant(auth!.userId), {
    timeMin: parsed.data.time_min,
    timeMax: parsed.data.time_max,
    calendarIds: parsed.data.calendar_ids,
  });
  return NextResponse.json({ availability });
});
