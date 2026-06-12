/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { requireFeature } from "../auth/feature-gate.js";
import { getScopedUserIds } from "../auth/scope.js";
import { createCalendarEventSchema } from "../contracts/schemas.js";
import { listEmailThreads, getEmailThreadById } from "../domain/email-store.js";
import { listCalendarEvents, createCalendarEvent } from "../domain/calendar-store.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { paginate } from "../security/pagination.js";

export const contentRouter = Router();

contentRouter.get("/email/threads", requireAuth, requireFeature("email_read"), (req: Request, res: Response) => {
  const auth = req.auth!;
  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : auth.userId;
  if (!getScopedUserIds(req).has(requestedUserId)) throw createApiError("FORBIDDEN", "Requested user is out of scope", false, req.traceId);

  const threads = listEmailThreads(auth.tenantId, new Set([requestedUserId]));
  const page = paginate(threads, typeof req.query.cursor === "string" ? req.query.cursor : undefined, typeof req.query.limit === "string" ? req.query.limit : undefined);
  emitAuditEvent(req, "email_threads_read", { requested_user_id: requestedUserId, count: threads.length });
  res.status(200).json({ threads: page.items, total: page.total, next_cursor: page.next_cursor });
});

contentRouter.get("/email/threads/:threadId", requireAuth, requireFeature("email_read"), (req: Request, res: Response) => {
  const auth = req.auth!;
  const thread = getEmailThreadById(auth.tenantId, req.params.threadId, getScopedUserIds(req));
  if (!thread) throw createApiError("NOT_FOUND", "Thread not found in tenant scope", false, req.traceId);
  emitAuditEvent(req, "email_thread_read", { thread_id: thread.id });
  res.status(200).json({ thread });
});

contentRouter.get("/calendar/events", requireAuth, requireFeature("calendar_read"), (req: Request, res: Response) => {
  const auth = req.auth!;
  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : auth.userId;
  if (!getScopedUserIds(req).has(requestedUserId)) throw createApiError("FORBIDDEN", "Requested user is out of scope", false, req.traceId);

  const events = listCalendarEvents(auth.tenantId, new Set([requestedUserId]));
  const page = paginate(events, typeof req.query.cursor === "string" ? req.query.cursor : undefined, typeof req.query.limit === "string" ? req.query.limit : undefined);
  emitAuditEvent(req, "calendar_events_read", { requested_user_id: requestedUserId, count: events.length });
  res.status(200).json({ events: page.items, total: page.total, next_cursor: page.next_cursor });
});

contentRouter.post("/calendar/events", requireAuth, requireFeature("calendar_write"), (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = createCalendarEventSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid calendar event payload", false, req.traceId);

  const created = createCalendarEvent({ tenantId: auth.tenantId, ownerUserId: auth.userId, title: parsed.data.title, startsAt: parsed.data.starts_at, endsAt: parsed.data.ends_at, attendees: parsed.data.attendees });
  emitAuditEvent(req, "calendar_event_create", { event_id: created.id });
  res.status(201).json({ event: created });
});
