import { describe, expect, it } from "vitest";

import { ALL_ROLES, ROLE } from "../src/auth/roles.js";

describe("role model", () => {
  it("contains all sprint-0 baseline roles", () => {
    expect(ALL_ROLES).toEqual([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN, ROLE.USER]);
  });
});
