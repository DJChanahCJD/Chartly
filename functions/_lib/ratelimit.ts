const WINDOW_MS = 60_000;
const LIMIT = 60;

interface Bucket {
  timestamps: number[];
}

// Per-isolate in-memory sliding window. Cross-isolate counts are approximate,
// which is acceptable for a free public API without KV/DO.
const buckets = new Map<string, Bucket>();

export function rateLimit(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);

  if (bucket.timestamps.length >= LIMIT) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - bucket.timestamps[0])) / 1000);
    buckets.set(ip, bucket);
    return { ok: false, retryAfter };
  }

  bucket.timestamps.push(now);
  buckets.set(ip, bucket);

  if (buckets.size > 10_000) {
    for (const [key, b] of buckets) {
      if (b.timestamps.every((t) => now - t >= WINDOW_MS)) buckets.delete(key);
      if (buckets.size <= 5_000) break;
    }
  }

  return { ok: true, retryAfter: 0 };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    "unknown"
  );
}
