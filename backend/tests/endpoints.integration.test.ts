import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccessToken } from "../src/auth/token.js";
import { resetPolicyStoreDefaults } from "../src/auth/policy-store.js";
import { app } from "../src/index.js";

function tokenFor(role: "super_admin" | "manager_admin" | "user", userId: string): string {
  return createAccessToken({
    sub: userId,
    tenant_id: "demo-tenant",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
}

describe("backend endpoints complete check", () => {
  beforeEach(() => {
    resetPolicyStoreDefaults();
  });

  it("validates health and profile endpoints", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);

    const userToken = tokenFor("user", "user-1");
    const profile = await request(app)
      .get("/v1/me/profile")
      .set("Authorization", `Bearer ${userToken}`);

    expect(profile.status).toBe(200);
    expect(profile.body.id).toBe("user-1");
  });

  it("returns self-service features and activity for any role (S2-7/S2-8)", async () => {
    const userToken = tokenFor("user", "user-1");
    const managerToken = tokenFor("manager_admin", "manager-1");

    // user-1 has email_read, calendar_read, calendar_write seeded
    const features = await request(app)
      .get("/v1/me/features")
      .set("Authorization", `Bearer ${userToken}`);
    expect(features.status).toBe(200);
    expect(Array.isArray(features.body.features)).toBe(true);
    expect(features.body.features.length).toBeGreaterThan(0);

    // call profile first so there's at least one audit event
    await request(app).get("/v1/me/profile").set("Authorization", `Bearer ${userToken}`);
    const activity = await request(app)
      .get("/v1/me/activity")
      .set("Authorization", `Bearer ${userToken}`);
    expect(activity.status).toBe(200);
    expect(Array.isArray(activity.body.activity)).toBe(true);
    // all returned events must belong to the calling user
    for (const ev of activity.body.activity) {
      expect(ev.actor_user_id).toBe("user-1");
    }

    // manager can also access their own features
    const mgrFeatures = await request(app)
      .get("/v1/me/features")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(mgrFeatures.status).toBe(200);
    expect(Array.isArray(mgrFeatures.body.features)).toBe(true);
  });

  it("enforces admin endpoints by role", async () => {
    const adminToken = tokenFor("super_admin", "super-1");
    const managerToken = tokenFor("manager_admin", "manager-1");

    const adminUsers = await request(app)
      .get("/v1/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminUsers.status).toBe(200);
    expect(Array.isArray(adminUsers.body.users)).toBe(true);

    const denied = await request(app)
      .get("/v1/admin/users")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(denied.status).toBe(403);

    const roleUpdate = await request(app)
      .patch("/v1/admin/users/user-2/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "manager_admin", reason: "promotion" });
    expect(roleUpdate.status).toBe(200);

    const managerUpdate = await request(app)
      .patch("/v1/admin/users/user-2/manager")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ manager_user_id: "manager-2" });
    expect(managerUpdate.status).toBe(200);

    const activity = await request(app)
      .get("/v1/admin/activity")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(activity.status).toBe(200);
    expect(Array.isArray(activity.body.activity)).toBe(true);
  });

  it("covers manager endpoints including S2-4 feature and bulk actions", async () => {
    const managerToken = tokenFor("manager_admin", "manager-1");

    const users = await request(app)
      .get("/v1/manager/users")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(users.status).toBe(200);

    const inScopeActivity = await request(app)
      .get("/v1/manager/users/user-1/activity")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(inScopeActivity.status).toBe(200);

    const outOfScopeActivity = await request(app)
      .get("/v1/manager/users/user-3/activity")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(outOfScopeActivity.status).toBe(403);

    const patchFeature = await request(app)
      .patch("/v1/manager/users/user-1/feature-access")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ feature_key: "email_read", is_enabled: false });
    expect(patchFeature.status).toBe(200);

    const bulk = await request(app)
      .post("/v1/manager/bulk-actions")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        action: "set_feature_access",
        user_ids: ["user-1", "user-2"],
        payload: { feature_key: "calendar_write", is_enabled: true }
      });
    expect(bulk.status).toBe(200);
    expect(bulk.body.updated_count).toBe(2);
  });

  it("covers email and calendar tenant-scope endpoints", async () => {
    const managerToken = tokenFor("manager_admin", "manager-1");
    const userDisabledEmailToken = tokenFor("user", "user-2");

    const emailThreads = await request(app)
      .get("/v1/email/threads?userId=user-1")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(emailThreads.status).toBe(200);

    const emailThread = await request(app)
      .get("/v1/email/threads/thr-1")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(emailThread.status).toBe(200);

    const emailThreadOutOfScope = await request(app)
      .get("/v1/email/threads/thr-3")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(emailThreadOutOfScope.status).toBe(404);

    const blockedByFeature = await request(app)
      .get("/v1/email/threads")
      .set("Authorization", `Bearer ${userDisabledEmailToken}`);
    expect(blockedByFeature.status).toBe(403);

    const calendarList = await request(app)
      .get("/v1/calendar/events?userId=user-1")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(calendarList.status).toBe(200);

    const calendarCreate = await request(app)
      .post("/v1/calendar/events")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        title: "Manager planning",
        starts_at: "2026-06-12T10:00:00.000Z",
        ends_at: "2026-06-12T10:30:00.000Z",
        attendees: ["team@nimbus.dev"]
      });
    expect(calendarCreate.status).toBe(201);
  });

  it("returns deterministic 404 for unknown route", async () => {
    const token = tokenFor("super_admin", "super-1");
    const response = await request(app)
      .get("/v1/does-not-exist")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});
