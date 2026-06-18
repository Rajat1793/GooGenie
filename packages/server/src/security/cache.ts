/**
 * Simple in-memory TTL cache for backend API results.
 * Reduces Gmail / Calendar API calls for repeated fetches.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

// Single shared cache instance
export const cache = new TtlCache();

// TTL constants.
//
// Bumped from 30s/60s to several minutes because Gmail/Calendar list calls
// are the dominant source of latency (200-1500ms each upstream). React Query
// already does its own background refetch every 20-60s, so this cache only
// needs to absorb the burst of parallel requests from prefetch waves +
// component remounts. A stale-for-5-minutes value is still fresher than the
// 60s React Query refetch interval guarantees on the wire.
export const TTL = {
  THREADS:  300_000,  // 5m  — inbox list (was 30s)
  THREAD:   600_000,  // 10m — single thread body (was 60s)
  CALENDAR: 300_000,  // 5m  — calendar events (was 30s)
  CONNECT:  600_000,  // 10m — connection status (was 2m)
};
