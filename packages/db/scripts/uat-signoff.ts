/**
 * S4-5: UAT sign-off scenario runner.
 * Run: pnpm uat:signoff
 * With live tokens: GOOGENIE_BASE_URL=http://localhost:4000 GOOGENIE_ADMIN_TOKEN=<token> ... pnpm uat:signoff
 */
const BASE = process.env.GOOGENIE_BASE_URL ?? "http://localhost:4000";
const ADMIN_TOKEN = process.env.GOOGENIE_ADMIN_TOKEN ?? "";
const MGR_TOKEN = process.env.GOOGENIE_MGR_TOKEN ?? "";
const USER_TOKEN = process.env.GOOGENIE_USER_TOKEN ?? "";

interface Result { id: string; scenario: string; status: "PASS" | "FAIL" | "SKIP"; expected: string; actual?: string; }
const results: Result[] = [];

async function check(id: string, scenario: string, expected: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ id, scenario, status: "PASS", expected }); process.stdout.write(`  ✓  ${id}\n`); }
  catch (e) { results.push({ id, scenario, status: "FAIL", expected, actual: e instanceof Error ? e.message : String(e) }); process.stdout.write(`  ✗  ${id}\n`); }
}

async function g(path: string, token: string) { return fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

async function main() {
  console.log(`\nGoogenie UAT Sign-off  •  ${BASE}\n`);
  console.log("[Infrastructure]");
  await check("UAT-INF-01", "Health check ok", "HTTP 200 status:ok", async () => { const r = await g("/health",""); assert(r.status===200,`${r.status}`); const b = await r.json() as {status:string}; assert(b.status==="ok","status!=ok"); });
  await check("UAT-INF-02", "Auth config reachable", "HTTP 200", async () => { assert((await g("/v1/auth/config","")).status===200,"!=200"); });
  await check("UAT-INF-03", "Metrics endpoint reachable", "HTTP 200 with counters", async () => { const r = await g("/v1/metrics",""); assert(r.status===200,`${r.status}`); const b = await r.json() as {counters:unknown}; assert(!!b.counters,"no counters"); });
  await check("UAT-INF-04", "Alerts return valid envelope", "HTTP 200", async () => { const r = await g("/v1/alerts",""); assert(r.status===200,`${r.status}`); const b = await r.json() as {status:string}; assert(["ok","warn","critical"].includes(b.status),"bad status"); });
  console.log("\n[Security]");
  await check("UAT-SEC-01", "Unauthenticated request rejected", "HTTP 401", async () => { assert((await g("/v1/me/profile","")).status===401,"!=401"); });
  await check("UAT-SEC-02", "Tampered token rejected", "HTTP 401", async () => { assert((await g("/v1/me/profile","invalid.token.sig")).status===401,"!=401"); });
  await check("UAT-SEC-03", "X-Powered-By absent", "Header not present", async () => { assert(!( await g("/health","")).headers.get("x-powered-by"),"present"); });
  await check("UAT-SEC-04", "x-content-type-options: nosniff", "Header = nosniff", async () => { assert((await g("/health","")).headers.get("x-content-type-options")==="nosniff","!=nosniff"); });
  if (ADMIN_TOKEN && MGR_TOKEN && USER_TOKEN) {
    console.log("\n[RBAC]");
    await check("UAT-RBAC-01", "Admin lists all users", "HTTP 200 + users[]", async () => { const r = await g("/v1/admin/users", ADMIN_TOKEN); assert(r.status===200,`${r.status}`); const b = await r.json() as {users:unknown[]}; assert(b.users.length>0,"empty"); });
    await check("UAT-RBAC-02", "Manager blocked from admin routes", "HTTP 403", async () => { assert((await g("/v1/admin/users",MGR_TOKEN)).status===403,"!=403"); });
    await check("UAT-RBAC-03", "User blocked from admin+manager", "HTTP 403 both", async () => { assert((await g("/v1/admin/users",USER_TOKEN)).status===403,"admin!=403"); assert((await g("/v1/manager/users",USER_TOKEN)).status===403,"mgr!=403"); });
    await check("UAT-RBAC-04", "User profile has role=user", "role=user", async () => { const b = await (await g("/v1/me/profile",USER_TOKEN)).json() as {role:string}; assert(b.role==="user",`role=${b.role}`); });
  } else {
    results.push({ id:"UAT-RBAC-*", scenario:"RBAC checks", status:"SKIP", expected:"tokens required" });
    console.log("\n  (skipped RBAC — set GOOGENIE_ADMIN_TOKEN, GOOGENIE_MGR_TOKEN, GOOGENIE_USER_TOKEN)");
  }
  const passed=results.filter(r=>r.status==="PASS").length, failed=results.filter(r=>r.status==="FAIL").length, skipped=results.filter(r=>r.status==="SKIP").length;
  console.log(`\n${"─".repeat(50)}\n  ${passed} passed  ${failed} failed  ${skipped} skipped\n${"─".repeat(50)}`);
  if (failed>0) { console.log("\nFAILED:"); results.filter(r=>r.status==="FAIL").forEach(r=>console.log(`  ${r.id}: ${r.actual}`)); process.exit(1); }
  console.log("\n✓ All UAT scenarios passed.\n");
}
main().catch((e)=>{ console.error(e); process.exit(1); });
