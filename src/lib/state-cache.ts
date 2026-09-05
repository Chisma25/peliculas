export const PAGE_ROUTE_CACHE_TTL_MS = 1000 * 60 * 2;
export const MOVIE_DETAIL_CACHE_TTL_MS = 1000 * 60 * 2;

export type TimedCache<T> = {
  value: T;
  expiresAt: number;
};

export function cloneState<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function readTimedCache<T>(entry: TimedCache<T> | null | undefined) {
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }

  return cloneState(entry.value);
}

export function writeTimedCacheWithTtl<T>(value: T, ttlMs: number): TimedCache<T> {
  return {
    value: cloneState(value),
    expiresAt: Date.now() + ttlMs
  };
}
