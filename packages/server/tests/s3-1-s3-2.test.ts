import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { clearIdempotencyStore } from "../src/security/idempotency.js";
import { encodeCursor, decodeCursor } from "../src/security/pagination.js";
import { app } from "../src/index.js";

function tokenFor(role: "super_admin" | "manager_admin" | "user", userId: string) {
  return createAccessToken({
    sub: userId,
    tenant_id: "demo-tenant",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
}

describe("S3-1: idempotency middleware", () => {
  beforeEach(() => {
    resetPolicyStoreDefaults();
    clearIdempotencyStore();
  });

  it("returns cached response on repeated Idempotency-Key", async () => {
    const token = tokenFor("manager_admin", "manager-1");
    const key = "test-key-abc-123";

    const first = await request(app)
      .patch("/v1/manager/users/user-1/feature-access")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ feature_key: "email_read", is_enabled: false });
    expect(first.status).toBe(200);
    expect(first.headers["idempotency-replayed"]).toBeUndefined();

    const second = await request(app)
      .patch("/v1/manager/users/user-1/feature-access")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ feature_key: "email_read", is_enabled: true }); // different body — should be ignored
    expect(second.status).toBe(200);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    // body should be the cached first response
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
  });

  it("processes independently without Idempotency-Key", async () => {
    const token = tokenFor("manager_admin", "manager-1");

    const r1 = await request(app)
      .patch("/v1/manager/users/user-1/feature-access")
      .set("Authorization", `Bearer ${token}`)
      .send({ feature_key: "email_read", is_enabled: false });
    expect(r1.status).toBe(200);
    expect(r1.headers["idempotency-replayed"]).toBeUndefined();
  });
});

describe("S3-2: cursor pagination", () => {
  beforeEach(() => {
    resetPolicyStoreDefaults();
    clearIdempotencyStore();
  });

  it("paginates admin users with limit", async () => {
    const token = tokenFor("super_admin", "super-1");
    const res = await request(app)
      .get("/v1/admin/users?limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeLessThanOrEqual(2);
    expect(typeof res.body.total).toBe("number");
    // 6 total users seeded, limit 2 → next_cursor present
    expect(res.body.next_cursor).not.toBeNull();
  });

  it("returns second page via cursor", async () => {
    const token = tokenFor("super_admin", "super-1");
    const first = await request(app)
      .get("/v1/admin/users?limit=2")
      .set("Authorization", `Bearer ${token}`);
    const cursor = first.body.next_cursor as string;

    const second = await request(app)
      .get(`/v1/admin/users?limit=2&cursor=${cursor}`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.users.length).toBeGreaterThan(0);
    // no overlap with first page
    const firstIds = (first.body.users as Array<{ id: string }>).map((u) => u.id);
    const secondIds = (second.body.users as Array<{ id: string }>).map((u) => u.id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it("paginates email threads", async () => {
    const token = tokenFor("super_admin", "super-1");
    const res = await request(app)
      .get("/v1/email/threads?limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.threads.length).toBeLessThanOrEqual(1);
    expect(typeof res.body.total).toBe("number");
  });

  it("encodeCursor/decodeCursor round-trips", () => {
    const c = encodeCursor(42);
    expect(typeof c).toBe("string");
    expect(decodeCursor(c)).toBe(42);
  });
});
