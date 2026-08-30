// Nobel Prize adapter.
// Proxies the official Nobel Prize API v2.1 (no key required), one request per
// year: ?nobelPrizeYear={year}&limit=100 — every year has at most six prizes
// so a single page always suffices. Cleaned to the minimal Chartly schema:
// category name + laureate name/motivation only. Years where a prize was not
// awarded (e.g. 1940-1942) come back without a `laureates` array and are
// dropped; a year with nothing awarded at all yields an empty categories list.

const API = "https://api.nobelprize.org/2.1/nobelPrizes";

interface Localized {
  en?: string;
}

interface UpstreamLaureate {
  knownName?: Localized;
  orgName?: Localized;
  fullName?: Localized;
  motivation?: Localized;
}

interface UpstreamPrize {
  category?: Localized;
  laureates?: UpstreamLaureate[];
}

export interface NobelLaureate {
  name: string;
  motivation: string;
}

export interface NobelCategory {
  name: string;
  laureates: NobelLaureate[];
}

function laureateName(l: UpstreamLaureate): string {
  return l.knownName?.en ?? l.orgName?.en ?? l.fullName?.en ?? "";
}

export async function fetchNobel(year: number): Promise<{ categories: NobelCategory[] }> {
  const currentYear = new Date().getUTCFullYear();
  if (year < 1901 || year > currentYear) {
    throw new Error(`nobel: no prizes for year ${year} (available: 1901-${currentYear})`);
  }

  const res = await fetch(`${API}?nobelPrizeYear=${year}&limit=100`);
  if (!res.ok) throw new Error(`nobel upstream: ${res.status} ${res.url}`);

  const data = (await res.json()) as { nobelPrizes?: UpstreamPrize[] };
  const categories = (data.nobelPrizes ?? [])
    .filter((p) => p.category?.en && (p.laureates?.length ?? 0) > 0)
    .map((p) => ({
      name: p.category!.en!,
      laureates: p.laureates!.map((l) => ({
        name: laureateName(l),
        motivation: l.motivation?.en ?? "",
      })),
    }));
  return { categories };
}
