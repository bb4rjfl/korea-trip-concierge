/**
 * Subway lines and stations, named for the reader — on the phone, where the
 * route and the train board are drawn.
 */

import type { Lang } from "./strings.js";

/** The planner's line keys (as Seoul Open Data writes them), in four languages. */
const NAMED: Record<string, Record<Lang, string>> = {
  공항철도: { en: "AREX (Airport Railroad)", ko: "공항철도", ja: "空港鉄道", zh: "机场铁路" },
  신분당선: { en: "Sinbundang Line", ko: "신분당선", ja: "新盆唐線", zh: "新盆唐线" },
  수인분당선: { en: "Suin-Bundang Line", ko: "수인분당선", ja: "水仁・盆唐線", zh: "水仁·盆唐线" },
  경의선: { en: "Gyeongui-Jungang Line", ko: "경의중앙선", ja: "京義・中央線", zh: "京义·中央线" },
  경춘선: { en: "Gyeongchun Line", ko: "경춘선", ja: "京春線", zh: "京春线" },
  경강선: { en: "Gyeonggang Line", ko: "경강선", ja: "京江線", zh: "京江线" },
  서해선: { en: "Seohae Line", ko: "서해선", ja: "西海線", zh: "西海线" },
  인천선: { en: "Incheon Line 1", ko: "인천1호선", ja: "仁川1号線", zh: "仁川1号线" },
  인천2호선: { en: "Incheon Line 2", ko: "인천2호선", ja: "仁川2号線", zh: "仁川2号线" },
  우이신설경전철: { en: "Ui-Sinseol Line", ko: "우이신설선", ja: "牛耳新設線", zh: "牛耳新设线" },
  신림선: { en: "Sillim Line", ko: "신림선", ja: "新林線", zh: "新林线" },
  김포도시철도: { en: "Gimpo Goldline", ko: "김포골드라인", ja: "金浦ゴールドライン", zh: "金浦黄金线" },
  용인경전철: { en: "Everline", ko: "용인에버라인", ja: "龍仁エバーライン", zh: "龙仁爱宝线" },
  의정부경전철: { en: "Uijeongbu LRT", ko: "의정부경전철", ja: "議政府軽電鉄", zh: "议政府轻轨" },
  "GTX-A": { en: "GTX-A", ko: "GTX-A", ja: "GTX-A", zh: "GTX-A" },
};

/** "03호선" → "Line 3" / "3호선" / "3号線" / "3号线"; named lines by their names. */
export function lineName(line: string, lang: Lang): string {
  const m = /^0?(\d+)호선$/.exec(line);
  if (m) {
    const n = Number(m[1]);
    return lang === "en" ? `Line ${n}` : lang === "ko" ? `${n}호선` : lang === "ja" ? `${n}号線` : `${n}号线`;
  }
  return NAMED[line]?.[lang] ?? line;
}

/** The realtime board's line ids, as the planner's line keys. */
const BOARD_LINE: Record<string, string> = {
  "1001": "01호선",
  "1002": "02호선",
  "1003": "03호선",
  "1004": "04호선",
  "1005": "05호선",
  "1006": "06호선",
  "1007": "07호선",
  "1008": "08호선",
  "1009": "09호선",
  "1032": "GTX-A",
  "1063": "경의선",
  "1065": "공항철도",
  "1067": "경춘선",
  "1075": "수인분당선",
  "1077": "신분당선",
  "1081": "경강선",
  "1092": "우이신설경전철",
  "1093": "서해선",
};

export function boardLine(subwayId: string): string | undefined {
  return BOARD_LINE[subwayId];
}

/** A station's names, however the table at hand writes them. */
export interface StationNames {
  k: string;
  e?: string;
  j?: string;
  z?: string;
}

/**
 * A station as the reader reads it, with the Hangul on the sign alongside:
 * "Yangjae (양재)", "ヤンジェ (양재)", "良才 (양재)" — and just "양재" in Korean.
 */
export function stationLabel(s: StationNames, lang: Lang): string {
  const ko = s.k.replace(/역$/, "");
  const own = (lang === "en" ? s.e : lang === "ja" ? s.j : lang === "zh" ? s.z : undefined)
    ?.replace(/\s*[(（].*[)）]\s*$/, "")
    .replace(/\s*(?:station|駅|站)$/i, "")
    .trim();
  if (lang === "ko" || !own || own === ko) return ko;
  return `${own} (${ko})`;
}
