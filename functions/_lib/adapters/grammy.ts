// Grammy awards adapter.
// Scrapes the ceremony page on grammy.com (WordPress-rendered HTML), which
// contains a full winners table (<tbody id="nominationsTableBody">) with one row
// per category: Category | Winner | Title. The top categories additionally
// have accordion sections with full nominee lists — those are merged in.
//
// Ceremony URL patterns:
//   1st–59th:  /awards/{ordinal}-annual-grammy-awards/
//   60th+:     /awards/{ordinal}-annual-grammy-awards-{year-1}/
// where the slug year is the year before the ceremony (eligibility year).
// The API takes the CEREMONY year: ordinal = year - 1958.

interface Category {
  name: string;
  winner: string | null;
  title: string | null;
  nominees: string[];
}

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "));
}

function parseWinnersTable(html: string): Category[] {
  const tbody = html.match(/<tbody id="nominationsTableBody">([\s\S]*?)<\/tbody>/);
  if (!tbody) throw new Error("grammy upstream: winners table not found");

  const categories: Category[] = [];
  for (const tr of tbody[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 3) continue;
    const name = htmlText(tds[0]);
    if (!name) continue;
    const winner = htmlText(tds[1]) || null;
    const title = htmlText(tds[2]) || null;
    categories.push({ name, winner, title, nominees: [] });
  }
  if (categories.length === 0) throw new Error("grammy upstream: winners table empty");
  return categories;
}

// The ceremony page also renders the top categories as nomination-card
// accordions with full nominee lists. Extract them for merging.
function parseAccordionNominees(html: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const catStarts = [
    ...html.matchAll(/data-no-translation>([^<]+)<\/span>\s*<span class="btn/g),
  ];
  for (let i = 0; i < catStarts.length; i++) {
    const start = catStarts[i].index! + catStarts[i][0].length;
    const end = i + 1 < catStarts.length ? catStarts[i + 1].index! : html.length;
    const seg = html.slice(start, end);

    const cardStarts = [...seg.matchAll(/nomination-card/g)];
    const nominees: string[] = [];
    for (let j = 0; j < cardStarts.length; j++) {
      const cs = seg.lastIndexOf("<div", cardStarts[j].index!);
      const ce =
        j + 1 < cardStarts.length ? seg.lastIndexOf("<div", cardStarts[j + 1].index!) : seg.length;
      const card = seg.slice(cs, ce);
      const title = card.match(/data-no-translation>\s*([^<]+?)\s*<\/p>/);
      const artistsP = card.match(/<p class="fs-7[^"]*"[^>]*>([\s\S]*?)<\/p>/);
      const artists = artistsP ? htmlText(artistsP[1]) : "";
      const work = title ? decodeEntities(title[1]) : "";
      const label = `${work ? work : ""}${work && artists ? " — " : ""}${artists}`;
      if (label) nominees.push(label);
    }
    if (nominees.length > 0) map.set(decodeEntities(catStarts[i][1]).toLowerCase(), nominees);
  }
  return map;
}

function parseCeremonyPage(html: string, pageUrl: string) {
  const categories = parseWinnersTable(html);
  const accordion = parseAccordionNominees(html);
  for (const cat of categories) {
    const nominees = accordion.get(cat.name.toLowerCase());
    if (nominees) cat.nominees = nominees;
  }
  return { url: pageUrl, categories };
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

function ceremonyUrls(year: number): string[] {
  const ordinal_ = year - 1958;
  if (ordinal_ < 1) return [];
  const base = `${ordinal(ordinal_)}-annual-grammy-awards`;
  if (ordinal_ < 60) return [`https://www.grammy.com/awards/${base}/`];
  // From the 60th on the slug carries the year before the ceremony.
  return [
    `https://www.grammy.com/awards/${base}-${year - 1}/`,
    `https://www.grammy.com/awards/${base}-${year}/`,
  ];
}

export async function fetchGrammy(year: number) {
  if (year < 1959 || year > new Date().getUTCFullYear()) {
    throw new Error(`grammy: no ceremony for year ${year}`);
  }

  let html: string | null = null;
  let finalUrl = "";
  const attempts: string[] = [];
  for (const url of ceremonyUrls(year)) {
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    if (res.ok) {
      html = await res.text();
      finalUrl = res.url;
      break;
    }
    attempts.push(`${res.status} ${url}`);
  }
  if (!html) throw new Error(`grammy upstream: no ceremony page for ${year} (${attempts.join("; ")})`);

  return parseCeremonyPage(html, finalUrl);
}
