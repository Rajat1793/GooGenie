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
