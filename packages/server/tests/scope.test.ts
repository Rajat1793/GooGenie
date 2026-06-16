import { describe, expect, it } from "vitest";

import { resolveAllowedUserIds } from "../src/auth/scope.js";
import { ROLE } from "../src/auth/roles.js";

describe("scope resolver", () => {
  it("allows super_admin to see all active users in tenant", () => {
    const allowed = resolveAllowedUserIds({
      userId: "super-1",
      tenantId: "demo-tenant",
      role: ROLE.SUPER_ADMIN
    });

    expect(allowed.has("user-1")).toBe(true);
    expect(allowed.has("user-2")).toBe(true);
    expect(allowed.has("manager-1")).toBe(true);
  });

  it("limits manager_admin to descendants only", () => {
    const allowed = resolveAllowedUserIds({
      userId: "manager-1",
      tenantId: "demo-tenant",
      role: ROLE.MANAGER_ADMIN
    });

    expect(allowed.has("user-1")).toBe(true);
    expect(allowed.has("user-2")).toBe(true);
    expect(allowed.has("user-3")).toBe(false);
  });

  it("limits user role to self only", () => {
    const allowed = resolveAllowedUserIds({
      userId: "user-1",
      tenantId: "demo-tenant",
      role: ROLE.USER
    });

    expect([...allowed]).toEqual(["user-1"]);
  });
});
