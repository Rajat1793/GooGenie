import { z } from "zod";
import { ROLE } from "../auth/roles.js";

export const adminUpdateRoleSchema = z.object({
  role: z.enum([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN, ROLE.USER]),
  reason: z.string().min(3).max(200).default("admin update")
});

export const adminUpdateManagerSchema = z.object({
  manager_user_id: z.string().min(1).optional()
});

export const managerFeatureAccessSchema = z.object({
  feature_key: z.string().min(3).max(64),
  is_enabled: z.boolean()
});

export const managerBulkActionSchema = z.object({
  action: z.enum(["set_feature_access"]),
  user_ids: z.array(z.string().min(1)).min(1),
  payload: z.object({
    feature_key: z.string().min(3).max(64),
    is_enabled: z.boolean()
  })
});

export const createCalendarEventSchema = z.object({
  title: z.string().min(3),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  attendees: z.array(z.string().email()).default([]),
  description: z.string().max(8192).optional(),
  location: z.string().max(512).optional(),
  /** When true, attach a Google Meet conference link. */
  with_meet: z.boolean().optional()
});

export const updateCalendarEventSchema = z.object({
  title: z.string().min(3).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  attendees: z.array(z.string().email()).optional()
});

export const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1)
});

export const replyEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1),
  message_id: z.string().optional()
});

export const modifyLabelsSchema = z.object({
  add_label_ids: z.array(z.string()).default([]),
  remove_label_ids: z.array(z.string()).default([])
});

export const availabilityCheckSchema = z.object({
  time_min: z.string().datetime(),
  time_max: z.string().datetime(),
  calendar_ids: z.array(z.string()).default(["primary"])
});

export const agentExecuteSchema = z.object({
  prompt: z.string().min(1).max(4000),
  context: z.record(z.unknown()).optional()
});

