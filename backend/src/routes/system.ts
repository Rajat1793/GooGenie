/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { ALL_ROLES } from "../auth/roles.js";
import { getCounters, getLatency, evaluateAlerts, resetMetrics } from "../security/metrics.js";
import { env } from "../security/env.js";

export const systemRouter = Router();

// ── OpenAPI spec ──────────────────────────────────────────────────────────────
const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "GooGenie API",
    version: "1.0.0",
    description: "AI-first Gmail + Calendar workspace — role-based access for Big Boss, Teachers & Students.",
  },
  servers: [{ url: "/v1", description: "API v1" }],
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Clerk JWT or HMAC demo token" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          trace_id: { type: "string" },
          retryable: { type: "boolean" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["super_admin", "manager_admin", "user"] },
          managerUserId: { type: "string", nullable: true },
          isActive: { type: "boolean" },
        },
      },
      EmailThread: {
        type: "object",
        properties: {
          id: { type: "string" },
          subject: { type: "string" },
          snippet: { type: "string" },
          from: { type: "string" },
          isUnread: { type: "boolean" },
          labelIds: { type: "array", items: { type: "string" } },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CalendarEvent: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          attendees: { type: "array", items: { type: "string" } },
          status: { type: "string" },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    "/auth/clerk-sync": {
      post: {
        tags: ["Auth"],
        summary: "Sync Clerk user to DB with role",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "displayName"],
                properties: {
                  email: { type: "string", format: "email" },
                  displayName: { type: "string" },
                  role: { type: "string", enum: ["super_admin", "manager_admin", "user"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "User synced", content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, needsManager: { type: "boolean" } } } } } },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        responses: {
          200: { description: "Current user", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/auth/managers": {
      get: {
        tags: ["Auth"],
        summary: "List available managers (teachers)",
        responses: {
          200: { description: "List of managers", content: { "application/json": { schema: { type: "object", properties: { managers: { type: "array", items: { $ref: "#/components/schemas/User" } } } } } } },
        },
      },
    },
    "/auth/select-manager": {
      post: {
        tags: ["Auth"],
        summary: "Assign a manager (teacher) to current user",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["managerId"], properties: { managerId: { type: "string" } } } } } },
        responses: { 200: { description: "Manager assigned" }, 404: { description: "Manager not found" } },
      },
    },
    "/auth/org-tree": {
      get: {
        tags: ["Auth"],
        summary: "Get the full org hierarchy tree",
        responses: { 200: { description: "Org tree nodes" } },
      },
    },
    "/me/connect/status": {
      get: {
        tags: ["Connect"],
        summary: "Get Gmail + Calendar connection status for current user",
        responses: {
          200: { description: "Connection status", content: { "application/json": { schema: { type: "object", properties: { gmail: { type: "boolean" }, googlecalendar: { type: "boolean" } } } } } },
        },
      },
    },
    "/me/connect/{plugin}/init": {
      post: {
        tags: ["Connect"],
        summary: "Start OAuth flow for a plugin",
        parameters: [{ name: "plugin", in: "path", required: true, schema: { type: "string", enum: ["gmail", "googlecalendar"] } }],
        responses: { 200: { description: "OAuth redirect URL", content: { "application/json": { schema: { type: "object", properties: { url: { type: "string" } } } } } } },
      },
    },
    "/email/threads": {
      get: {
        tags: ["Email"],
        summary: "List Gmail threads",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Gmail search query" },
          { name: "maxResults", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { 200: { description: "Thread list", content: { "application/json": { schema: { type: "object", properties: { threads: { type: "array", items: { $ref: "#/components/schemas/EmailThread" } } } } } } } },
      },
    },
    "/email/threads/{threadId}": {
      get: {
        tags: ["Email"],
        summary: "Get a single thread with messages",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Thread detail" } },
      },
    },
    "/email/messages/send": {
      post: {
        tags: ["Email"],
        summary: "Send a new email",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["to", "subject", "body"], properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } } } } },
        responses: { 200: { description: "Message sent" } },
      },
    },
    "/email/threads/{threadId}/reply": {
      post: {
        tags: ["Email"],
        summary: "Reply to a thread",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["to", "subject", "body"], properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } } } } },
        responses: { 200: { description: "Reply sent" } },
      },
    },
    "/email/threads/{threadId}/labels": {
      patch: {
        tags: ["Email"],
        summary: "Modify labels on a thread",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { add_label_ids: { type: "array", items: { type: "string" } }, remove_label_ids: { type: "array", items: { type: "string" } } } } } } },
        responses: { 200: { description: "Labels updated" } },
      },
    },
    "/email/threads/{threadId}/trash": {
      post: { tags: ["Email"], summary: "Move thread to trash", parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Trashed" } } },
    },
    "/email/threads/{threadId}/untrash": {
      post: { tags: ["Email"], summary: "Restore thread from trash", parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Untrashed" } } },
    },
    "/email/labels": {
      get: { tags: ["Email"], summary: "List Gmail labels", responses: { 200: { description: "Labels" } } },
    },
    "/email/drafts": {
      get: { tags: ["Email"], summary: "List drafts", responses: { 200: { description: "Drafts" } } },
      post: { tags: ["Email"], summary: "Create a draft", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["to", "subject", "body"], properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } } } } }, responses: { 200: { description: "Draft created" } } },
    },
    "/email/drafts/{draftId}/send": {
      post: { tags: ["Email"], summary: "Send a draft", parameters: [{ name: "draftId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Draft sent" } } },
    },
    "/email/drafts/{draftId}": {
      delete: { tags: ["Email"], summary: "Delete a draft", parameters: [{ name: "draftId", in: "path", required: true, schema: { type: "string" } }], responses: { 204: { description: "Deleted" } } },
    },
    "/email/messages/batch-modify": {
      post: { tags: ["Email"], summary: "Batch modify message labels", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, add_label_ids: { type: "array", items: { type: "string" } }, remove_label_ids: { type: "array", items: { type: "string" } } } } } } }, responses: { 200: { description: "Updated" } } },
    },
    "/calendar/events": {
      get: {
        tags: ["Calendar"],
        summary: "List calendar events",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: { description: "Events", content: { "application/json": { schema: { type: "object", properties: { events: { type: "array", items: { $ref: "#/components/schemas/CalendarEvent" } } } } } } } },
      },
      post: {
        tags: ["Calendar"],
        summary: "Create a calendar event",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "starts_at", "ends_at"], properties: { title: { type: "string" }, description: { type: "string" }, location: { type: "string" }, starts_at: { type: "string", format: "date-time" }, ends_at: { type: "string", format: "date-time" }, attendees: { type: "array", items: { type: "string" } } } } } } },
        responses: { 200: { description: "Event created", content: { "application/json": { schema: { type: "object", properties: { event: { $ref: "#/components/schemas/CalendarEvent" } } } } } } },
      },
    },
    "/calendar/events/{eventId}": {
      get: { tags: ["Calendar"], summary: "Get event by ID", parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Event" } } },
      patch: {
        tags: ["Calendar"],
        summary: "Update an event",
        parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, location: { type: "string" }, starts_at: { type: "string", format: "date-time" }, ends_at: { type: "string", format: "date-time" }, attendees: { type: "array", items: { type: "string" } } } } } } },
        responses: { 200: { description: "Event updated" } },
      },
      delete: { tags: ["Calendar"], summary: "Delete an event", parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string" } }], responses: { 204: { description: "Deleted" } } },
    },
    "/calendar/availability/check": {
      post: { tags: ["Calendar"], summary: "Check availability (free/busy)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["starts_at", "ends_at"], properties: { starts_at: { type: "string", format: "date-time" }, ends_at: { type: "string", format: "date-time" }, attendees: { type: "array", items: { type: "string" } } } } } } }, responses: { 200: { description: "Availability result" } } },
    },
    "/admin/users": {
      get: { tags: ["Admin"], summary: "List all users (super_admin only)", responses: { 200: { description: "Users" } } },
    },
    "/admin/users/{userId}/role": {
      patch: { tags: ["Admin"], summary: "Change a user's role", parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["super_admin", "manager_admin", "user"] } } } } } }, responses: { 200: { description: "Role updated" } } },
    },
    "/admin/users/{userId}/manager": {
      patch: { tags: ["Admin"], summary: "Reassign a user's manager", parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["managerId"], properties: { managerId: { type: "string" } } } } } }, responses: { 200: { description: "Manager updated" } } },
    },
    "/manager/users": {
      get: { tags: ["Manager"], summary: "List students managed by current teacher", responses: { 200: { description: "Students" } } },
    },
    "/manager/users/{userId}/feature-access": {
      get: { tags: ["Manager"], summary: "Get feature flags for a student", parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Feature flags" } } },
      patch: { tags: ["Manager"], summary: "Update feature flags for a student", parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { featureKey: { type: "string" }, isEnabled: { type: "boolean" } } } } } }, responses: { 200: { description: "Updated" } } },
    },
    "/agent/execute": {
      post: { tags: ["Agent"], summary: "Execute an AI agent task (LLM tool-calling)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string", description: "Natural language task description" }, context: { type: "object" } } } } } }, responses: { 200: { description: "Agent result with action, message, suggestions, and optional data" } } },
    },
    "/ai/summarize-thread": {
      post: { tags: ["AI"], summary: "Summarise an email thread (requires ai_summary feature)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["thread_id"], properties: { thread_id: { type: "string" } } } } } }, responses: { 200: { description: "Summary with key_points, action_items, sentiment. Returns ai_available:false when MISTRAL_API_KEY not set." } } },
    },
    "/ai/compose": {
      post: { tags: ["AI"], summary: "AI-generate an email body/subject (requires ai_compose feature)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["type", "tone", "context"], properties: { type: { type: "string", enum: ["new", "reply"] }, tone: { type: "string", enum: ["professional", "friendly", "concise"] }, context: { type: "string" }, thread_snippet: { type: "string" }, recipient_name: { type: "string" } } } } } }, responses: { 200: { description: "Generated body, optional subject, and alternative variants." } } },
    },
    "/ai/suggest-slots": {
      post: { tags: ["AI"], summary: "Smart calendar scheduler — suggest available meeting slots (requires calendar_write)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["description"], properties: { description: { type: "string", description: "Natural language meeting description" }, duration_minutes: { type: "integer", default: 30, minimum: 15, maximum: 480 }, earliest: { type: "string", format: "date-time" }, latest: { type: "string", format: "date-time" }, attendee_emails: { type: "array", items: { type: "string", format: "email" } } } } } } }, responses: { 200: { description: "Up to 5 ranked available slots with AI rationale." } } },
    },
    "/ai/search-emails": {
      post: { tags: ["AI"], summary: "Semantic email search via pgvector cosine similarity (requires email_read)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["query"], properties: { query: { type: "string", description: "Natural language search query" }, limit: { type: "integer", default: 10, minimum: 1, maximum: 20 } } } } } }, responses: { 200: { description: "Ranked thread results with similarity scores. Returns embeddings_available:false if pgvector not installed." } } },
    },
    "/ai/index-emails": {
      post: { tags: ["AI"], summary: "Backfill email embeddings for semantic search (idempotent, content-hashed)", requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { limit: { type: "integer", default: 50, minimum: 1, maximum: 100 } } } } } }, responses: { 200: { description: "indexed and skipped counts." } } },
    },
    "/me/feature-requests": {
      post: { tags: ["Features"], summary: "Submit a feature-access request to your manager", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["feature_key"], properties: { feature_key: { type: "string", enum: ["email_read", "email_write", "calendar_read", "calendar_write", "ai_summary", "ai_compose"] }, reason: { type: "string" } } } } } }, responses: { 200: { description: "Created request" }, 409: { description: "Pending request already exists" } } },
      get: { tags: ["Features"], summary: "List the caller's own submitted feature requests", responses: { 200: { description: "Array of feature requests with status" } } },
    },
    "/me/feature-requests/incoming": {
      get: { tags: ["Features"], summary: "Incoming feature requests (manager/super_admin view). super_admin sees all requests across every manager.", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "denied"] } }], responses: { 200: { description: "Requests array + pending_count" } } },
    },
    "/me/feature-requests/{id}/decide": {
      post: { tags: ["Features"], summary: "Approve or deny a feature request. super_admin can decide any request; managers only their own.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["approved", "denied"] } } } } } }, responses: { 200: { description: "Updated request" }, 403: { description: "Not the addressed manager" } } },
    },
  },
};

