/**
 * S3-8: Performance baseline script
 * Run: pnpm tsx scripts/perf-baseline.ts
 *
 * Fires concurrent requests against a running backend and reports:
 *   - p50, p90, p95, p99 latencies
 *   - throughput (req/s)
 *   - error rate
 *
 * Requires backend running: pnpm dev (port 4000)
 * Token env var: NIMBUS_PERF_TOKEN (super_admin bearer token)
 */

const BASE_URL = process.env.NIMBUS_BASE_URL ?? "http://localhost:4000";
const TOKEN = process.env.NIMBUS_PERF_TOKEN ?? "";
const CONCURRENCY = parseInt(process.env.PERF_CONCURRENCY ?? "10", 10);
const DURATION_MS = parseInt(process.env.PERF_DURATION_MS ?? "10000", 10);
const WARMUP_MS = 1000;

interface Result {
  latencyMs: number;
  status: number;
}

const SCENARIOS = [
  { name: "GET /health", path: "/health", auth: false },
  { name: "GET /v1/auth/config", path: "/v1/auth/config", auth: false },
  { name: "GET /v1/me/profile", path: "/v1/me/profile", auth: true },
  { name: "GET /v1/me/features", path: "/v1/me/features", auth: true },
  { name: "GET /v1/admin/users?limit=5", path: "/v1/admin/users?limit=5", auth: true },
  { name: "GET /v1/email/threads?userId=user-1&limit=5", path: "/v1/email/threads?userId=user-1&limit=5", auth: true }
];

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runScenario(scenario: typeof SCENARIOS[0], results: Result[]): Promise<void> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${scenario.path}`, {
      headers: scenario.auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
    });
    results.push({ latencyMs: Date.now() - start, status: res.status });
  } catch {
    results.push({ latencyMs: Date.now() - start, status: 0 });
  }
}

function report(name: string, results: Result[]): void {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const errors = results.filter((r) => r.status === 0 || r.status >= 500).length;
  const durationS = DURATION_MS / 1000;

  console.log(`\n  ${name}`);
  console.log(`    requests:    ${results.length}`);
  console.log(`    throughput:  ${(results.length / durationS).toFixed(1)} req/s`);
  console.log(`    error rate:  ${((errors / results.length) * 100).toFixed(1)}%`);
  console.log(`    p50:         ${percentile(latencies, 50)} ms`);
  console.log(`    p90:         ${percentile(latencies, 90)} ms`);
  console.log(`    p95:         ${percentile(latencies, 95)} ms  ${percentile(latencies, 95) > 200 ? "⚠ above 200ms target" : "✓"}`);
  console.log(`    p99:         ${percentile(latencies, 99)} ms`);
}

async function main() {
  console.log(`Nimbus Performance Baseline`);
  console.log(`  base:        ${BASE_URL}`);
  console.log(`  concurrency: ${CONCURRENCY}`);
  console.log(`  duration:    ${DURATION_MS}ms`);
  if (!TOKEN) console.warn("  ⚠ NIMBUS_PERF_TOKEN not set — authenticated endpoints will return 401");

  // Warmup
  process.stdout.write(`  Warming up (${WARMUP_MS}ms)...`);
  const warmupEnd = Date.now() + WARMUP_MS;
  while (Date.now() < warmupEnd) {
    await fetch(`${BASE_URL}/health`).catch(() => {});
  }
  console.log(" done\n");

  for (const scenario of SCENARIOS) {
    const results: Result[] = [];
    const end = Date.now() + DURATION_MS;

    // Run concurrently until duration expires
    while (Date.now() < end) {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, () => runScenario(scenario, results))
      );
    }

    report(scenario.name, results);
  }

  console.log("\nBaseline complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
