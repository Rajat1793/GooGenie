/**
 * S4-4: End-to-end role journey tests — 3 complete role journeys.
 */
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { clearIdempotencyStore } from "../src/security/idempotency.js";
import { resetMetrics } from "../src/security/metrics.js";
import { app } from "../src/index.js";

function tok(role: "super_admin" | "manager_admin" | "user", userId: string) {
  return createAccessToken({ sub: userId, tenant_id: "demo-tenant", role, exp: Math.floor(Date.now() / 1000) + 3600 });
}
beforeEach(() => { resetPolicyStoreDefaults(); clearIdempotencyStore(); resetMetrics(); });

// ── Journey 1: Super Admin ───────────────────────────────────────────────────
describe("Journey 1: Super Admin lifecycle", () => {
  const t = () => tok("super_admin", "super-1");

  it("step 1 — auth config on startup", async () => {
    const res = await request(app).get("/v1/auth/config");
    expect(res.status).toBe(200);
    expect(res.body.roles).toContain("super_admin");
  });
  it("step 2 — authenticate and verify profile", async () => {
    const res = await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${t()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "super-1", role: "super_admin" });
  });
  it("step 3 — paginated user list", async () => {
    const res = await request(app).get("/v1/admin/users?limit=3").set("Authorization", `Bearer ${t()}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.users.length).toBeLessThanOrEqual(3);
    expect(typeof res.body.next_cursor).toBe("string");
  });
  it("step 4 — promote user to manager", async () => {
    const res = await request(app).patch("/v1/admin/users/user-2/role").set("Authorization", `Bearer ${t()}`).send({ role: "manager_admin", reason: "e2e promotion" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("manager_admin");
    expect(res.body.role_changes.length).toBeGreaterThan(0);
  });
  it("step 5 — reassign user to different manager", async () => {
    const res = await request(app).patch("/v1/admin/users/user-1/manager").set("Authorization", `Bearer ${t()}`).send({ manager_user_id: "manager-2" });
    expect(res.status).toBe(200);
    expect(res.body.user.managerUserId).toBe("manager-2");
  });
  it("step 6 — view activity log", async () => {
    await request(app).get("/v1/admin/users").set("Authorization", `Bearer ${t()}`);
    const res = await request(app).get("/v1/admin/activity").set("Authorization", `Bearer ${t()}`);
    expect(res.status).toBe(200);
    expect(res.body.activity.length).toBeGreaterThan(0);
  });
  it("step 7 — own features and activity", async () => {
    expect((await request(app).get("/v1/me/features").set("Authorization", `Bearer ${t()}`)).status).toBe(200);
    expect((await request(app).get("/v1/me/activity").set("Authorization", `Bearer ${t()}`)).status).toBe(200);
  });
  it("step 8 — read email threads in scope", async () => {
    const res = await request(app).get("/v1/email/threads?userId=user-1&limit=5").set("Authorization", `Bearer ${t()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.threads)).toBe(true);
  });
  it("step 9 — metrics endpoint returns valid shape", async () => {
    await request(app).get("/health");
    const res = await request(app).get("/v1/metrics");
    expect(res.status).toBe(200);
    expect(typeof res.body.counters.request_count).toBe("number");
    expect(typeof res.body.latency.p95).toBe("number");
  });
});

