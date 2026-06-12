/// <reference path="../contracts/request.d.ts" />
/**
 * S4-3: In-memory metrics for authz and reliability observability.
 * KPIs: authz_denied rate, 5xx rate, p95 latency (Sprint 0 S0-5 requirements).
 */

export interface MetricCounters {
  authz_denied: number;
  authz_granted: number;
  rate_limited: number;
  request_count: number;
  error_5xx: number;
}

export interface LatencyBucket {
  p50: number; p90: number; p95: number; p99: number; samples: number;
}

const MAX_SAMPLES = 1000;
const latencySamples: number[] = [];

const counters: MetricCounters = {
  authz_denied: 0, authz_granted: 0, rate_limited: 0, request_count: 0, error_5xx: 0
};

export function recordRequest(opts: {
  durationMs: number; statusCode: number; wasAuthz: boolean; wasGranted?: boolean;
}): void {
  counters.request_count++;
  if (latencySamples.length >= MAX_SAMPLES) latencySamples.shift();
  latencySamples.push(opts.durationMs);
  if (opts.statusCode === 403) counters.authz_denied++;
  if (opts.statusCode === 429) counters.rate_limited++;
  if (opts.statusCode >= 500) counters.error_5xx++;
  if (opts.wasAuthz && opts.wasGranted) counters.authz_granted++;
}

export function getCounters(): MetricCounters { return { ...counters }; }

export function getLatency(): LatencyBucket {
  if (latencySamples.length === 0) return { p50: 0, p90: 0, p95: 0, p99: 0, samples: 0 };
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.ceil((pct / 100) * sorted.length) - 1];
  return { p50: p(50), p90: p(90), p95: p(95), p99: p(99), samples: sorted.length };
}

export const ALERT_THRESHOLDS = {
  p95_latency_ms: 200,
  authz_denied_rate: 0.10,
  error_5xx_rate: 0.01
} as const;

export interface AlertStatus {
  name: string; status: "ok" | "warn" | "critical"; value: number; threshold: number; message: string;
}

export function evaluateAlerts(): AlertStatus[] {
  const lat = getLatency();
  const c = getCounters();
  const total = Math.max(c.request_count, 1);
  return [
    {
      name: "p95_latency",
      status: lat.p95 > ALERT_THRESHOLDS.p95_latency_ms ? "warn" : "ok",
      value: lat.p95, threshold: ALERT_THRESHOLDS.p95_latency_ms,
      message: lat.p95 > ALERT_THRESHOLDS.p95_latency_ms
        ? `p95 latency ${lat.p95}ms exceeds target` : "p95 latency within target"
    },
    {
      name: "authz_denied_rate",
      status: (c.authz_denied / total) > ALERT_THRESHOLDS.authz_denied_rate ? "warn" : "ok",
      value: Math.round((c.authz_denied / total) * 1000) / 10,
      threshold: ALERT_THRESHOLDS.authz_denied_rate * 100,
      message: (c.authz_denied / total) > ALERT_THRESHOLDS.authz_denied_rate
        ? `AuthZ denial rate ${((c.authz_denied / total) * 100).toFixed(1)}% exceeds threshold` : "AuthZ denial rate normal"
    },
    {
      name: "error_5xx_rate",
      status: (c.error_5xx / total) > ALERT_THRESHOLDS.error_5xx_rate ? "critical" : "ok",
      value: Math.round((c.error_5xx / total) * 1000) / 10,
      threshold: ALERT_THRESHOLDS.error_5xx_rate * 100,
      message: (c.error_5xx / total) > ALERT_THRESHOLDS.error_5xx_rate
        ? `5xx error rate ${((c.error_5xx / total) * 100).toFixed(1)}% exceeds threshold` : "5xx error rate normal"
    }
  ];
}

export function resetMetrics(): void {
  counters.authz_denied = 0; counters.authz_granted = 0;
  counters.rate_limited = 0; counters.request_count = 0; counters.error_5xx = 0;
  latencySamples.length = 0;
}
