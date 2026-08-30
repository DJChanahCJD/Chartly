// The Game Awards adapter. thegameawards.com is a Next.js site with no
// public API: the current edition's winners live in the RSC payload of any
// /nominees/{slug} page ("allAwards" carries every category), while past
// editions are archived as SSR HTML on /rewind/year-{N} (winners only).
// The API returns winners only, keyed by ceremony year; edition = year - 2013
// (2014 is the 1st TGA).

export interface TgaAward {
  name: string;
  winner: string | null;
}

const TGA_START = 2014;
const REWIND_URL = "https://thegameawards.com/rewind/year-";
const NOMINEES_URL = "https://thegameawards.com/nominees/game-of-the-year";
// Rewind archives lag one edition behind; probe this many years back from
// the requested year to find the latest archived one.
const ARCHIVE_PROBE_WINDOW = 5;

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "));
}

// RSC payload strings are JS-string-encoded (\u0026 etc.); the regex captures
// stop before backslashes, so what's left is always valid JSON string content.
function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

// Winner titles carry a "[CATEGORY] " prefix: "[GAME OF THE YEAR] Clair
// Obscur: Expedition 33".
function cleanWinnerTitle(s: string): string {
  return decodeJsonString(s).replace(/^\[[^\]]*\]\s*/, "").trim();
}

// --- Current edition: /nominees/{slug} RSC payload ("allAwards") ---

// Each award object opens with slug + winner array, which ends right before
// "votingIsClosed" (the winner title itself may contain "]" — e.g.
// "[GAME OF THE YEAR] …" — so the array can't be delimited by a bare "]").
// The award name follows, before the nominees array. Quotes appear as \" in
// the payload, so every literal quote in these patterns is \\\".
const AWARD_RE =
  /\\\"slug\\\":\\\"([a-z0-9-]+)\\\",\\\"winner\\\":\[([\s\S]*?)\],\\\"votingIsClosed\\\"/g;

function parseNomineesPage(html: string): TgaAward[] | null {
  const start = html.indexOf("\\\"allAwards\\\":");
  if (start === -1) return null;

  const awards: TgaAward[] = [];
  const seen = new Set<string>();
  for (const m of html.slice(start).matchAll(AWARD_RE)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);

    const tail = html.slice(start + m.index! + m[0].length, start + m.index! + m[0].length + 2000);
    const awardRegion = tail.split("\\\"nominees\\\"")[0];
    const nameMatch = awardRegion.match(/\\\"name\\\":\\\"([^\\]+)\\\",\\\"caption/);
    if (!nameMatch) continue;

    const titleMatch = m[2].match(/\\\"title\\\":\\\"([^\\]+)/);
    awards.push({
      name: decodeJsonString(nameMatch[1]).trim(),
      winner: titleMatch ? cleanWinnerTitle(titleMatch[1]) : null,
    });
  }
  return awards.length > 0 ? awards : null;
}

// --- Past editions: /rewind/year-{N} SSR HTML ---

// Rewind winner cards: <article><h2>category</h2><h3>winner</h3><h4>studio</h4></article>.
// Card copy is lowercase in source (uppercase is CSS); normalize the category
// to Title Case to match the live site's naming.
const LOWER_WORDS = new Set(["and", "of", "in", "the", "for", "a", "an", "or"]);
const UPPER_WORDS = new Map([
  ["rpg", "RPG"],
  ["vr", "VR"],
  ["ar", "AR"],
]);

function titleCaseCategory(s: string): string {
  const words = htmlText(s).toLowerCase().split(/\s+/).filter(Boolean);
  const cased = words.map((word, i) => {
    if (UPPER_WORDS.has(word)) return UPPER_WORDS.get(word)!;
    if (i > 0 && LOWER_WORDS.has(word)) return word;
    return word
      .split("/")
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join("/");
  });
  return cased.join(" ").replace(/\s*\/\s*/g, " / ");
}

function parseRewindPage(html: string): TgaAward[] | null {
  const winnersStart = html.indexOf("history-detail-winners");
  if (winnersStart === -1) return null; // "Error | Rewind" fallback page

  const awards: TgaAward[] = [];
  for (const m of html.slice(winnersStart).matchAll(/<article>([\s\S]*?)<\/article>/g)) {
    const category = m[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const winner = m[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!category || !winner) continue;
    awards.push({
      name: titleCaseCategory(category[1]),
      winner: htmlText(winner[1]) || null,
    });
  }
  return awards.length > 0 ? awards : null;
}

async function fetchRewindWinners(year: number): Promise<TgaAward[] | null> {
  const res = await fetch(`${REWIND_URL}${year}`, { headers: UA });
  if (!res.ok) return null;
  return parseRewindPage(await res.text());
}

async function fetchCurrentWinners(): Promise<TgaAward[]> {
  const res = await fetch(NOMINEES_URL, { headers: UA });
  if (!res.ok) throw new Error(`tga upstream: ${res.status} ${res.url}`);
  const awards = parseNomineesPage(await res.text());
  if (!awards) throw new Error("tga upstream: allAwards not found in nominees page");
  return awards;
}

export async function fetchTga(year: number): Promise<{ edition: number; awards: TgaAward[] }> {
  const nowYear = new Date().getUTCFullYear();
  if (year < TGA_START || year > nowYear) {
    throw new Error(`tga: no ceremony for year ${year} (available: ${TGA_START}-${nowYear})`);
  }

  const archived = await fetchRewindWinners(year);
  if (archived) return { edition: year - TGA_START + 1, awards: archived };

  // Not archived (or an Error page): only the current edition — the one right
  // after the latest archive — can be served from the live nominees page.
  let latestArchived = 0;
  for (let y = year - 1; y >= year - ARCHIVE_PROBE_WINDOW && y >= TGA_START; y--) {
    if (await fetchRewindWinners(y)) {
      latestArchived = y;
      break;
    }
  }
  if (latestArchived === 0 || latestArchived + 1 !== year) {
    throw new Error(`tga: no data for year ${year}`);
  }
  return { edition: year - TGA_START + 1, awards: await fetchCurrentWinners() };
}
