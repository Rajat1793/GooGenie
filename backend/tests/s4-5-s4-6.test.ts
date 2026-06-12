/**
 * S4-5 + S4-6: UAT and launch readiness script validation.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

describe("S4-5: uat-signoff.ts", () => {
  it("script file exists with UAT scenario matrix", () => {
    const path = join(ROOT, "scripts/uat-signoff.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("UAT-INF-01");
    expect(src).toContain("UAT-SEC-01");
    expect(src).toContain("UAT-RBAC-01");
    expect(src).toContain("PASS");
    expect(src).toContain("FAIL");
    expect(src).toContain("SKIP");
  });
});

describe("S4-6: launch-readiness.ts", () => {
  it("script file exists with all gate categories and rollback plan", () => {
    const path = join(ROOT, "scripts/launch-readiness.ts");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("LR-01");
    expect(src).toContain("LR-05");
    expect(src).toContain("LR-M01");
    expect(src).toContain("ROLLBACK PROCEDURE");
    expect(src).toContain("CONDITIONAL GO");
    expect(src).toContain("NO-GO");
    expect(src).toContain("pg_restore");
  });
});
