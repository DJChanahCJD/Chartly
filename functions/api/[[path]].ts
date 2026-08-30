import { json, errorJson } from "../_lib/response";
import { preflight } from "../_lib/cors";
import { withCache } from "../_lib/cache";
import { rateLimit, clientIp } from "../_lib/ratelimit";
import { fetchBillboardChart, BILLBOARD_CHARTS } from "../_lib/adapters/billboard";
import { fetchGrammy } from "../_lib/adapters/grammy";
import { fetchGma, GMA_YEARS } from "../_lib/adapters/gma";
import { fetchNobel } from "../_lib/adapters/nobel";

export const onRequest: PagesFunction = async ({ request, params }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return errorJson(405, "method not allowed");

  const { ok, retryAfter } = rateLimit(clientIp(request));
  if (!ok) {
    return errorJson(429, "rate limit exceeded (60 req/min)", {
      "Retry-After": String(retryAfter),
    });
  }

  const segments = ((params.path as string[]) ?? []).filter(Boolean);

  if (segments.length === 0) {
    return json({
      name: "Chartly API",
      version: "0.1.0",
      endpoints: [
        ...BILLBOARD_CHARTS.map((c) => `/api/charts/billboard/${c}`),
        `/api/awards/gma/{year}  (available: ${GMA_YEARS.join(", ")})`,
        "/api/awards/grammy/{year}",
        "/api/awards/nobel/{year}",
      ],
    });
  }

  try {
    const [resource, source, rest0, ...rest] = segments;
    if (rest.length > 0 || !rest0) return errorJson(404, "not found");

    if (resource === "charts" && source === "billboard") {
      const chart = rest0;
      if (!BILLBOARD_CHARTS.includes(chart)) return errorJson(404, `unknown chart: ${chart}`);

      // Optional ?date=YYYY-MM-DD historical query, normalized to the
      // chart's Saturday week inside the adapter.
      let date: string | undefined;
      const dateParam = new URL(request.url).searchParams.get("date");
      if (dateParam !== null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam) || Number.isNaN(Date.parse(dateParam))) {
          return errorJson(400, "invalid date, expected YYYY-MM-DD");
        }
        if (dateParam > new Date().toISOString().slice(0, 10)) {
          return errorJson(400, "date is in the future");
        }
        date = dateParam;
      }

      return await withCache(request, 3600, async () =>
        json(await fetchBillboardChart(chart, date)),
      );
    }

    if (resource === "awards") {
      const year = Number(rest0);
      if (!Number.isInteger(year) || year < 1901 || year > 2100) {
        return errorJson(400, "invalid year");
      }
      if (source === "gma") {
        return await withCache(request, 86400, async () => json(fetchGma(year)));
      }
      if (source === "grammy") {
        return await withCache(request, 86400, async () => json(await fetchGrammy(year)));
      }
      if (source === "nobel") {
        return await withCache(request, 86400, async () => json(await fetchNobel(year)));
      }
      return errorJson(404, `unknown awards source: ${source}`);
    }

    return errorJson(404, "not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream error";
    if (message.startsWith("gma:") || message.startsWith("nobel:")) {
      return errorJson(404, message);
    }
    return errorJson(502, `upstream fetch failed: ${message}`);
  }
};
