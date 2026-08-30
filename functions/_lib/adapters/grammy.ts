// Grammy awards adapter.
// Scrapes the ceremony page on grammy.com (WordPress-rendered HTML).
// Each category accordion contains nomination cards; the winner card is the
// one with the `bg-primary-100` class. `https://www.grammy.com/awards/{year}`
// 301-redirects to the matching ceremony page.

interface Nomination {
  work: string;
  artists: string;
}

interface Category {
  name: string;
  winner: string | null;
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

function parseCard(card: string): Nomination {
  const title = card.match(/data-no-translation>\s*([^<]+?)\s*<\/p>/);
  const artistsP = card.match(/<p class="fs-7[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const artists = artistsP ? decodeEntities(artistsP[1].replace(/<[^>]+>/g, "")) : "";
  return {
    work: title ? decodeEntities(title[1]) : "",
    artists,
  };
}

function parseCeremonyPage(html: string, year: number) {
  // Category segments are bounded by the accordion header pattern.
  const catStarts = [
    ...html.matchAll(/data-no-translation>([^<]+)<\/span>\s*<span class="btn/g),
  ];
  if (catStarts.length === 0) throw new Error("grammy upstream: no categories found");

  const categories: Category[] = [];
  for (let i = 0; i < catStarts.length; i++) {
    const start = catStarts[i].index! + catStarts[i][0].length;
    const end = i + 1 < catStarts.length ? catStarts[i + 1].index! : html.length;
    const seg = html.slice(start, end);

    const cardStarts = [...seg.matchAll(/nomination-card/g)];
    const nominees: Nomination[] = [];
    let winner: string | null = null;

    for (let j = 0; j < cardStarts.length; j++) {
      const cs = seg.lastIndexOf("<div", cardStarts[j].index!);
      const ce = j + 1 < cardStarts.length ? seg.lastIndexOf("<div", cardStarts[j + 1].index!) : seg.length;
      const card = seg.slice(cs, ce);
      const isWinner = /p-1 bg-primary-100 border/.test(card.slice(0, 200));
      const nom = parseCard(card);
      if (!nom.work && !nom.artists) continue;
      nominees.push(nom);
      if (isWinner) winner = `${nom.work ? nom.work : ""}${nom.work && nom.artists ? " — " : ""}${nom.artists}`;
    }

    categories.push({
      name: decodeEntities(catStarts[i][1]),
      winner,
      nominees: nominees.map((n) => `${n.work ? n.work : ""}${n.work && n.artists ? " — " : ""}${n.artists}`),
    });
  }

  return { source: "grammy" as const, year, categories };
}

export async function fetchGrammy(year: number) {
  // grammy.com slugs use eligibility year; the latest ceremony may sit under a
  // different year than requested, so fall back to year-1.
  let res: Response | null = null;
  let pageYear = year;
  for (const y of [year, year - 1]) {
    const r = await fetch(`https://www.grammy.com/awards/${y}`, {
      headers: UA,
      redirect: "follow",
    });
    if (r.ok) {
      res = r;
      pageYear = y;
      break;
    }
  }
  if (!res) throw new Error(`grammy upstream: no ceremony page for ${year}`);

  const data = parseCeremonyPage(await res!.text(), pageYear);
  // Prefer the exact year from the final ceremony slug if present.
  const slugYear = res!.url.match(/grammy-awards-(\d{4})/);
  if (slugYear) data.year = Number(slugYear[1]);
  return data;
}
