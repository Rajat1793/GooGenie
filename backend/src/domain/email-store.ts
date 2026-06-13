export interface EmailThread {
  id: string;
  tenantId: string;
  ownerUserId: string;
  subject: string;
  snippet: string;
  from: string;
  updatedAt: string;
  isUnread: boolean;
  labelIds: string[];
}

const threads: EmailThread[] = [];

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
