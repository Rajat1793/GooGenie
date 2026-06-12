/**
 * S4-1: OWASP Top 10 security checks — A01 through A09.
 */
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { clearIdempotencyStore } from "../src/security/idempotency.js";
import { resetMetrics } from "../src/security/metrics.js";
import { app } from "../src/index.js";

function token(role: "super_admin" | "manager_admin" | "user", userId: string) {
  return createAccessToken({ sub: userId, tenant_id: "demo-tenant", role, exp: Math.floor(Date.now() / 1000) + 3600 });
}
beforeEach(() => { resetPolicyStoreDefaults(); clearIdempotencyStore(); resetMetrics(); });

describe("A01: Broken Access Control", () => {
  it("user cannot reach admin routes", async () => {
    expect((await request(app).get("/v1/admin/users").set("Authorization", `Bearer ${token("user","user-1")}`)).status).toBe(403);
  });
  it("manager cannot reach super-admin-only routes", async () => {
    expect((await request(app).get("/v1/admin/users").set("Authorization", `Bearer ${token("manager_admin","manager-1")}`)).status).toBe(403);
  });
  it("manager cannot see out-of-scope user activity", async () => {
    expect((await request(app).get("/v1/manager/users/user-3/activity").set("Authorization", `Bearer ${token("manager_admin","manager-1")}`)).status).toBe(403);
  });
  it("all protected routes require auth", async () => {
    for (const path of ["/v1/me/profile","/v1/admin/users","/v1/manager/users","/v1/email/threads","/v1/calendar/events"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });
  it("manager cannot access super-1 (out of hierarchy)", async () => {
    expect((await request(app).get("/v1/manager/users/super-1/activity").set("Authorization", `Bearer ${token("manager_admin","manager-1")}`)).status).toBe(403);
  });
});

describe("A02: Cryptographic Failures", () => {
  it("tampered signature is rejected", async () => {
    const [payload] = token("super_admin","super-1").split(".");
    expect((await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${payload}.badsig`)).status).toBe(401);
  });
  it("swapped payload+signature is rejected", async () => {
    const [aPayload] = token("super_admin","super-1").split(".");
    const [, uSig] = token("user","user-1").split(".");
    expect((await request(app).get("/v1/admin/users").set("Authorization", `Bearer ${aPayload}.${uSig}`)).status).toBe(401);
  });
  it("expired token is rejected", async () => {
    const expired = createAccessToken({ sub:"super-1", tenant_id:"demo-tenant", role:"super_admin", exp: Math.floor(Date.now()/1000)-10 });
    expect((await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${expired}`)).status).toBe(401);
  });
});

describe("A03: Injection", () => {
  it("SQL injection in query params returns empty results — not 500", async () => {
    const res = await request(app)
      .get("/v1/admin/activity?action=' OR 1=1--&userId=; DROP TABLE users")
      .set("Authorization", `Bearer ${token("super_admin","super-1")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activity)).toBe(true);
  });
  it("oversized body is rejected (not 2xx)", async () => {
    const res = await request(app)
      .patch("/v1/admin/users/user-1/role")
      .set("Authorization", `Bearer ${token("super_admin","super-1")}`)
      .send({ role: "user", reason: "x".repeat(200_001) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("A05: Security Misconfiguration", () => {
  it("X-Powered-By header absent", async () => {
    expect((await request(app).get("/health")).headers["x-powered-by"]).toBeUndefined();
  });
  it("x-content-type-options: nosniff present", async () => {
    expect((await request(app).get("/health")).headers["x-content-type-options"]).toBe("nosniff");
  });
  it("unknown route returns 404 without stack trace", async () => {
    const res = await request(app).get("/v1/unknown").set("Authorization", `Bearer ${token("super_admin","super-1")}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("    at ");
  });
});

describe("A07: Authentication Failures", () => {
  it("missing auth returns 401 retryable=false", async () => {
    const res = await request(app).get("/v1/me/profile");
    expect(res.status).toBe(401);
    expect(res.body.retryable).toBe(false);
  });
  it("malformed token (no dot) returns 401", async () => {
    expect((await request(app).get("/v1/me/profile").set("Authorization","Bearer notavalidtoken")).status).toBe(401);
  });
  it("Basic auth scheme rejected", async () => {
    expect((await request(app).get("/v1/me/profile").set("Authorization","Basic dXNlcjpwYXNz")).status).toBe(401);
  });
});

describe("A08: Data Integrity", () => {
  it("invalid role value rejected with 400", async () => {
    const res = await request(app).patch("/v1/admin/users/user-1/role")
      .set("Authorization", `Bearer ${token("super_admin","super-1")}`)
      .send({ role: "god_mode", reason: "test" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
  it("bulk action with out-of-scope user rejected", async () => {
    const res = await request(app).post("/v1/manager/bulk-actions")
      .set("Authorization", `Bearer ${token("manager_admin","manager-1")}`)
      .send({ action:"set_feature_access", user_ids:["user-3"], payload:{feature_key:"email_read",is_enabled:true} });
    expect(res.status).toBe(403);
  });
});

describe("A09: Security Logging", () => {
  it("privileged actions appear in audit log", async () => {
    const t = token("super_admin","super-1");
    await request(app).patch("/v1/admin/users/user-1/role").set("Authorization",`Bearer ${t}`).send({role:"manager_admin",reason:"audit-test"});
    const res = await request(app).get("/v1/admin/activity?action=admin_user_role_update").set("Authorization",`Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.activity.length).toBeGreaterThan(0);
  });
  it("every audit event has required fields", async () => {
    await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${token("user","user-1")}`);
    const res = await request(app).get("/v1/admin/activity").set("Authorization", `Bearer ${token("super_admin","super-1")}`);
    for (const ev of res.body.activity) {
      expect(typeof ev.at).toBe("string");
      expect(typeof ev.action).toBe("string");
      expect(typeof ev.actor_user_id).toBe("string");
    }
  });
});
