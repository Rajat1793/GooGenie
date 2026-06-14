/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../auth/middleware.js";
import { requireFeature } from "../auth/feature-gate.js";
import { getScopedUserIds } from "../auth/scope.js";
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  sendEmailSchema,
  replyEmailSchema,
  modifyLabelsSchema,
  availabilityCheckSchema
} from "../contracts/schemas.js";
import { fetchGmailThreads, fetchGmailThread, sendEmail, replyToThread, modifyThreadLabels, trashThread, untrashThread, batchModifyMessages, listGmailLabels, listDrafts, createDraft, sendDraft, deleteDraft } from "../integrations/gmail.js";
import { fetchCalendarEvents, createGCalEvent, updateGCalEvent, deleteGCalEvent, getCalendarEvent, checkAvailability } from "../integrations/googlecalendar.js";
import { getCorsairTenant } from "../integrations/corsair-tenant.js";
import { publish } from "../integrations/event-bus.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { paginate } from "../security/pagination.js";

export const contentRouter = Router();

// ── Email threads ────────────────────────────────────────────────────────────

contentRouter.get("/email/threads", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : auth.userId;
    if (!getScopedUserIds(req).has(requestedUserId)) throw createApiError("FORBIDDEN", "Requested user is out of scope", false, req.traceId);

    const threads = await fetchGmailThreads(getCorsairTenant(auth.userId), requestedUserId, 10, typeof req.query.q === "string" ? req.query.q : undefined);
    const page = paginate(threads, typeof req.query.cursor === "string" ? req.query.cursor : undefined, typeof req.query.limit === "string" ? req.query.limit : undefined);
    emitAuditEvent(req, "email_threads_read", { requested_user_id: requestedUserId, count: threads.length });
    res.status(200).json({ threads: page.items, total: page.total, next_cursor: page.next_cursor });
  } catch (err) { next(err); }
});

contentRouter.get("/email/threads/:threadId", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const scopedIds = getScopedUserIds(req);
    const thread = await fetchGmailThread(getCorsairTenant(auth.userId), req.params.threadId, auth.userId, scopedIds);
    if (!thread) throw createApiError("NOT_FOUND", "Thread not found in tenant scope", false, req.traceId);
    emitAuditEvent(req, "email_thread_read", { thread_id: thread.id });
    res.status(200).json({ thread });
  } catch (err) { next(err); }
});

// ── Email send / reply ────────────────────────────────────────────────────────

contentRouter.post("/email/messages/send", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = sendEmailSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid send payload", false, req.traceId);

    const result = await sendEmail(getCorsairTenant(auth.userId), parsed.data);
    publish({ kind: "email.changed", userId: auth.userId, threadId: result.threadId });
    emitAuditEvent(req, "email_message_sent", { to: parsed.data.to, message_id: result.id });
    res.status(201).json({ message_id: result.id, thread_id: result.threadId });
  } catch (err) { next(err); }
});

contentRouter.post("/email/threads/:threadId/reply", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = replyEmailSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid reply payload", false, req.traceId);

    const result = await replyToThread(getCorsairTenant(auth.userId), {
      threadId: req.params.threadId,
      ...parsed.data,
      messageId: parsed.data.message_id
    });
    publish({ kind: "email.changed", userId: auth.userId, threadId: result.threadId ?? req.params.threadId });
    emitAuditEvent(req, "email_thread_replied", { thread_id: req.params.threadId, message_id: result.id });
    res.status(201).json({ message_id: result.id, thread_id: result.threadId });
  } catch (err) { next(err); }
});

// ── Thread labels ─────────────────────────────────────────────────────────────

contentRouter.patch("/email/threads/:threadId/labels", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = modifyLabelsSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid labels payload", false, req.traceId);

    const result = await modifyThreadLabels(
      getCorsairTenant(auth.userId),
      req.params.threadId,
      parsed.data.add_label_ids,
      parsed.data.remove_label_ids
    );
    publish({ kind: "email.changed", userId: auth.userId, threadId: req.params.threadId });
    emitAuditEvent(req, "email_thread_labels_modified", { thread_id: req.params.threadId });
    res.status(200).json({ thread_id: result.id ?? req.params.threadId });
  } catch (err) { next(err); }
});

// ── Calendar events ───────────────────────────────────────────────────────────

contentRouter.get("/calendar/events", requireAuth, requireFeature("calendar_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : auth.userId;
    if (!getScopedUserIds(req).has(requestedUserId)) throw createApiError("FORBIDDEN", "Requested user is out of scope", false, req.traceId);

    const events = await fetchCalendarEvents(getCorsairTenant(auth.userId), requestedUserId, {
      timeMin: typeof req.query.timeMin === "string" ? req.query.timeMin : undefined,
      timeMax: typeof req.query.timeMax === "string" ? req.query.timeMax : undefined
    });
    const page = paginate(events, typeof req.query.cursor === "string" ? req.query.cursor : undefined, typeof req.query.limit === "string" ? req.query.limit : undefined);
    emitAuditEvent(req, "calendar_events_read", { requested_user_id: requestedUserId, count: events.length });
    res.status(200).json({ events: page.items, total: page.total, next_cursor: page.next_cursor });
  } catch (err) { next(err); }
});

