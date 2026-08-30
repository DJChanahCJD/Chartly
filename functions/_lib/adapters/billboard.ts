// Billboard chart adapter.
// Billboard's wp-json charts API is 404, so this scrapes the public chart
// page HTML (verified structure: rank <li> blocks with title/artist/LW/PEAK/
// WEEKS labels + a chart-date-picker data-date attribute).

const BILLBOARD_SLUGS: Record<string, string> = {
  "hot-100": "hot-100",
  "album-200": "billboard-200",
  "global-200": "billboard-global-200",
  "artist-100": "artist-100",
};

// What each chart ranks — surface it in the response so consumers don't
// have to know that album-200 means albums and artist-100 means artists.
const BILLBOARD_TYPES: Record<string, "songs" | "albums" | "artists"> = {
  "hot-100": "songs",
  "album-200": "albums",
  "global-200": "songs",
  "artist-100": "artists",
};

// Billboard charts are dated by Saturday. Normalize any date to the chart
// week it belongs to: the same-day Saturday, else the next upcoming one.
export function chartWeekSaturday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // Sun=0 … Sat=6
  const delta = (6 - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const BILLBOARD_CHARTS = Object.keys(BILLBOARD_SLUGS);

const RANK_LI = '<li class="o-chart-results-list__item // lrv-u-color-black u-width-60';

const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function labelText(chunk: string, label: string): number | null {
  const m = chunk.match(
    new RegExp(`>\\s*${label}\\s*</span>.*?<span class="c-label[^>]*>\\s*([^<]+?)\\s*</span>`, "s"),
  );
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

function parseChartPage(html: string, chart: string) {
  const dateMatch = html.match(/id="chart-date-picker"\s+data-date="([^"]+)"/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
  const isArtistChart = BILLBOARD_TYPES[chart] === "artists";

  const entries = [];
  const chunks = html.split(RANK_LI).slice(1);

  for (const chunk of chunks) {
    const rank = chunk.match(/<span class="c-label[^>]*>\s*([^<]+?)\s*<\/span>/);
    const title = chunk.match(/id="title-of-a-story"[^>]*>([\s\S]*?)<\/h3>/);
    const artistSpan = chunk.match(/<span class="[^"]*a-no-trucate[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const cover = chunk.match(/src="(https:\/\/charts-static\.billboard\.com[^"]+)"/);

    if (!rank || !title) continue;

    const artistRaw = (artistSpan?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const name = decodeEntities(title[1].replace(/<[^>]+>/g, ""));

    // On artist charts the "title" slot holds the artist name.
    const entry: Record<string, unknown> = {
      rank: parseInt(rank[1], 10),
      artist: decodeEntities(artistRaw) || "Unknown artist",
      cover: cover ? cover[1] : null,
      lastWeek: labelText(chunk, "LW"),
      peak: labelText(chunk, "PEAK"),
      weeks: labelText(chunk, "WEEKS"),
    };
    if (!isArtistChart) entry.title = name;

    entries.push(entry);
  }

  if (entries.length === 0) throw new Error("billboard upstream: no entries parsed");
  return {
    source: "billboard" as const,
    chart,
    type: BILLBOARD_TYPES[chart],
    date,
    entries,
  };
}

export async function fetchBillboardChart(chart: string, date?: string) {
  const slug = BILLBOARD_SLUGS[chart];
  if (!slug) throw new Error(`unknown chart: ${chart}`);

  // Historical weeks live at /charts/{slug}/{saturday}/; omit for latest.
  const weekPath = date ? `/${chartWeekSaturday(date)}/` : "/";
  const res = await fetch(`https://www.billboard.com/charts/${slug}${weekPath}`, { headers: UA });
  if (!res.ok) throw new Error(`billboard upstream ${res.status}`);
  return parseChartPage(await res.text(), chart);
}
