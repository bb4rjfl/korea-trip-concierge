import { DEFAULT_CACHE_TTL_MS } from "./constants.js";

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Tiny in-memory TTL cache. Stateless across requests is fine for a single
 * process — this only caches external API responses to protect p99 and reduce
 * upstream load. NOT used for any per-user state (server stays stateless).
 */
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS) {}

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Get from cache or compute+store via loader. */
  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await loader();
    this.set(key, value);
    return value;
  }
}
