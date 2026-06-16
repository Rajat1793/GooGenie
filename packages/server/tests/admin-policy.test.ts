import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assignManager,
  listRoleChanges,
  resetPolicyStoreDefaults,
  updateUserRole
} from "../src/auth/policy-store.js";

describe("admin policy updates", () => {
  beforeEach(() => {
    resetPolicyStoreDefaults();
  });

  afterEach(() => {
    resetPolicyStoreDefaults();
  });

  it("updates role and records change log", () => {
    const updated = updateUserRole({
      tenantId: "demo-tenant",
      targetUserId: "user-1",
      newRole: "manager_admin",
      changedByUserId: "super-1",
      reason: "promotion"
    });

    expect(updated?.role).toBe("manager_admin");
    expect(listRoleChanges("demo-tenant")).toHaveLength(1);
  });

  it("updates manager when users are in same tenant", () => {
    const updated = assignManager({
      tenantId: "demo-tenant",
      targetUserId: "user-1",
      managerUserId: "super-1"
    });

    expect(updated?.managerUserId).toBe("super-1");
  });
});