// Swagger UI at /api-docs
systemRouter.use("/api-docs", swaggerUi.serve);
systemRouter.get("/api-docs", swaggerUi.setup(openApiSpec, {
  customSiteTitle: "GooGenie API Docs",
  customCss: `
    .swagger-ui .topbar { background: #111319; border-bottom: 1px solid #282a30; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
    .swagger-ui .info .title { font-size: 24px; }
    .swagger-ui { font-family: system-ui, sans-serif; }
  `,
  swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true },
}));

// Raw JSON spec for programmatic use
systemRouter.get("/api-docs/openapi.json", (_req: Request, res: Response) => {
  res.json(openApiSpec);
});



systemRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "googenie-backend", roles: ALL_ROLES });
});

systemRouter.get("/v1/auth/config", (_req: Request, res: Response) => {
  res.status(200).json({
    token_type: "Bearer",
    algorithm: "HMAC-SHA256",
    access_token_ttl_seconds: 3600,
    refresh_token_ttl_seconds: 604800,
    refresh_window_seconds: 300,
    clock_skew_tolerance_seconds: 30,
    roles: ALL_ROLES,
    scopes: ["email_read", "email_write", "calendar_read", "calendar_write", "ai_summary", "ai_compose"]
  });
});

systemRouter.get("/v1/metrics", (_req: Request, res: Response) => {
  res.status(200).json({ counters: getCounters(), latency: getLatency(), collected_at: new Date().toISOString() });
});

systemRouter.get("/v1/alerts", (_req: Request, res: Response) => {
  const alerts = evaluateAlerts();
  const status = alerts.some((a) => a.status === "critical") ? "critical"
    : alerts.some((a) => a.status === "warn") ? "warn" : "ok";
  res.status(200).json({ status, alerts });
});

systemRouter.post("/v1/metrics/reset", (_req: Request, res: Response) => {
  if (env.NODE_ENV === "production") {
    res.status(403).json({ message: "Not available in production" });
    return;
  }
  resetMetrics();
  res.status(200).json({ reset: true });
});
