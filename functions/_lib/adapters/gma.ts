// GMA (金曲奖 / Golden Melody Awards) adapter.
// No stable public API exists, so v1 ships curated static data per year.
// Data below is seed data for structure verification; extend per year.
// Replace with a real scraper later without changing the response shape.

interface Category {
  name: string;
  winner: string | null;
  nominees: string[];
}

const GMA_DATA: Record<number, { edition: number; categories: Category[] }> = {
  2026: {
    edition: 37,
    categories: [
      {
        name: "年度專輯獎 Album of the Year",
        winner: null,
        nominees: ["Sample Album A", "Sample Album B", "Sample Album C", "Sample Album D", "Sample Album E"],
      },
      {
        name: "年度歌曲獎 Song of the Year",
        winner: null,
        nominees: ["Sample Song A", "Sample Song B", "Sample Song C"],
      },
      {
        name: "最佳華語專輯獎 Best Mandarin Album",
        winner: null,
        nominees: ["Sample Mandarin Album A", "Sample Mandarin Album B", "Sample Mandarin Album C"],
      },
      {
        name: "最佳華語男歌手獎 Best Mandarin Male Singer",
        winner: null,
        nominees: ["Sample Male Singer A", "Sample Male Singer B", "Sample Male Singer C"],
      },
      {
        name: "最佳華語女歌手獎 Best Mandarin Female Singer",
        winner: null,
        nominees: ["Sample Female Singer A", "Sample Female Singer B", "Sample Female Singer C"],
      },
      {
        name: "最佳新人獎 Best New Artist",
        winner: null,
        nominees: ["Sample New Artist A", "Sample New Artist B", "Sample New Artist C"],
      },
    ],
  },
};

export const GMA_YEARS = Object.keys(GMA_DATA).map(Number);

export function fetchGma(year: number): {
  source: "gma";
  year: number;
  edition: number | null;
  note: string;
  categories: Category[];
} {
  const data = GMA_DATA[year];
  if (!data) {
    throw new Error(`gma: no data for year ${year} (available: ${GMA_YEARS.join(", ")})`);
  }
  return {
    source: "gma",
    year,
    edition: data.edition,
    note: "Static seed data; winners pending curation.",
    categories: data.categories,
  };
}
