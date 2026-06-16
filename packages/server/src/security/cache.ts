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

// TTL constants
export const TTL = {
  THREADS:   30_000,  // 30s — inbox list
  THREAD:    60_000,  // 60s — single thread
  CALENDAR:  30_000,  // 30s — calendar events
  CONNECT:  120_000,  // 2m  — connection status
};
