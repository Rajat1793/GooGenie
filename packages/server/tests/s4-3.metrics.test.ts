/**
 * S4-3: Metrics and alert endpoint tests.
 */
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { clearIdempotencyStore } from "../src/security/idempotency.js";
import { resetMetrics, ALERT_THRESHOLDS } from "../src/security/metrics.js";
import { app } from "../src/index.js";

function token(role: "super_admin" | "manager_admin" | "user", userId: string) {
  return createAccessToken({ sub: userId, tenant_id: "demo-tenant", role, exp: Math.floor(Date.now() / 1000) + 3600 });
}
beforeEach(() => { resetPolicyStoreDefaults(); clearIdempotencyStore(); resetMetrics(); });

describe("GET /v1/metrics", () => {
  it("returns metrics without auth", async () => {
    const res = await request(app).get("/v1/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      counters: { request_count: expect.any(Number), authz_denied: expect.any(Number), error_5xx: expect.any(Number) },
      latency: { p50: expect.any(Number), p95: expect.any(Number), samples: expect.any(Number) },
      collected_at: expect.any(String)
    });
  });
  it("authz_denied increments on 403", async () => {
    await request(app).get("/v1/admin/users").set("Authorization", `Bearer ${token("user","user-1")}`);
    const res = await request(app).get("/v1/metrics");
    expect(res.body.counters.authz_denied).toBeGreaterThan(0);
  });
  it("request_count increments", async () => {
    await request(app).get("/health");
    await request(app).get("/health");
    const res = await request(app).get("/v1/metrics");
    expect(res.body.counters.request_count).toBeGreaterThanOrEqual(2);
  });
});

describe("GET /v1/alerts", () => {
  it("returns alert envelope without auth", async () => {
    const res = await request(app).get("/v1/alerts");
    expect(res.status).toBe(200);
    expect(["ok","warn","critical"]).toContain(res.body.status);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });
  it("returns ok with no traffic", async () => {
    expect((await request(app).get("/v1/alerts")).body.status).toBe("ok");
  });
  it("all three KPI alerts present", async () => {
    const names = (await request(app).get("/v1/alerts")).body.alerts.map((a: {name: string}) => a.name);
    expect(names).toContain("p95_latency");
    expect(names).toContain("authz_denied_rate");
    expect(names).toContain("error_5xx_rate");
  });
  it("each alert has required fields", async () => {
    for (const a of (await request(app).get("/v1/alerts")).body.alerts) {
      expect(typeof a.name).toBe("string");
      expect(["ok","warn","critical"]).toContain(a.status);
      expect(typeof a.value).toBe("number");
      expect(typeof a.threshold).toBe("number");
      expect(typeof a.message).toBe("string");
    }
  });
  it("ALERT_THRESHOLDS are defined and reasonable", () => {
    expect(ALERT_THRESHOLDS.p95_latency_ms).toBeGreaterThan(0);
    expect(ALERT_THRESHOLDS.authz_denied_rate).toBeGreaterThan(0);
    expect(ALERT_THRESHOLDS.authz_denied_rate).toBeLessThan(1);
    expect(ALERT_THRESHOLDS.error_5xx_rate).toBeGreaterThan(0);
  });
});

describe("POST /v1/metrics/reset", () => {
  it("resets counters in non-production", async () => {
    await request(app).get("/health");
    await request(app).get("/health");
    const before = await request(app).get("/v1/metrics");
    expect(before.body.counters.request_count).toBeGreaterThan(0);
    await request(app).post("/v1/metrics/reset");
    const after = await request(app).get("/v1/metrics");
    expect(after.body.counters.request_count).toBeLessThanOrEqual(2);
  });
});
