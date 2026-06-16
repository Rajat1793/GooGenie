/**
 * S3-6: Mobile client contract tests
 * Validates flows that the React Native / Expo app depends on:
 * auth config startup, token error shapes, self-service endpoints,
 * manager scoped reads, retryable flags for offline handling
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

describe("mobile contract: startup config", () => {
  it("auth/config endpoint accessible without token (offline-safe bootstrap)", async () => {
    const res = await request(app).get("/v1/auth/config");
    expect(res.status).toBe(200);
    // mobile needs refresh_window to schedule background refresh
    expect(typeof res.body.refresh_window_seconds).toBe("number");
    expect(typeof res.body.clock_skew_tolerance_seconds).toBe("number");
  });
});

describe("mobile contract: token error shapes for offline handler", () => {
  it("missing token gives retryable=false (no retry benefit)", async () => {
    const res = await request(app).get("/v1/me/profile");
    expect(res.status).toBe(401);
    expect(res.body.retryable).toBe(false);
    // mobile can use trace_id for error logging
    expect(typeof res.body.trace_id).toBe("string");
  });

  it("forbidden gives retryable=false", async () => {
    const res = await request(app)
      .get("/v1/admin/users")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(403);
    expect(res.body.retryable).toBe(false);
  });
});

describe("mobile contract: self-service profile tab", () => {
  it("me/profile returns role for nav routing", async () => {
    for (const [userId, role] of [
      ["user-1", "user"],
      ["manager-1", "manager_admin"],
      ["super-1", "super_admin"]
    ] as const) {
      const res = await request(app)
        .get("/v1/me/profile")
        .set("Authorization", `Bearer ${token(role, userId)}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe(role);
    }
  });

  it("me/features returns paginated list with total", async () => {
    const res = await request(app)
      .get("/v1/me/features")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(res.body).toHaveProperty("next_cursor");
  });

  it("me/activity returns paginated list", async () => {
    // generate some events
    await request(app)
      .get("/v1/me/profile")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);

    const res = await request(app)
      .get("/v1/me/activity")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activity)).toBe(true);
    expect(res.body).toHaveProperty("next_cursor");
  });
});

describe("mobile contract: manager team tab", () => {
  it("manager/users scoped to own team only", async () => {
    const res = await request(app)
      .get("/v1/manager/users")
      .set("Authorization", `Bearer ${token("manager_admin", "manager-1")}`);
    expect(res.status).toBe(200);
    // manager-1 manages user-1 and user-2 (plus self)
    const ids = (res.body.users as Array<{ id: string }>).map((u) => u.id);
    expect(ids).toContain("user-1");
    expect(ids).toContain("user-2");
    expect(ids).not.toContain("user-3"); // managed by manager-2
  });

  it("feature toggle PATCH returns updated list (idempotent with key)", async () => {
    const t = token("manager_admin", "manager-1");
    const idemKey = "mobile-toggle-key-1";

    const r1 = await request(app)
      .patch("/v1/manager/users/user-1/feature-access")
      .set("Authorization", `Bearer ${t}`)
      .set("Idempotency-Key", idemKey)
      .send({ feature_key: "ai_summary", is_enabled: true });
    expect(r1.status).toBe(200);

    // replay — should return same result
    const r2 = await request(app)
      .patch("/v1/manager/users/user-1/feature-access")
      .set("Authorization", `Bearer ${t}`)
      .set("Idempotency-Key", idemKey)
      .send({ feature_key: "ai_summary", is_enabled: false }); // different body, ignored
    expect(r2.status).toBe(200);
    expect(r2.headers["idempotency-replayed"]).toBe("true");
  });
});

describe("mobile contract: inbox + calendar", () => {
  it("email threads return pagination envelope", async () => {
    const res = await request(app)
      .get("/v1/email/threads?userId=user-1&limit=10")
      .set("Authorization", `Bearer ${token("super_admin", "super-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      threads: expect.any(Array),
      total: expect.any(Number)
    });
    expect(res.body).toHaveProperty("next_cursor");
  });

  it("calendar events return pagination envelope", async () => {
    const res = await request(app)
      .get("/v1/calendar/events")
      .set("Authorization", `Bearer ${token("user", "user-1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      events: expect.any(Array),
      total: expect.any(Number)
    });
  });
});
