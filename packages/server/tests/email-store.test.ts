import { describe, expect, it } from "vitest";

import { getEmailThreadById, listEmailThreads } from "../src/domain/email-store.js";

describe("email store tenant and scope filtering", () => {
  it("lists only tenant threads within allowed user scope", () => {
    const threads = listEmailThreads("demo-tenant", new Set(["user-1", "user-2"]));
    expect(threads.map((thread) => thread.id)).toEqual(["thr-1", "thr-2"]);
  });

  it("returns undefined for thread outside allowed scope", () => {
    const thread = getEmailThreadById("demo-tenant", "thr-3", new Set(["user-1"]));
    expect(thread).toBeUndefined();
  });
});
