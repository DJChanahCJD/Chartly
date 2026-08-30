// Official oscars.org ceremony pages adapter (separate from the Wikipedia
// route in oscars.ts). URL pattern: https://www.oscars.org/oscars/ceremonies/
// {year}, years 1929 through the current year, one page per ceremony.
//
// oscars.org sits behind Akamai, which may refuse requests coming from
// Cloudflare's egress; if this source starts failing en masse, oscars.ts
// (Wikipedia) remains the fallback.
//
// Each category is a `paragraph--type--award-category` block carrying the
// category name plus a list of `paragraph--type--award-honoree` blocks; every
// honoree is tagged `winner` or `nominee` via the honoree-type class and holds
// an optional film field and one or more entity (person) items. The film and
// entities order swaps between categories, so both are located by field name.

import type { OscarAward } from "./oscars";

// oscars.org sits behind Akamai; plain scripted requests without a
// browser-like header set are refused with 403.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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

// The site concatenates people into one string: producers come as
// "A, B and C, Producers", songwriters as "from Film; Music and Lyric by A, B".
// Reduce both to the bare comma-separated names the API exposes.
function normalizeName(s: string): string {
  let name = decodeEntities(s);
  name = name.replace(/^[“"][^”"]*[”"]\s*/, "");
  name = name.replace(/\s+and\s+/gi, ", ").replace(/\s*&\s*/g, ", ");
  const header = name.match(
    /\b(?:Music|Lyrics?|Words|Song)(?:\s*(?:,|and|&)\s*(?:Music|Lyrics?|Words|Song))*\s+by\s+/i,
  );
  if (header) {
    const parts: string[] = [];
    for (const part of name.slice(header.index).split(";")) {
      const person = part
        .replace(
          /^\s*(?:Music|Lyrics?|Words|Song)(?:\s*(?:,|and|&)\s*(?:Music|Lyrics?|Words|Song))*\s+by\s+/i,
          "",
        )
        .replace(/\s*(?:,|and|&)\s*(?:Music|Lyrics?|Words|Song)\s+by\s+/gi, ", ")
        .trim();
      if (person) parts.push(person);
    }
    name = [...new Set(parts.join(", ").split(", "))].join(", ");
  }
  name = name.replace(/,\s*Producers?\s*$/i, "");
  return name.trim();
}

function parseHonoree(
  segment: string,
): (OscarAward["winner"] & { kind: "winner" | "nominee" }) | null {
  const type = segment.match(/field--name-field-honoree-type\s+(winner|nominee)\b/);
  if (!type) return null;

  const filmIdx = segment.indexOf("field--name-field-award-film");
  const entitiesIdx = segment.indexOf("field--name-field-award-entities");
  if (entitiesIdx === -1) return null;

  const names: string[] = [];
  const entitiesEnd = filmIdx > entitiesIdx ? filmIdx : segment.length;
  for (const m of segment.slice(entitiesIdx, entitiesEnd).matchAll(/field__item">([\s\S]*?)<\/div>/g)) {
    const name = normalizeName(htmlText(m[1]));
    if (name) names.push(name);
  }
  if (names.length === 0) return null;

  let work = "";
  if (filmIdx !== -1) {
    const film = segment
      .slice(filmIdx)
      .match(/field__item">\s*([\s\S]*?)\s*<\/div>/);
    if (film) work = htmlText(film[1]);
  }
  return { kind: type[1] as "winner" | "nominee", name: names.join(", "), work };
}

function parseCeremonyPage(html: string): OscarAward[] {
  const starts = [
    ...html.matchAll(/data-term-id="\d+" class="paragraph paragraph--type--award-category/g),
  ];
  if (starts.length === 0) throw new Error("oscars-org upstream: no award categories found");

  const awards: OscarAward[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index! + starts[i][0].length;
    const end = i + 1 < starts.length ? starts[i + 1].index! : html.length;
    const seg = html.slice(start, end);

    const nameMatch = seg.match(
      /field--name-field-award-category-oscars[^>]*field__item">\s*([^<]+?)\s*</,
    );
    if (!nameMatch) continue;
    const name = decodeEntities(nameMatch[1]);

    const winners: { name: string; work: string }[] = [];
    const nominees: { name: string; work: string }[] = [];
    const honoreeStarts = [...seg.matchAll(/paragraph--type--award-honoree/g)];
    for (let j = 0; j < honoreeStarts.length; j++) {
      const hs = honoreeStarts[j].index! + honoreeStarts[j][0].length;
      const he = j + 1 < honoreeStarts.length ? honoreeStarts[j + 1].index! : seg.length;
      const honoree = parseHonoree(seg.slice(hs, he));
      if (!honoree) continue;
      const { kind, ...rest } = honoree;
      if (kind === "winner") winners.push(rest);
      else nominees.push(rest);
    }

    // Early ceremonies list a person under several winner blocks (one per
    // film) and ties produce winners with different names — collapse them.
    const winner = winners.length
      ? {
          name: [...new Set(winners.map((w) => w.name))].join(", "),
          work: [...new Set(winners.map((w) => w.work).filter(Boolean))].join(" / "),
        }
      : null;

    awards.push({ name, winner, nominees });
  }
  return awards;
}

export async function fetchOscarsOrg(
  year: number,
): Promise<{ edition: number; url: string; awards: OscarAward[] }> {
  const latest = new Date().getUTCFullYear();
  const edition = year - 1928;
  if (edition < 1 || year > latest) {
    throw new Error(`oscars-org: no ceremony for year ${year} (available: 1929-${latest})`);
  }

  const url = `https://www.oscars.org/oscars/ceremonies/${year}`;
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`oscars-org: no ceremony page for year ${year}`);
    throw new Error(`oscars-org upstream: ${res.status} from oscars.org`);
  }

  const awards = parseCeremonyPage(await res.text());
  return { edition, url, awards };
}
