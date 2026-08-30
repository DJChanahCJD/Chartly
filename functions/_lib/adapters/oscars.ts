// Oscars (Academy Awards) adapter.
// oscars.org sits behind Akamai, which blocks Cloudflare Workers egress at
// the TLS-fingerprint level regardless of request headers, so the data is
// scraped from Wikipedia instead: the "{Nth} Academy Awards" article (1st–
// latest, one per ceremony; ceremony number = year - 1928). The rendered
// Parsoid HTML from the REST API is parsed, which workers can reach.
//
// Article layout (stable across all ceremonies): a "Winners and nominees"
// section with one "Award category" block per category — a highlighted
// category-name div followed by a list whose first item is the winner
// (boldface, marked with ‡) and whose remaining items are the nominees.
// Items read "Person – Film", "Film – People, producers" or
// '"Song" from Film – Music and lyrics by A, B'; the work is always the
// italicized title, which is how { name, work } is separated.

export interface OscarHonoree {
  name: string;
  work: string;
}

export interface OscarAward {
  name: string;
  winner: OscarHonoree | null;
  nominees: OscarHonoree[];
}

// Per Wikimedia's User-Agent policy the client identifies itself.
const UA = { "User-Agent": "Chartly/0.1 (public awards API; contact: github.com/djchan)" };

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

const CREDIT_BY =
  /(?:music\s+(?:and\s+)?lyrics?|music|lyrics?|words(?:\s+and\s+music)?|song|story|screenplay|written)\s+by\s*/gi;

// Convert one award item to text, keeping only the first italic run (the
// work) in place behind markers so the name/work split survives tag
// stripping. Reference superscripts and nested spans (entity spaces,
// interwiki bracket notes) are dropped; "Person – Work as Role",
// "Work – People, producers" and '"Song" from Work – Music and lyrics by
// People' all reduce to bare comma-separated names.
function liParts(segment: string): { name: string; work: string } {
  let s = segment
    .replace(/<sup\b[\s\S]*?<\/sup>/g, "")
    .replace(/<abbr\b[\s\S]*?<\/abbr>/g, "")
    .replace(/<small\b[\s\S]*?<\/small>/g, "")
    .replace(/<style\b[\s\S]*?<\/style>/g, "")
    // dash-only spans render the – separator from {{ndash}}; keep it,
    // whitespace-only entity spans become plain spaces
    .replace(/<span\b[^>]*>\s*[–—]\s*<\/span>/g, "–")
    .replace(/<span\b[^>]*>\s+<\/span>/g, " ");
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/<span\b[^>]*>(?:(?!<span\b|<\/span>)[\s\S])*<\/span>/g, "");
  }

  const italic = s.match(/<i\b[^>]*>([\s\S]*?)<\/i>/);
  const work = italic ? decodeEntities(italic[1].replace(/<[^>]+>/g, "")).replace(/^[–—,;:\s]+/, "") : "";
  if (italic) s = s.replace(italic[0], "\u0000" + work + "\u0000");

  let name = decodeEntities(s.replace(/<[^>]+>/g, " "));
  name = name
    .replace(/\((?:posthumous(?:ly)?|posth\.?|co-?winner)\)/gi, "")
    .replace(/[‡†*]/g, "");

  name = name
    .split(/\s*[–—]\s*/)
    .filter((seg) => !seg.includes("\u0000"))
    .join(" – ")
    .replace(/\u0000/g, "");

  // "Film – A and B, producers" / "Music by A; Lyrics by B" → people only.
  name = name
    .replace(/\s*;\s*/g, ", ")
    .replace(CREDIT_BY, ", ")
    .replace(/,\s*(?:co-)?(?:executive\s+)?(?:producers?|directors?)\s*$/i, "")
    .replace(/\s+and\s+/gi, ", ")
    .replace(/\s*&\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/^[–—,;\s]+/, "")
    .replace(/[\s,]+$/, "");

  name = [...new Set(name.split(", "))].join(", ");
  if (!name && work) return { name: work, work: "" };
  return { name, work };
}

