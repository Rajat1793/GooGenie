/**
 * Gmail integration wrapper — normalizes Corsair Gmail API responses into
 * the EmailThread shape used by content routes.
 *
 * Falls back to the in-memory store when the tenant has not connected Gmail.
 */
import { corsair, isCorsairConfigured } from "./corsair.js";
import { listEmailThreads, getEmailThreadById } from "../domain/email-store.js";
import type { EmailThread } from "../domain/email-store.js";

/** Build a minimal RFC 2822 raw message (base64url encoded) */
function buildRawMessage(opts: {
  to: string;
  subject: string;
  body: string;
  from?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    "",
    opts.body
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

/**
 * List email threads for a tenant/user via Gmail API.
 * Returns normalized EmailThread[] compatible with the existing API contract.
 */
export async function fetchGmailThreads(
  tenantId: string,
  userId: string,
  maxResults = 10
): Promise<EmailThread[]> {
  if (!isCorsairConfigured()) {
    return listEmailThreads(tenantId, new Set([userId]));
  }

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).gmail.api.threads.list({
      maxResults,
      labelIds: ["INBOX"]
    });

    const rawThreads: Array<{ id?: string; snippet?: string; historyId?: string }> =
      result?.threads ?? [];

    return rawThreads.map((t) => ({
      id: t.id ?? crypto.randomUUID(),
      tenantId,
      ownerUserId: userId,
      subject: `Thread ${t.id ?? "unknown"}`,
      snippet: t.snippet ?? "",
      updatedAt: new Date().toISOString()
    }));
  } catch {
    // Tenant not connected or token expired — fall back to mock data
    return listEmailThreads(tenantId, new Set([userId]));
  }
}

/**
 * Get a single Gmail thread by ID.
 * Falls back to in-memory store if not connected.
 * @param scopedIds - additional user IDs in scope (e.g. manager viewing a report's thread)
 */
export async function fetchGmailThread(
  tenantId: string,
  threadId: string,
  userId: string,
  scopedIds?: Set<string>
): Promise<EmailThread | undefined> {
  if (!isCorsairConfigured()) {
    return getEmailThreadById(tenantId, threadId, scopedIds ?? new Set([userId]));
  }

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).gmail.api.threads.get({ id: threadId });

    if (!result) return undefined;

    const messages: Array<{ payload?: { headers?: Array<{ name?: string; value?: string }> } }> =
      result.messages ?? [];
    const subjectHeader = messages[0]?.payload?.headers?.find(
      (h) => h.name?.toLowerCase() === "subject"
    );

    return {
      id: result.id ?? threadId,
      tenantId,
      ownerUserId: userId,
      subject: subjectHeader?.value ?? `Thread ${threadId}`,
      snippet: result.snippet ?? "",
      updatedAt: new Date().toISOString()
    };
  } catch {
    return getEmailThreadById(tenantId, threadId, scopedIds ?? new Set([userId]));
  }
}

/**
 * Send a new email via Gmail API.
 */
export async function sendEmail(
  tenantId: string,
  opts: { to: string; subject: string; body: string }
): Promise<{ id?: string; threadId?: string }> {
  const raw = buildRawMessage(opts);
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tenant as any).gmail.api.messages.send({ raw });
}

/**
 * Reply to an existing Gmail thread.
 */
export async function replyToThread(
  tenantId: string,
  opts: { threadId: string; to: string; subject: string; body: string; messageId?: string }
): Promise<{ id?: string; threadId?: string }> {
  const raw = buildRawMessage({
    to: opts.to,
    subject: opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`,
    body: opts.body,
    inReplyTo: opts.messageId,
    references: opts.messageId
  });
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tenant as any).gmail.api.messages.send({ raw, threadId: opts.threadId });
}

/**
 * Modify labels on a Gmail thread (add/remove).
 */
export async function modifyThreadLabels(
  tenantId: string,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<{ id?: string }> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tenant as any).gmail.api.threads.modify({ id: threadId, addLabelIds, removeLabelIds });
}

