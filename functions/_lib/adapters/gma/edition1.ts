// 第1届台湾金曲奖（1990年）获奖名单。资料来源：文化部影视及流行音乐产业局官方开放数据，得奖者人名参考百度百科补全。
import type { GmaEditionData } from "./types";

const edition1: GmaEditionData = {
  edition: 1,
  year: 1990,
  date: "1990-01-06",
  categories: [
    { name: "最佳年度歌曲奖", winner: "潘美辰", title: "我想有个家" },
    { name: "最佳作词人奖", winner: "张景洲", title: "针线情" },
    { name: "最佳作曲人奖", winner: "城振铭", title: "说起往事" },
    { name: "最佳编曲人奖", winner: "陈扬", title: "爱到最高点" },
    { name: "最佳单曲歌唱录影带影片奖", winner: "蓝与白", title: "老么的故事" },
    { name: "最佳单曲歌唱录影带导演奖", winner: "张达隆", title: "老么的故事" },
    { name: "最佳男演唱人奖", winner: "殷正洋" },
    { name: "最佳女演唱人奖", winner: "江淑惠（江蕙）" },
    { name: "最佳演唱组奖", winner: "知己二重唱（曾宝明、吴志华）" },
    { name: "新人奖", winner: "伍思凯" },
    { name: "特别奖", winner: "陈达儒、庄奴" },
  ],
};

export default edition1;