// The winner is the first bold list item; everything else — nested or
// sibling items — is a nominee. Multiple bold items are ties/co-winners.
function parseCategory(block: string): OscarAward | null {
  const nameDiv = block.match(/<div[^>]*background-color:[^>]*>([\s\S]*?)<\/div>/);
  if (!nameDiv) return null;
  const name = decodeEntities(nameDiv[1].replace(/<[^>]+>/g, " "));
  if (!name) return null;

  const lis: { start: number; depth: number }[] = [];
  let depth = 0;
  for (const m of block.matchAll(/<ul\b[^>]*>|<\/ul>|<li\b[^>]*>/g)) {
    if (m[0].startsWith("<ul")) depth++;
    else if (m[0].startsWith("</ul")) depth--;
    else lis.push({ start: m.index!, depth });
  }

  const segments = lis.map((li, i) => ({
    html: block.slice(li.start, i + 1 < lis.length ? lis[i + 1].start : block.length),
    depth: li.depth,
  }));
  const topLevel = segments.filter((seg) => seg.depth === 1);
  // Winners are the bold top-level items; a list without boldface (rare
  // formatting) falls back to its first item.
  const winners = topLevel.filter((seg) => /<b[\s>]/.test(seg.html));
  const winnerSegs = winners.length ? winners : topLevel.slice(0, 1);
  const rest = segments.filter(
    (seg) => seg.depth === 2 || (seg.depth === 1 && !winnerSegs.includes(seg)),
  );
  const honoree = (seg: { html: string }) => {
    const part = liParts(seg.html);
    return part.name || part.work ? part : null;
  };
  const winnerHonorees = winnerSegs
    .map(honoree)
    .filter((h): h is OscarHonoree => h !== null);
  const nominees = rest.map(honoree).filter((h): h is OscarHonoree => h !== null);

  const merged = winnerHonorees.length
    ? {
        name: [...new Set(winnerHonorees.map((w) => w.name))].filter(Boolean).join(", "),
        work: [...new Set(winnerHonorees.map((w) => w.work))].filter(Boolean).join(" / "),
      }
    : null;

  return { name, winner: merged && merged.name ? merged : null, nominees };
}

function parseArticle(html: string): OscarAward[] {
  const start = html.indexOf('id="Winners_and_nominees"');
  if (start === -1) throw new Error("oscars upstream: winners section not found");
  const rest = html.slice(start);
  const nextH2 = rest.slice(1).search(/<h2\b/);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 1);

  // Category blocks are anchored on the highlighted name divs; headings and
  // table headers end a block so prose sections in between are not absorbed.
  const starts = [
    ...section.matchAll(
      /<div[^>]*background-color:#F9EFAA[^>]*>|<h[1-6]\b[^>]*>|<th\b[^>]*>/g,
    ),
  ];
  if (!starts.some((m) => m[0].startsWith("<div"))) {
    throw new Error("oscars upstream: no award categories found");
  }

  const awards: OscarAward[] = [];
  for (let i = 0; i < starts.length; i++) {
    if (!starts[i][0].startsWith("<div")) continue;
    const end = i + 1 < starts.length ? starts[i + 1].index! : section.length;
    const award = parseCategory(section.slice(starts[i].index!, end));
    if (award) awards.push(award);
  }
  if (awards.length === 0) throw new Error("oscars upstream: winners list empty");
  return awards;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export async function fetchOscars(year: number): Promise<{ year: number; awards: OscarAward[] }> {
  const latest = new Date().getUTCFullYear();
  const number = year - 1928;
  if (number < 1 || year > latest) {
    throw new Error(`oscars: no ceremony for year ${year} (available: 1929-${latest})`);
  }

  const title = `${ordinal(number)} Academy Awards`;
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`,
    { headers: UA, redirect: "follow" },
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error(`oscars: no ceremony page for year ${year}`);
    throw new Error(`oscars upstream: ${res.status} from Wikipedia`);
  }

  const awards = parseArticle(await res.text());
  return { year, awards };
}