// ── Journey 2: Manager Admin ─────────────────────────────────────────────────
describe("Journey 2: Manager Admin team lifecycle", () => {
  const t = () => tok("manager_admin", "manager-1");

  it("step 1 — authenticate and confirm role", async () => {
    expect((await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${t()}`)).body.role).toBe("manager_admin");
  });
  it("step 2 — lists only own scoped team", async () => {
    const res = await request(app).get("/v1/manager/users").set("Authorization", `Bearer ${t()}`);
    const ids = res.body.users.map((u: {id: string}) => u.id);
    expect(ids).toContain("user-1");
    expect(ids).toContain("user-2");
    expect(ids).not.toContain("user-3");
  });
  it("step 3 — enables feature for team member", async () => {
    const res = await request(app).patch("/v1/manager/users/user-1/feature-access").set("Authorization", `Bearer ${t()}`).send({ feature_key: "email_write", is_enabled: true });
    expect(res.status).toBe(200);
    const toggle = res.body.feature_access.find((f: {featureKey: string}) => f.featureKey === "email_write");
    expect(toggle?.isEnabled).toBe(true);
  });
  it("step 4 — reads activity for in-scope member", async () => {
    expect((await request(app).get("/v1/manager/users/user-2/activity").set("Authorization", `Bearer ${t()}`)).status).toBe(200);
  });
  it("step 5 — bulk-enables ai_summary for team", async () => {
    const res = await request(app).post("/v1/manager/bulk-actions").set("Authorization", `Bearer ${t()}`).send({ action: "set_feature_access", user_ids: ["user-1","user-2"], payload: { feature_key: "ai_summary", is_enabled: true } });
    expect(res.status).toBe(200);
    expect(res.body.updated_count).toBe(2);
  });
  it("step 6 — idempotent bulk action replays safely", async () => {
    const key = "mgr-e2e-key";
    const body = { action: "set_feature_access", user_ids: ["user-1"], payload: { feature_key: "calendar_write", is_enabled: false } };
    const r1 = await request(app).post("/v1/manager/bulk-actions").set("Authorization", `Bearer ${t()}`).set("Idempotency-Key", key).send(body);
    const r2 = await request(app).post("/v1/manager/bulk-actions").set("Authorization", `Bearer ${t()}`).set("Idempotency-Key", key).send(body);
    expect(r2.headers["idempotency-replayed"]).toBe("true");
    expect(r2.body.updated_count).toBe(r1.body.updated_count);
  });
  it("step 7 — cannot access admin routes", async () => {
    expect((await request(app).get("/v1/admin/users").set("Authorization", `Bearer ${t()}`)).status).toBe(403);
  });
  it("step 8 — cannot modify out-of-scope user", async () => {
    expect((await request(app).patch("/v1/manager/users/user-3/feature-access").set("Authorization", `Bearer ${t()}`).send({ feature_key: "email_read", is_enabled: false })).status).toBe(403);
  });
});

// ── Journey 3: Regular User ──────────────────────────────────────────────────
describe("Journey 3: Regular User self-service lifecycle", () => {
  const t = () => tok("user", "user-1");

  it("step 1 — authenticate and verify role", async () => {
    expect((await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${t()}`)).body.role).toBe("user");
  });
  it("step 2 — views own feature access", async () => {
    const res = await request(app).get("/v1/me/features").set("Authorization", `Bearer ${t()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.features)).toBe(true);
  });
  it("step 3 — reads own email inbox", async () => {
    expect((await request(app).get("/v1/email/threads").set("Authorization", `Bearer ${t()}`)).status).toBe(200);
  });
  it("step 4 — reads own calendar events", async () => {
    expect((await request(app).get("/v1/calendar/events").set("Authorization", `Bearer ${t()}`)).status).toBe(200);
  });
  it("step 5 — creates a calendar event", async () => {
    const res = await request(app).post("/v1/calendar/events").set("Authorization", `Bearer ${t()}`).send({ title: "User session", starts_at: "2026-06-20T09:00:00.000Z", ends_at: "2026-06-20T10:00:00.000Z", attendees: [] });
    expect(res.status).toBe(201);
    expect(res.body.event.ownerUserId).toBe("user-1");
  });
  it("step 6 — activity trail belongs only to calling user", async () => {
    await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${t()}`);
    const res = await request(app).get("/v1/me/activity").set("Authorization", `Bearer ${t()}`);
    expect(res.status).toBe(200);
    for (const ev of res.body.activity) expect(ev.actor_user_id).toBe("user-1");
  });
  it("step 7 — cannot access admin or manager routes", async () => {
    const [a, m] = await Promise.all([
      request(app).get("/v1/admin/users").set("Authorization", `Bearer ${t()}`),
      request(app).get("/v1/manager/users").set("Authorization", `Bearer ${t()}`)
    ]);
    expect(a.status).toBe(403);
    expect(m.status).toBe(403);
  });
  it("step 8 — feature-disabled user blocked (user-2 email_read=false)", async () => {
    const u2 = tok("user", "user-2");
    expect((await request(app).get("/v1/email/threads").set("Authorization", `Bearer ${u2}`)).status).toBe(403);
  });
});
