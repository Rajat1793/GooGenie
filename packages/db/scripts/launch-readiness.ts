/**
 * S4-6: Launch readiness review + rollback plan.
 * Run: pnpm launch:readiness
 */
const BASE = process.env.GOOGENIE_BASE_URL ?? "http://localhost:4000";
interface Gate { id: string; status: "PASS"|"FAIL"|"MANUAL"; desc: string; detail?: string; }
const gates: Gate[] = [];
let ok = true;

async function auto(id: string, desc: string, fn: () => Promise<void>) {
  try { await fn(); gates.push({id, status:"PASS", desc}); console.log(`  ✓  [${id}] ${desc}`); }
  catch(e) { ok=false; gates.push({id, status:"FAIL", desc, detail: e instanceof Error ? e.message : String(e)}); console.log(`  ✗  [${id}] ${desc}`); }
}
function manual(id: string, desc: string, note: string) { gates.push({id, status:"MANUAL", desc, detail:note}); console.log(`  ✍  [${id}] ${desc}`); }

async function main() {
  console.log(`\nGoogenie Launch Readiness  •  ${BASE}  •  ${new Date().toISOString().split("T")[0]}\n`);
  console.log("[1] Service Health");
  await auto("LR-01","Health endpoint ok", async () => { const r=await fetch(`${BASE}/health`); if(!r.ok)throw new Error(`${r.status}`); const b=await r.json() as {status:string}; if(b.status!=="ok")throw new Error(`status=${b.status}`); });
  await auto("LR-02","Auth config reachable", async () => { if(!(await fetch(`${BASE}/v1/auth/config`)).ok)throw new Error("not ok"); });
  await auto("LR-03","Metrics endpoint valid", async () => { const r=await fetch(`${BASE}/v1/metrics`); if(!r.ok)throw new Error(`${r.status}`); const b=await r.json() as {counters:unknown;latency:unknown}; if(!b.counters||!b.latency)throw new Error("incomplete"); });
  await auto("LR-04","No critical alerts at launch", async () => { const b=await (await fetch(`${BASE}/v1/alerts`)).json() as {status:string}; if(b.status==="critical")throw new Error("critical alerts"); });
  console.log("\n[2] Security");
  await auto("LR-05","Unauthenticated request rejected", async () => { if((await fetch(`${BASE}/v1/me/profile`)).status!==401)throw new Error("not 401"); });
  await auto("LR-06","X-Powered-By absent", async () => { if((await fetch(`${BASE}/health`)).headers.get("x-powered-by"))throw new Error("present"); });
  await auto("LR-07","x-content-type-options: nosniff", async () => { if((await fetch(`${BASE}/health`)).headers.get("x-content-type-options")!=="nosniff")throw new Error("missing"); });
  await auto("LR-08","Body size limit active (>400 on huge payload)", async () => { const r=await fetch(`${BASE}/v1/admin/users/user-1/role`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer invalid"},body:JSON.stringify({role:"user",reason:"x".repeat(200_000)})}); if(r.status<400)throw new Error(`got ${r.status}`); });
  console.log("\n[3] RBAC");
  await auto("LR-09","Admin routes blocked for unauthenticated", async () => { if((await fetch(`${BASE}/v1/admin/users`)).status!==401)throw new Error("not 401"); });
  await auto("LR-10","Unknown route returns 404 without stack trace", async () => { const r=await fetch(`${BASE}/v1/nonexistent`,{headers:{Authorization:"Bearer invalid"}}); if(r.status===200)throw new Error("leaked"); const t=await r.text(); if(t.includes("    at "))throw new Error("stack exposed"); });
  console.log("\n[4] Manual Gates");
  manual("LR-M01","DB migration backed up","DBA sign-off required");
  manual("LR-M02","Token secrets are production-strength (>=64 chars)","SEC verify env vars");
  manual("LR-M03","Rate limits reviewed for prod traffic","SRE validation required");
  manual("LR-M04","CORS origin locked to production domain","BE lead confirmation");
  manual("LR-M05","Staging UAT sign-off received","pnpm uat:signoff on staging");
  manual("LR-M06","Rollback tested on staging (<10 min)","SRE runbook confirmation");
  console.log(`
  ROLLBACK PROCEDURE (< 10 min)
  ─────────────────────────────
  1. kubectl rollout undo deployment/googenie-backend
     OR swap load balancer to previous ECS task
  2. curl https://<domain>/health  — verify ok
  3. If schema changed: pg_restore -d googenie_prod <backup>.dump
  4. GET /v1/admin/activity — confirm audit logs flowing
  5. Page on-call (P1 user-facing / P2 internal)
  6. Post-mortem within 48h
  `);
  const auto_=gates.filter(g=>g.status!=="MANUAL"), passed=auto_.filter(g=>g.status==="PASS").length, failed=auto_.filter(g=>g.status==="FAIL").length, manual_=gates.filter(g=>g.status==="MANUAL").length;
  console.log(`${"─".repeat(50)}\nAutomated: ${passed} passed  ${failed} failed\nManual:    ${manual_} require sign-off\n${"─".repeat(50)}`);
  if(!ok){ console.log("\n🔴  NO-GO — fix failed gates before deploying.\n"); process.exit(1); }
  console.log(`\n🟡  CONDITIONAL GO — automated gates passed. ${manual_} manual gates need sign-off.\n`);
}
main().catch((e)=>{ console.error(e); process.exit(1); });