contentRouter.post("/calendar/events", requireAuth, requireFeature("calendar_write"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = createCalendarEventSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid calendar event payload", false, req.traceId);

    const created = await createGCalEvent({ tenantId: getCorsairTenant(auth.userId), ownerUserId: auth.userId, title: parsed.data.title, startsAt: parsed.data.starts_at, endsAt: parsed.data.ends_at, attendees: parsed.data.attendees, description: parsed.data.description, location: parsed.data.location, withMeet: parsed.data.with_meet });
    publish({ kind: "calendar.changed", userId: auth.userId, eventId: created.id });
    emitAuditEvent(req, "calendar_event_create", { event_id: created.id });
    res.status(201).json({ event: created });
  } catch (err) { next(err); }
});

contentRouter.patch("/calendar/events/:eventId", requireAuth, requireFeature("calendar_write"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = updateCalendarEventSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid calendar event update payload", false, req.traceId);

    const updated = await updateGCalEvent({
      tenantId: getCorsairTenant(auth.userId),
      ownerUserId: auth.userId,
      eventId: req.params.eventId,
      title: parsed.data.title,
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      attendees: parsed.data.attendees
    });
    publish({ kind: "calendar.changed", userId: auth.userId, eventId: updated.id });
    emitAuditEvent(req, "calendar_event_update", { event_id: updated.id });
    res.status(200).json({ event: updated });
  } catch (err) { next(err); }
});

// ── Availability check ────────────────────────────────────────────────────────

contentRouter.post("/calendar/availability/check", requireAuth, requireFeature("calendar_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = availabilityCheckSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid availability check payload", false, req.traceId);

    const availability = await checkAvailability(getCorsairTenant(auth.userId), {
      timeMin: parsed.data.time_min,
      timeMax: parsed.data.time_max,
      calendarIds: parsed.data.calendar_ids
    });
    emitAuditEvent(req, "calendar_availability_checked", { time_min: parsed.data.time_min, time_max: parsed.data.time_max });
    res.status(200).json({ availability });
  } catch (err) { next(err); }
});

// ── Calendar event delete ──────────────────────────────────────────────────────
contentRouter.delete("/calendar/events/:eventId", requireAuth, requireFeature("calendar_write"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    await deleteGCalEvent(getCorsairTenant(auth.userId), req.params.eventId);
    publish({ kind: "calendar.changed", userId: auth.userId, eventId: req.params.eventId });
    emitAuditEvent(req, "calendar_event_delete", { event_id: req.params.eventId });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── Calendar event get single ─────────────────────────────────────────────────
contentRouter.get("/calendar/events/:eventId", requireAuth, requireFeature("calendar_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const event = await getCalendarEvent(getCorsairTenant(auth.userId), auth.userId, req.params.eventId);
    if (!event) throw createApiError("NOT_FOUND", "Event not found", false, req.traceId);
    res.status(200).json({ event });
  } catch (err) { next(err); }
});

// ── Gmail labels ──────────────────────────────────────────────────────────────
contentRouter.get("/email/labels", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const labels = await listGmailLabels(getCorsairTenant(auth.userId));
    res.status(200).json({ labels });
  } catch (err) { next(err); }
});

// ── Thread trash / untrash ────────────────────────────────────────────────────
contentRouter.post("/email/threads/:threadId/trash", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    await trashThread(getCorsairTenant(auth.userId), req.params.threadId);
    publish({ kind: "email.changed", userId: auth.userId, threadId: req.params.threadId });
    emitAuditEvent(req, "email_thread_trashed", { thread_id: req.params.threadId });
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

contentRouter.post("/email/threads/:threadId/untrash", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    await untrashThread(getCorsairTenant(auth.userId), req.params.threadId);
    publish({ kind: "email.changed", userId: auth.userId, threadId: req.params.threadId });
    emitAuditEvent(req, "email_thread_untrashed", { thread_id: req.params.threadId });
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

// ── Batch modify messages ──────────────────────────────────────────────────────
contentRouter.post("/email/messages/batch-modify", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const { ids, add_label_ids = [], remove_label_ids = [] } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) throw createApiError("VALIDATION_ERROR", "ids array required", false, req.traceId);
    await batchModifyMessages(getCorsairTenant(auth.userId), ids, add_label_ids, remove_label_ids);
    emitAuditEvent(req, "email_batch_modify", { count: ids.length });
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

// ── Drafts ────────────────────────────────────────────────────────────────────
contentRouter.get("/email/drafts", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const drafts = await listDrafts(getCorsairTenant(auth.userId));
    res.status(200).json({ drafts });
  } catch (err) { next(err); }
});

contentRouter.post("/email/drafts", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const parsed = sendEmailSchema.safeParse(req.body);
    if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid draft payload", false, req.traceId);
    const draft = await createDraft(getCorsairTenant(auth.userId), parsed.data);
    emitAuditEvent(req, "email_draft_created", { draft_id: draft.id });
    res.status(201).json({ draft_id: draft.id });
  } catch (err) { next(err); }
});

contentRouter.post("/email/drafts/:draftId/send", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    const result = await sendDraft(getCorsairTenant(auth.userId), req.params.draftId);
    emitAuditEvent(req, "email_draft_sent", { draft_id: req.params.draftId, message_id: result.id });
    res.status(200).json({ message_id: result.id, thread_id: result.threadId });
  } catch (err) { next(err); }
});

contentRouter.delete("/email/drafts/:draftId", requireAuth, requireFeature("email_read"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth!;
    await deleteDraft(getCorsairTenant(auth.userId), req.params.draftId);
    emitAuditEvent(req, "email_draft_deleted", { draft_id: req.params.draftId });
    res.status(204).send();
  } catch (err) { next(err); }
});

