// Shared types for the GMA (金曲奖) per-edition static data files.

export interface GmaCategory {
  /** 奖项名称（简体中文） */
  name: string;
  /** 得奖者（人 / 团体）；官方记录为唱片公司且查不到人名时为公司名 */
  winner: string;
  /** 得奖作品（专辑 / 歌曲名），无作品类奖项时省略 */
  title?: string;
}

export interface GmaEditionData {
  /** 届次，第 1 届 = 1 */
  edition: number;
  /** 颁奖年份（颁奖典礼所在年份） */
  year: number;
  categories: GmaCategory[];
}
