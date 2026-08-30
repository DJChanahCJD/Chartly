interface CacheEntryMeta {
  cachedAt: string;
}

/**
 * Cache API wrapper. Keyed by request URL, TTL via Cache-Control header.
 * Sets X-Cache: HIT/MISS for observability.
 */
export async function withCache(
  request: Request,
  ttlSeconds: number,
  produce: () => Promise<Response>,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("X-Cache", "HIT");
    return res;
  }

  const fresh = await produce();
  const cacheable = new Response(fresh.clone().body, fresh);
  cacheable.headers.set(
    "Cache-Control",
    `public, s-maxage=${ttlSeconds}, stale-while-revalidate=86400`,
  );
  cacheable.headers.set("X-Cache", "MISS");
  cacheable.headers.set("X-Cached-At", new Date().toISOString());

  const toStore = new Response(fresh.clone().body, cacheable);
  const meta: CacheEntryMeta = { cachedAt: cacheable.headers.get("X-Cached-At")! };
  void cache.put(cacheKey, toStore).catch(() => {});

  return cacheable;
}
