import { describe, expect, it } from "vitest";

import { isFeatureEnabled } from "../src/auth/policy-store.js";

describe("feature toggles", () => {
  it("returns true when feature is enabled for a user", () => {
    expect(isFeatureEnabled("demo-tenant", "user-1", "email_read")).toBe(true);
  });

  it("returns false when feature is disabled for a user", () => {
    expect(isFeatureEnabled("demo-tenant", "user-2", "email_read")).toBe(false);
  });

  it("returns false for unknown feature keys", () => {
    expect(isFeatureEnabled("demo-tenant", "user-1", "calendar_delete")).toBe(false);
  });
});
