/**
 * In-memory LRU cache with TTL.
 *
 * Used to cache deterministic AI responses (e.g. "summarise thread X") so
 * re-clicking the same button is instant + costs zero API calls.
 *
 * For a multi-instance deployment swap this for Redis later — same get/set/del
 * shape applies.
 *
 * Why not Redis now?
 *   - $7/mo on Render
 *   - At <1K cache hits/day a JS Map performs fine
 *   - Single instance backend means no cache-coherency problem yet
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TTLCache<V> {
  private store = new Map<string, CacheEntry<V>>();
  private order: string[] = []; // LRU tracking

  constructor(
    private maxEntries = 500,
    private defaultTtlMs = 5 * 60 * 1000, // 5 minutes
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    // LRU bump
    this.order = this.order.filter((k) => k !== key);
    this.order.push(key);
    return entry.value;
  }

  set(key: string, value: V, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Evict oldest
      const oldest = this.order.shift();
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
    this.order = this.order.filter((k) => k !== key);
    this.order.push(key);
  }

  delete(key: string): void {
    this.store.delete(key);
    this.order = this.order.filter((k) => k !== key);
  }

  clear(): void {
    this.store.clear();
    this.order = [];
  }

  size(): number {
    return this.store.size;
  }
}

// Shared cache for all AI endpoints — separate buckets per feature
export const aiCache = {
  summary:  new TTLCache<unknown>(200, 10 * 60 * 1000),  // 10 min — summaries are stable
  compose:  new TTLCache<unknown>(100,  2 * 60 * 1000),  //  2 min — fresh-ish
  slots:    new TTLCache<unknown>(100,  5 * 60 * 1000),  //  5 min
  embed:    new TTLCache<number[]>(1000, 60 * 60 * 1000), // 1 hour — embeddings rarely change
};
