/**
 * POST /api/v1/email/newsletters/unsubscribe
 *
 * Body: { senders: Array<{ email: string; urls: string[]; oneClick?: boolean; latestThreadId?: string }> }
 *
 * For each sender:
 *   1. Hit the first https URL (POST + List-Unsubscribe=One-Click if oneClick=true, else GET)
 *   2. (Optional) tag the latest thread with the GooGenie/Unsubscribed label so the user can
 *      see what was actioned.
 *
 * Returns per-sender outcome so the UI can show ✓ / ✗ / no-action.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { ensureGmailLabel, modifyThreadLabels } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  senders: z
    .array(
      z.object({
        email: z.string().email(),
        urls: z.array(z.string().min(1)).min(1),
        oneClick: z.boolean().optional(),
        latestThreadId: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(50),
});

async function attemptUnsubscribe(
  urls: string[],
  oneClick: boolean,
): Promise<{ ok: boolean; status?: number; usedUrl?: string; error?: string }> {
  const httpsUrl = urls.find((u) => /^https?:\/\//i.test(u));
  if (!httpsUrl) {
    // Only mailto: → we don't auto-send unsubscribe emails (would forge headers).
    return { ok: false, error: "Only mailto unsubscribe — open in mail client manually." };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const init: RequestInit = oneClick
      ? {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
          signal: controller.signal,
        }
      : {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
        };
    const res = await fetch(httpsUrl, init);
    clearTimeout(timeout);
    return { ok: res.ok, status: res.status, usedUrl: httpsUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "ai_unsubscribe_sweep");
  if (gate) return gate;
  const parsed = await validateBody(bodySchema, req, { traceId, message: "Invalid unsubscribe payload" });
  if (!parsed.ok) return parsed.response;

  const tenant = getCorsairTenant(auth!.userId);
  const archivedLabelId = await ensureGmailLabel(tenant, "Googenie/Unsubscribed");

  const results = await Promise.all(
    parsed.data.senders.map(async (s) => {
      const r = await attemptUnsubscribe(s.urls, !!s.oneClick);
      // Best-effort: tag the latest thread so the user has a paper trail.
      if (r.ok && s.latestThreadId && archivedLabelId) {
        try {
          await modifyThreadLabels(tenant, s.latestThreadId, [archivedLabelId], []);
        } catch {
          /* tagging is cosmetic — don't fail the whole call */
        }
      }
      return { email: s.email, ...r };
    }),
  );

  return NextResponse.json({ results });
});
