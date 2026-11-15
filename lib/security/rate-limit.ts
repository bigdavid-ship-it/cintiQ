import "server-only";

/**
 * In-memory sliding-window limiter. Protects a single server instance only.
 * On Vercel (multi-instance) back this with a shared store (see rate_limits table
 * planned in Phase 6); until then it is a best-effort first line of defence and
 * Supabase Auth's own rate limits remain the authoritative control for auth endpoints.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return { ok: true, retryAfterSec: 0 };
}
