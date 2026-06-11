import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { app } from "../src/index.js";

function tokenFor(role: "super_admin" | "manager_admin" | "user", userId: string) {
  return createAccessToken({
    sub: userId,
    tenant_id: "demo-tenant",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
}

describe("S3-3: auth config endpoint", () => {
  it("returns token lifecycle config without auth", async () => {
    const res = await request(app).get("/v1/auth/config");
    expect(res.status).toBe(200);
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.algorithm).toBe("HMAC-SHA256");
    expect(typeof res.body.access_token_ttl_seconds).toBe("number");
    expect(typeof res.body.refresh_token_ttl_seconds).toBe("number");
    expect(typeof res.body.refresh_window_seconds).toBe("number");
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(Array.isArray(res.body.scopes)).toBe(true);
  });
});

describe("S3-4: enhanced error contract", () => {
  beforeEach(() => {
    resetPolicyStoreDefaults();
  });

  it("validation error includes retryable=false and correct status", async () => {
    const token = tokenFor("super_admin", "super-1");
    const res = await request(app)
      .patch("/v1/admin/users/user-1/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "invalid_role" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.retryable).toBe(false);
    expect(typeof res.body.trace_id).toBe("string");
  });

  it("unauthorized error includes retryable=false", async () => {
    const res = await request(app).get("/v1/me/profile");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.retryable).toBe(false);
    expect(typeof res.body.trace_id).toBe("string");
  });

  it("forbidden error includes retryable=false", async () => {
    const token = tokenFor("user", "user-1");
    const res = await request(app)
      .get("/v1/admin/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.retryable).toBe(false);
  });

  it("not_found error has correct shape", async () => {
    const token = tokenFor("super_admin", "super-1");
    const res = await request(app)
      .get("/v1/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(typeof res.body.trace_id).toBe("string");
  });

  it("CONFLICT code maps to HTTP 409", async () => {
    // Verify statusFromApiError directly
    const { statusFromApiError } = await import("../src/security/errors.js");
    expect(statusFromApiError("CONFLICT")).toBe(409);
  });
});
