/**
 * S3-5: Web client contract tests
 * Validates all flows that the React frontend depends on:
 * auth config bootstrap, paginated lists, idempotent mutations, error shapes
 */
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { clearIdempotencyStore } from "../src/security/idempotency.js";
import { app } from "../src/index.js";

function token(role: "super_admin" | "manager_admin" | "user", userId: string) {
  return createAccessToken({
    sub: userId,
    tenant_id: "demo-tenant",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
}

beforeEach(() => {
  resetPolicyStoreDefaults();
  clearIdempotencyStore();
});

describe("web contract: bootstrap", () => {
  it("GET /v1/auth/config returns all required fields", async () => {
    const res = await request(app).get("/v1/auth/config");
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body).toMatchObject({
      token_type: "Bearer",
      access_token_ttl_seconds: expect.any(Number),
      refresh_window_seconds: expect.any(Number),
      roles: expect.arrayContaining(["super_admin", "manager_admin", "user"]),
      scopes: expect.arrayContaining(["email_read", "calendar_read"])
    });
  });

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("web contract: auth flows", () => {
  it("profile returns id, tenant_id, role", async () => {
    const res = await request(app)
      .get("/v1/me/profile")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "user-1", tenant_id: "demo-tenant", role: "user" });
  });

  it("expired / missing token returns 401 with correct error shape", async () => {
    const res = await request(app).get("/v1/me/profile");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED", retryable: false });
    expect(typeof res.body.trace_id).toBe("string");
  });

  it("role escalation attempt returns 403", async () => {
    const res = await request(app)
      .get("/v1/admin/users")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});

describe("web contract: paginated list endpoints", () => {
  it("email threads response includes pagination envelope", async () => {
    const res = await request(app)
      .get("/v1/email/threads?userId=user-1&limit=1")
      .set("Authorization", `Bearer ${token("super_admin", "super-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("threads");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("next_cursor");
  });

  it("calendar events response includes pagination envelope", async () => {
    const res = await request(app)
      .get("/v1/calendar/events?limit=1")
      .set("Authorization", `Bearer ${token("super_admin", "super-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("next_cursor");
  });

  it("admin users response includes pagination envelope", async () => {
    const res = await request(app)
      .get("/v1/admin/users?limit=2")
      .set("Authorization", `Bearer ${token("super_admin", "super-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("users");
    expect(res.body).toHaveProperty("total");
    expect(res.body.total).toBeGreaterThan(0);
  });

  it("me/features response includes pagination envelope", async () => {
    const res = await request(app)
      .get("/v1/me/features")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("features");
    expect(res.body).toHaveProperty("total");
  });
});

describe("web contract: idempotent mutations", () => {
  it("POST with Idempotency-Key deduplicates calendar create", async () => {
    const t = token("manager_admin", "manager-1");
    const key = "web-idem-key-1";
    const payload = {
      title: "Budget review",
      starts_at: "2026-06-15T10:00:00.000Z",
      ends_at: "2026-06-15T11:00:00.000Z",
      attendees: []
    };

    const r1 = await request(app)
      .post("/v1/calendar/events")
      .set("Authorization", `Bearer ${t}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post("/v1/calendar/events")
      .set("Authorization", `Bearer ${t}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(r2.status).toBe(201);
    expect(r2.headers["idempotency-replayed"]).toBe("true");
    expect(r2.body.event.id).toBe(r1.body.event.id);
  });
});

describe("web contract: admin operations", () => {
  it("PATCH role returns updated user + role_changes", async () => {
    const t = token("super_admin", "super-1");
    const res = await request(app)
      .patch("/v1/admin/users/user-2/role")
      .set("Authorization", `Bearer ${t}`)
      .send({ role: "manager_admin", reason: "contract-test-promotion" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("manager_admin");
    expect(Array.isArray(res.body.role_changes)).toBe(true);
  });

  it("admin activity is filterable by action", async () => {
    // trigger an event
    await request(app)
      .get("/v1/admin/users")
      .set("Authorization", `Bearer ${token("super_admin", "super-1")}`);

    const res = await request(app)
      .get("/v1/admin/activity?action=admin_users_list_read")
      .set("Authorization", `Bearer ${token("super_admin", "super-1")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activity)).toBe(true);
    for (const ev of res.body.activity) {
      expect(ev.action).toBe("admin_users_list_read");
    }
  });
});
