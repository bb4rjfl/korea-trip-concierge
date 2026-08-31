/**
 * The fixed English chrome our own cards print — "Map:", "Current Korea time",
 * "Open now" — translated deterministically.
 *
 * The LLM pass skips a body that already reads as mostly Japanese or Chinese,
 * which is exactly what a card built from Japanese tourism data looks like: the
 * content is localized and only our labels are not. Those labels are a closed set
 * we wrote ourselves, so translating them by table is both free and always right,
 * and it leaves the language model to handle the prose it is actually needed for.
 */

import type { Lang } from "./router.js";

type Target = Exclude<Lang, "en">;

/** Ordered longest-first at build time so "Opening hours" wins over "hours". */
const LABELS: [RegExp, Record<Target, string>][] = (
  [
    ["Current Korea time", { ko: "현재 한국 시각", ja: "現在の韓国時間", zh: "韩国当前时间" }],
    ["live local search", { ko: "실시간 현지 검색", ja: "現地リアルタイム検索", zh: "实时本地搜索" }],
    ["from Korea Tourism data", { ko: "한국관광공사 데이터", ja: "韓国観光公社データ", zh: "韩国观光公社数据" }],
    ["official Seoul Tourism", { ko: "서울시 공식 관광정보", ja: "ソウル市公式観光情報", zh: "首尔市官方旅游信息" }],
    ["Seoul ideas for", { ko: "서울 추천 —", ja: "ソウルのおすすめ —", zh: "首尔推荐 —" }],
    ["Places to go", { ko: "가볼 만한 곳", ja: "行ってみたい場所", zh: "值得去的地方" }],
    ["Seoul ideas", { ko: "서울 추천", ja: "ソウルのおすすめ", zh: "首尔推荐" }],
    ["Places for", { ko: "장소 —", ja: "スポット —", zh: "地点 —" }],
    ["Top spots", { ko: "주요 명소", ja: "主なスポット", zh: "主要景点" }],
    ["What's on", { ko: "지금 열리는 것", ja: "開催中", zh: "近期活动" }],
    ["Worth knowing", { ko: "알아두면 좋은 점", ja: "知っておくと良いこと", zh: "值得注意" }],
    ["Opening hours", { ko: "영업시간", ja: "営業時間", zh: "营业时间" }],
    ["Getting there", { ko: "가는 길", ja: "行き方", zh: "怎么去" }],
    ["Directions", { ko: "길찾기", ja: "ルート案内", zh: "路线" }],
    ["Weather warnings in effect", { ko: "기상특보 발효 중", ja: "気象警報発表中", zh: "气象警报生效中" }],
    ["Air quality", { ko: "대기질", ja: "大気の質", zh: "空气质量" }],
    ["Open now", { ko: "지금 영업 중", ja: "現在営業中", zh: "现在营业中" }],
    ["Closed now", { ko: "지금 영업 종료", ja: "現在休業中", zh: "现在已打烊" }],
    ["right now", { ko: "지금", ja: "今の状況", zh: "此刻" }],
    ["Tomorrow", { ko: "내일", ja: "明日", zh: "明天" }],
    ["Hours", { ko: "영업시간", ja: "営業時間", zh: "营业时间" }],
    ["Map", { ko: "지도", ja: "地図", zh: "地图" }],
    ["Exit", { ko: "출구", ja: "出口", zh: "出口" }],
    ["stops", { ko: "개 역", ja: "駅", zh: "站" }],
    ["no transfers", { ko: "환승 없음", ja: "乗り換えなし", zh: "无需换乘" }],
    ["Station", { ko: "역", ja: "駅", zh: "站" }],
    ["transfer", { ko: "환승", ja: "乗り換え", zh: "换乘" }],
    ["transfers", { ko: "환승", ja: "乗り換え", zh: "换乘" }],
    ["min", { ko: "분", ja: "分", zh: "分钟" }],
    ["Kakao Map", { ko: "카카오맵", ja: "カカオマップ", zh: "Kakao地图" }],
    ["Naver Map", { ko: "네이버 지도", ja: "NAVERマップ", zh: "Naver地图" }],
  ] as [string, Record<Target, string>][]
)
  .sort((a, b) => b[0].length - a[0].length)
  // Markdown italics wrap labels in underscores, and `\b` does not fire between
  // `_` and a letter because `_` is a word character — so `_live local search_`
  // slipped through untranslated. Bound on "not a letter or digit" instead.
  .map(([en, tr]) => {
    const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"), tr] as [
      RegExp,
      Record<Target, string>,
    ];
  });

/** Weekday abbreviations we print next to Korea time, e.g. "Sun 19:07 KST". */
const WEEKDAYS: Record<string, Record<Target, string>> = {
  Mon: { ko: "월", ja: "月", zh: "周一" },
  Tue: { ko: "화", ja: "火", zh: "周二" },
  Wed: { ko: "수", ja: "水", zh: "周三" },
  Thu: { ko: "목", ja: "木", zh: "周四" },
  Fri: { ko: "금", ja: "金", zh: "周五" },
  Sat: { ko: "토", ja: "土", zh: "周六" },
  Sun: { ko: "일", ja: "日", zh: "周日" },
};

