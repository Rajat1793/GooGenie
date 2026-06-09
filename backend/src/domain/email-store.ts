export interface EmailThread {
  id: string;
  tenantId: string;
  ownerUserId: string;
  subject: string;
  snippet: string;
  updatedAt: string;
}

const threads: EmailThread[] = [
  {
    id: "thr-1",
    tenantId: "demo-tenant",
    ownerUserId: "user-1",
    subject: "Design sync follow-up",
    snippet: "Please share the latest mockups.",
    updatedAt: new Date().toISOString()
  },
  {
    id: "thr-2",
    tenantId: "demo-tenant",
    ownerUserId: "user-2",
    subject: "Customer escalation",
    snippet: "We need an ETA by EOD.",
    updatedAt: new Date().toISOString()
  },
  {
    id: "thr-3",
    tenantId: "demo-tenant",
    ownerUserId: "user-3",
    subject: "Roadmap review",
    snippet: "Can we lock V2 scope this week?",
    updatedAt: new Date().toISOString()
  }
];

export function listEmailThreads(tenantId: string, allowedUserIds: Set<string>): EmailThread[] {
  return threads.filter((thread) => thread.tenantId === tenantId && allowedUserIds.has(thread.ownerUserId));
}

export function getEmailThreadById(
  tenantId: string,
  threadId: string,
  allowedUserIds: Set<string>
): EmailThread | undefined {
  return threads.find(
    (thread) =>
      thread.id === threadId && thread.tenantId === tenantId && allowedUserIds.has(thread.ownerUserId)
  );
}
