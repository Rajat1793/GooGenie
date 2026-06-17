import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    managerUserId: varchar("manager_user_id", { length: 64 }),
    isActive: boolean("is_active").notNull().default(true),
    /** Clerk user ID — set when a Clerk user first signs in */
    clerkUserId: varchar("clerk_user_id", { length: 128 }),
    /** bcrypt hash — only set for admin/manager local-login accounts */
    passwordHash: text("password_hash"),
    /** Per-user JSON settings bag (toggles like { autoCategorize: true }). */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantRoleIdx: index("users_tenant_role_idx").on(table.tenantId, table.role),
    tenantManagerIdx: index("users_tenant_manager_idx").on(table.tenantId, table.managerUserId),
    tenantEmailUnique: uniqueIndex("users_tenant_email_unique").on(table.tenantId, table.email)
  })
);

export const userFeatureAccess = pgTable(
  "user_feature_access",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    featureKey: varchar("feature_key", { length: 64 }).notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantUserFeatureUnique: uniqueIndex("ufa_tenant_user_feature_unique").on(
      table.tenantId,
      table.userId,
      table.featureKey
    )
  })
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: varchar("target_user_id", { length: 64 }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantCreatedIdx: index("activity_tenant_created_idx").on(table.tenantId, table.createdAt),
    tenantActorCreatedIdx: index("activity_tenant_actor_created_idx").on(
      table.tenantId,
      table.actorUserId,
      table.createdAt
    )
  })
);

export const roleChangeLogs = pgTable("role_change_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  tenantId: varchar("tenant_id", { length: 64 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  changedByUserId: varchar("changed_by_user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetUserId: varchar("target_user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  oldRole: varchar("old_role", { length: 32 }).notNull(),
  newRole: varchar("new_role", { length: 32 }).notNull(),
  reason: text("reason").notNull().default("unspecified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

/**
 * Feature-access requests — when a user lacks a feature they can request it
 * from their direct manager (or a teacher can request from their big boss).
 * Approving a request flips the corresponding `user_feature_access.is_enabled`
 * to true.
 */
export const featureRequests = pgTable(
  "feature_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requesterUserId: varchar("requester_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetManagerUserId: varchar("target_manager_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    featureKey: varchar("feature_key", { length: 64 }).notNull(),
    /** pending | approved | denied */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    reason: text("reason"),
    decidedByUserId: varchar("decided_by_user_id", { length: 64 }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    targetStatusIdx: index("feature_requests_target_status_idx").on(table.targetManagerUserId, table.status),
    requesterIdx: index("feature_requests_requester_idx").on(table.requesterUserId)
  })
);

/**
 * Scheduled emails — used for two flows:
 *   - kind: 'undo'      → 10s undo-send queue (default for every Send action)
 *   - kind: 'scheduled' → explicit "send later" picked by the user
 * A background poller in instrumentation.ts picks rows where
 * status='queued' AND send_at<=NOW() and flushes them via gmail.sendEmail().
 */
export const scheduledEmails = pgTable(
  "scheduled_emails",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    toAddr: text("to_addr").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    kind: varchar("kind", { length: 16 }).notNull().default("undo"),
    sentMessageId: text("sent_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pollerIdx: index("scheduled_emails_poller_idx").on(table.status, table.sendAt),
    userIdx: index("scheduled_emails_user_idx").on(table.userId, table.status, table.sendAt)
  })
);

/**
 * Public booking links (Calendly-style). Each user can publish one or more
 * /book/<slug> pages that expose free slots over the next N business days.
 */
export const bookingLinks = pgTable(
  "booking_links",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    title: text("title").notNull().default("Book a meeting"),
    durationMinutes: bigint("duration_minutes", { mode: "number" }).notNull().default(30),
    daysAhead: bigint("days_ahead", { mode: "number" }).notNull().default(14),
    businessHours: jsonb("business_hours").$type<{ start: number; end: number }>().notNull().default({ start: 9, end: 18 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("booking_links_user_idx").on(table.userId)
  })
);

/**
 * AI-extracted tasks (Feature C1 — Email-to-task extractor).
 *
 * Daily cron scans recent email via Corsair's local cache, asks Mistral to
 * extract action items, and writes rows here. The "what's on my plate"
 * widget queries by user_id WHERE status='open'.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    threadId: varchar("thread_id", { length: 128 }).notNull(),
    title: text("title").notNull(),
    senderEmail: text("sender_email"),
    /** ISO-8601 string deadline (null when not specified). */
    deadline: timestamp("deadline", { withTimezone: true }),
    priority: varchar("priority", { length: 8 }).notNull().default("normal"), // low | normal | high
    status: varchar("status", { length: 16 }).notNull().default("open"), // open | done | dismissed
    snippet: text("snippet"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("tasks_user_idx").on(table.userId, table.status, table.deadline),
    threadIdx: index("tasks_thread_idx").on(table.userId, table.threadId)
  })
);

/**
 * Snoozed threads — hide a Gmail thread from inbox until `wakeAt`. The inbox
 * list endpoint joins against this table and filters out IDs whose
 * `status='snoozed' AND wake_at > NOW()`. When wake_at passes the row's
 * status is lazily flipped to 'awake' on the next inbox load (no poller
 * required for demo scale).
 */
export const snoozedThreads = pgTable(
  "snoozed_threads",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    threadId: varchar("thread_id", { length: 128 }).notNull(),
    wakeAt: timestamp("wake_at", { withTimezone: true }).notNull(),
    /** snoozed | awake | cancelled */
    status: varchar("status", { length: 16 }).notNull().default("snoozed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userStatusIdx: index("snoozed_threads_user_status_idx").on(table.userId, table.status, table.wakeAt),
    userThreadUnique: uniqueIndex("snoozed_threads_user_thread_unique").on(table.userId, table.threadId)
  })
);

/**
 * Reusable text templates ("snippets") that expand inside compose. The user
 * types `;hotkey` followed by Tab or Space and the body inflates inline.
 * Pure local-DB feature — no AI tokens.
 */
export const snippets = pgTable(
  "snippets",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    /** Short text trigger; user types `;<hotkey>` + Tab/Space to expand. */
    hotkey: varchar("hotkey", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("snippets_user_idx").on(table.userId),
    userHotkeyUnique: uniqueIndex("snippets_user_hotkey_unique").on(table.userId, table.hotkey)
  })
);
