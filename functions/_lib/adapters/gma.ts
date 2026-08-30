// GMA (金曲奖 / Golden Melody Awards) adapter.
// 官方无稳定公开接口，采用内置静态数据：第 1-35 届来自文化部影视及流行音乐产业局
// 官方开放数据（bamid.gov.tw），第 36-37 届来自百度百科词条。
// 仅收录得奖者（winner-only），结构为 { name, winner, title? }。

import type { GmaEditionData } from "./gma/types";
import edition1 from "./gma/edition1";
import edition2 from "./gma/edition2";
import edition3 from "./gma/edition3";
import edition4 from "./gma/edition4";
import edition5 from "./gma/edition5";
import edition6 from "./gma/edition6";
import edition7 from "./gma/edition7";
import edition8 from "./gma/edition8";
import edition9 from "./gma/edition9";
import edition10 from "./gma/edition10";
import edition11 from "./gma/edition11";
import edition12 from "./gma/edition12";
import edition13 from "./gma/edition13";
import edition14 from "./gma/edition14";
import edition15 from "./gma/edition15";
import edition16 from "./gma/edition16";
import edition17 from "./gma/edition17";
import edition18 from "./gma/edition18";
import edition19 from "./gma/edition19";
import edition20 from "./gma/edition20";
import edition21 from "./gma/edition21";
import edition22 from "./gma/edition22";
import edition23 from "./gma/edition23";
import edition24 from "./gma/edition24";
import edition25 from "./gma/edition25";
import edition26 from "./gma/edition26";
import edition27 from "./gma/edition27";
import edition28 from "./gma/edition28";
import edition29 from "./gma/edition29";
import edition30 from "./gma/edition30";
import edition31 from "./gma/edition31";
import edition32 from "./gma/edition32";
import edition33 from "./gma/edition33";
import edition34 from "./gma/edition34";
import edition35 from "./gma/edition35";
import edition36 from "./gma/edition36";
import edition37 from "./gma/edition37";

const EDITIONS: GmaEditionData[] = [
  edition1,
  edition2,
  edition3,
  edition4,
  edition5,
  edition6,
  edition7,
  edition8,
  edition9,
  edition10,
  edition11,
  edition12,
  edition13,
  edition14,
  edition15,
  edition16,
  edition17,
  edition18,
  edition19,
  edition20,
  edition21,
  edition22,
  edition23,
  edition24,
  edition25,
  edition26,
  edition27,
  edition28,
  edition29,
  edition30,
  edition31,
  edition32,
  edition33,
  edition34,
  edition35,
  edition36,
  edition37,
];

// 届次 → 年份（第 1 届于 1990 年颁发）
const GMA_DATA = new Map<number, GmaEditionData>(
  EDITIONS.map((e) => [e.year, e]),
);

export const GMA_YEARS = EDITIONS.map((e) => e.year).sort((a, b) => a - b);

export function fetchGma(year: number): {
  source: "gma";
  year: number;
  edition: number;
  categories: GmaEditionData["categories"];
} {
  const data = GMA_DATA.get(year);
  if (!data) {
    throw new Error(`gma: no data for year ${year} (available: ${GMA_YEARS.join(", ")})`);
  }
  return {
    source: "gma",
    year: data.year,
    edition: data.edition,
    categories: data.categories,
  };
}
