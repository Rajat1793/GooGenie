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
  attendees: z.array(z.string().email()).default([])
});
