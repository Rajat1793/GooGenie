/**
 * Auto-categorize orchestrator (Feature A4).
 *
 * Given a tenant + a set of recent unread inbox messages, classifies each
 * with Mistral (one cheap call per message) into a small enum, ensures the
 * matching Gmail label exists, and applies it via Corsair.
 *
 * Categories:
 *   needs_reply   — direct ask, question, or thread continuation that wants you
 *   fyi           — informational from a colleague / report
 *   newsletter    — promotional / digest / list mail
 *   calendar_invite — ICS / meeting request / scheduling
 *   spam_like     — likely junk we'd not act on
 *
 * Each gets a Gmail label "Googenie/<category>" so the labels stay grouped.
 */
import {
  fetchRecentUnreadInbox,
  ensureGmailLabel,
  modifyThreadLabels,
  type UnreadInboxMessage,
} from "./gmail";
import { chat, isAiAvailable } from "./openai";

export type AutoCategory =
  | "needs_reply"
  | "fyi"
  | "newsletter"
  | "calendar_invite"
  | "spam_like";

const CATEGORY_LABEL: Record<AutoCategory, string> = {
  needs_reply: "Googenie/Needs Reply",
  fyi: "Googenie/FYI",
  newsletter: "Googenie/Newsletter",
  calendar_invite: "Googenie/Invite",
  spam_like: "Googenie/Suspicious",
};

const VALID_CATEGORIES: AutoCategory[] = [
  "needs_reply",
  "fyi",
  "newsletter",
  "calendar_invite",
  "spam_like",
];

function fallbackClassify(msg: UnreadInboxMessage): AutoCategory {
  const blob = `${msg.subject}\n${msg.snippet}`.toLowerCase();
  if (/list-unsubscribe|unsubscribe|newsletter|digest|deals?/.test(blob)) return "newsletter";
  if (/\binvite|invitation|\.ics\b|when2meet|calendly|let's meet|meeting on|conference call/.test(blob)) return "calendar_invite";
  if (/\?(?!.*unsubscribe)|please reply|please respond|need your|action required|approve/.test(blob)) return "needs_reply";
  if (/security alert|unusual sign in|account suspended/.test(blob)) return "spam_like";
  return "fyi";
}

async function classifyOne(msg: UnreadInboxMessage): Promise<AutoCategory> {
  if (!isAiAvailable()) return fallbackClassify(msg);
  const prompt = `Classify this email into ONE of these categories: needs_reply, fyi, newsletter, calendar_invite, spam_like.

Definitions:
- needs_reply: a person is asking the user something or expects a response.
- fyi: informational mail from a real person or system the user knows; no reply expected.
- newsletter: promotional, marketing, digest, or list-style mail.
- calendar_invite: meeting invite, scheduling request, ICS attachment.
- spam_like: suspicious, phishing-like, or clearly unwanted.

From: ${msg.from}
Subject: ${msg.subject}
Snippet: ${msg.snippet}

Respond with STRICT JSON: { "category": "needs_reply" | "fyi" | "newsletter" | "calendar_invite" | "spam_like" }`;
  const raw = await chat(prompt, "You return ONLY a single JSON object.", { jsonMode: true, maxTokens: 60 }).catch(() => null);
  if (!raw) return fallbackClassify(msg);
  try {
    const parsed = JSON.parse(raw) as { category?: string };
    if (parsed.category && (VALID_CATEGORIES as string[]).includes(parsed.category)) {
      return parsed.category as AutoCategory;
    }
  } catch {
    /* fall through */
  }
  return fallbackClassify(msg);
}

export interface AutoCategorizeResult {
  scanned: number;
  categorized: number;
  by_category: Record<AutoCategory, number>;
  examples: Array<{ thread_id: string; subject: string; category: AutoCategory }>;
}

export async function runAutoCategorize(
  tenantId: string,
  limit = 10,
): Promise<AutoCategorizeResult> {
  const msgs = await fetchRecentUnreadInbox(tenantId, limit);
  const byCategory: Record<AutoCategory, number> = {
    needs_reply: 0,
    fyi: 0,
    newsletter: 0,
    calendar_invite: 0,
    spam_like: 0,
  };
  const examples: AutoCategorizeResult["examples"] = [];
  let categorized = 0;
  for (const msg of msgs) {
    const category = await classifyOne(msg);
    const labelName = CATEGORY_LABEL[category];
    const labelId = await ensureGmailLabel(tenantId, labelName);
    if (!labelId) continue;
    try {
      await modifyThreadLabels(tenantId, msg.threadId, [labelId], []);
      byCategory[category] += 1;
      categorized += 1;
      if (examples.length < 8) {
        examples.push({ thread_id: msg.threadId, subject: msg.subject, category });
      }
    } catch {
      /* keep going on individual failures */
    }
  }
  return {
    scanned: msgs.length,
    categorized,
    by_category: byCategory,
    examples,
  };
}