/**
 * Replace our own English chrome with the target language, leaving everything
 * else — place names, links, live data — untouched.
 */
export function localizeLabels(text: string, lang: Lang): string {
  if (lang === "en" || !text) return text;
  const target = lang as Target;
  let out = text;

  // "Sun 19:07 KST" → "일 19:07 KST": the day name is the only English left in it.
  out = out.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b(?=\s+\d{1,2}:\d{2})/g, (d) => WEEKDAYS[d][target]);

  // "about **25 min**" → "약 **25 분**"; the bare word in prose is left alone.
  const APPROX: Record<Target, string> = { ko: "약", ja: "約", zh: "约" };
  out = out.replace(/\babout\b(?=\s+\**\d)/g, APPROX[target]);

  for (const [re, tr] of LABELS) out = out.replace(re, tr[target]);
  return out;
}

/**
 * Our zh strings are written in Simplified; this converts the handful of
 * characters they use for a reader who wrote to us in Traditional. It is not a
 * general converter and does not need to be — the vocabulary is ours.
 */
const TO_TRADITIONAL: Record<string, string> = {
  // places and directions
  韩: "韓", 国: "國", 尔: "爾", 区: "區", 汉: "漢", 济: "濟", 岛: "島",
  车: "車", 铁: "鐵", 线: "線", 换: "換", 乘: "乘", 转: "轉",
  过: "過", 达: "達", 进: "進", 边: "邊", 内: "內", 处: "處",
  远: "遠", 东: "東", 门: "門", 关: "關", 开: "開", 闭: "閉",
  // time and weather
  时: "時", 间: "間", 现: "現", 当: "當", 钟: "鐘", 约: "約", 后: "後",
  气: "氣", 云: "雲", 阴: "陰", 阳: "陽", 温: "溫", 风: "風", 雾: "霧",
  质: "質", 报: "報", 预: "預", 备: "備", 应: "應", 该: "該", 会: "會",
  // shops, food, money
  营: "營", 业: "業", 铺: "鋪", 馆: "館", 厅: "廳", 饭: "飯", 饺: "餃",
  汤: "湯", 鸡: "雞", 鱼: "魚", 虾: "蝦", 猪: "豬",
  锅: "鍋", 烧: "燒", 卖: "賣", 买: "買", 钱: "錢", 价: "價", 费: "費",
  币: "幣", 银: "銀", 单: "單", 点: "點", 尝: "嘗", 饮: "飲",
  // service words
  无: "無", 须: "須", 图: "圖", 说: "說", 请: "請", 问: "問", 题: "題",
  语: "語", 译: "譯", 学: "學", 乐: "樂", 电: "電", 话: "話", 网: "網",
  这: "這", 个: "個", 来: "來", 们: "們", 么: "麼", 周: "週", 发: "發",
  险: "險", 医: "醫", 药: "藥", 号: "號", 长: "長", 场: "場", 满: "滿",
  验: "驗", 证: "證", 记: "記", 录: "錄", 选: "選", 择: "擇", 项: "項",
  务: "務", 员: "員", 观: "觀", 览: "覽", 游: "遊", 历: "歷", 术: "術",
  艺: "藝", 园: "園", 剧: "劇", 华: "華", 丽: "麗", 传: "傳",
  统: "統", 众: "眾", 体: "體", 别: "別", 样: "樣", 种: "種", 类: "類",
  寻: "尋", 见: "見", 视: "視", 听: "聽", 读: "讀", 写: "寫",
  给: "給", 让: "讓", 从: "從", 对: "對", 还: "還",
  实: "實", 际: "際", 经: "經", 计: "計", 划: "劃", 议: "議",
  数: "數", 组: "組", 结: "結", 简: "簡", 复: "複", 杂: "雜", 难: "難",
  亚: "亞", 岁: "歲", 儿: "兒", 头: "頭", 贵: "貴", 卫: "衛", 兴: "興",
  联: "聯", 属: "屬", 归: "歸", 汇: "匯", 亲: "親", 声: "聲", 灵: "靈",
};

/**
 * Words whose character mapping depends on meaning: 面 is 麵 in noodles and stays
 * 面 in 方面, so it is handled here rather than character by character.
 */
const AMBIGUOUS: [RegExp, string][] = [
  [/面包/g, "麵包"],
  [/面馆/g, "麵館"],
  [/面条/g, "麵條"],
  [/拉面/g, "拉麵"],
];

/** Rewrite Simplified output for a Traditional-script reader. */
export function toTraditional(text: string): string {
  let out = text ?? "";
  for (const [re, w] of AMBIGUOUS) out = out.replace(re, w);
  return out.replace(/[一-鿿]/g, (c) => TO_TRADITIONAL[c] ?? c);
}
