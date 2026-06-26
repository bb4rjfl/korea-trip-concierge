/**
 * Korean→English romanization for Seoul subway/place names, so an English-first
 * product never shows raw Hangul a foreign visitor can't read (review item U1).
 *
 * Coverage is a curated set of major / transfer / tourist stations. Unknown
 * names fall back to the original Korean (never breaks). One canonical list
 * drives both directions: EN/alias→KO (input resolution) and KO→EN (display).
 */

import { resolveName, type Resolution } from "./fuzzy.js";

export interface StationPair {
  ko: string;
  en: string;
  aliases?: string[]; // extra English/colloquial inputs
}

// Curated Seoul Metro stations (lines 1–9 + key transfers/tourist stops).
const STATIONS: StationPair[] = [
  { ko: "강남", en: "Gangnam" },
  { ko: "역삼", en: "Yeoksam" },
  { ko: "선릉", en: "Seolleung" },
  { ko: "삼성", en: "Samseong", aliases: ["coex"] },
  { ko: "잠실", en: "Jamsil" },
  { ko: "잠실새내", en: "Jamsillaenae" },
  { ko: "종합운동장", en: "Sports Complex" },
  { ko: "건대입구", en: "Konkuk Univ.", aliases: ["konkuk", "konkuk university"] },
  { ko: "성수", en: "Seongsu" },
  { ko: "뚝섬", en: "Ttukseom" },
  { ko: "왕십리", en: "Wangsimni" },
  { ko: "신촌", en: "Sinchon" },
  { ko: "이대", en: "Ewha Womans Univ.", aliases: ["ewha"] },
  { ko: "홍대입구", en: "Hongik Univ.", aliases: ["hongdae", "hongik", "hongik university"] },
  { ko: "합정", en: "Hapjeong" },
  { ko: "당산", en: "Dangsan" },
  { ko: "신도림", en: "Sindorim" },
  { ko: "사당", en: "Sadang" },
  { ko: "교대", en: "Seoul Nat'l Univ. of Education", aliases: ["gyodae"] },
  { ko: "서울대입구", en: "Seoul Nat'l Univ.", aliases: ["snu", "seoul national university"] },
  { ko: "서초", en: "Seocho" },
  { ko: "방배", en: "Bangbae" },
  { ko: "낙성대", en: "Nakseongdae" },
  { ko: "봉천", en: "Bongcheon" },
  { ko: "신림", en: "Sillim" },
  { ko: "신대방", en: "Sindaebang" },
  { ko: "구로디지털단지", en: "Guro Digital Complex", aliases: ["guro digital"] },
  { ko: "대림", en: "Daerim" },
  { ko: "문래", en: "Mullae" },
  { ko: "잠실나루", en: "Jamsillaru" },
  { ko: "강동", en: "Gangdong" },
  { ko: "천호", en: "Cheonho" },
  { ko: "약수", en: "Yaksu" },
  { ko: "금호", en: "Geumho" },
  { ko: "시청", en: "City Hall" },
  { ko: "을지로입구", en: "Euljiro 1-ga", aliases: ["euljiro"] },
  { ko: "을지로3가", en: "Euljiro 3-ga" },
  { ko: "동대문역사문화공원", en: "Dongdaemun History & Culture Park", aliases: ["ddp"] },
  { ko: "동대문", en: "Dongdaemun" },
  { ko: "종로3가", en: "Jongno 3-ga" },
  { ko: "종각", en: "Jonggak" },
  { ko: "서울역", en: "Seoul Station" },
  { ko: "서울", en: "Seoul Station", aliases: ["seoul station"] },
  { ko: "용산", en: "Yongsan" },
  { ko: "청량리", en: "Cheongnyangni" },
  { ko: "신설동", en: "Sinseol-dong" },
  { ko: "명동", en: "Myeongdong" },
  { ko: "충무로", en: "Chungmuro" },
  { ko: "광화문", en: "Gwanghwamun" },
  { ko: "경복궁", en: "Gyeongbokgung" },
  { ko: "안국", en: "Anguk", aliases: ["insadong"] },
  { ko: "혜화", en: "Hyehwa" },
  { ko: "동대입구", en: "Dongguk Univ.", aliases: ["dongguk university"] },
  { ko: "압구정", en: "Apgujeong" },
  { ko: "신사", en: "Sinsa", aliases: ["garosugil"] },
  { ko: "고속터미널", en: "Express Bus Terminal", aliases: ["express bus terminal"] },
  { ko: "양재", en: "Yangjae" },
  { ko: "이태원", en: "Itaewon" },
  { ko: "녹사평", en: "Noksapyeong" },
  { ko: "삼각지", en: "Samgakji" },
  { ko: "공덕", en: "Gongdeok" },
  { ko: "디지털미디어시티", en: "Digital Media City", aliases: ["dmc", "digital media city"] },
  { ko: "김포공항", en: "Gimpo Int'l Airport", aliases: ["gimpo airport"] },
  { ko: "여의도", en: "Yeouido" },
  { ko: "노량진", en: "Noryangjin" },
  { ko: "서울숲", en: "Seoul Forest", aliases: ["seoul forest"] },
  { ko: "수유", en: "Suyu" },
  { ko: "창동", en: "Chang-dong" },
  { ko: "노원", en: "Nowon" },
  { ko: "회기", en: "Hoegi" },
  { ko: "군자", en: "Gunja" },
  { ko: "아차산", en: "Achasan" },
  { ko: "강변", en: "Gangbyeon" },
  { ko: "수서", en: "Suseo" },
  { ko: "가락시장", en: "Garak Market" },
  { ko: "중앙보훈병원", en: "Junggang Veterans Hospital" },
  { ko: "신논현", en: "Sinnonhyeon" },
  { ko: "봉은사", en: "Bongeunsa" },
  { ko: "올림픽공원", en: "Olympic Park" },
  { ko: "석촌", en: "Seokchon" },
  // Line 1 / Gyeongui–Jungang / Suin-Bundang termini & common destinations
  { ko: "광운대", en: "Gwangun-dae" },
  { ko: "문산", en: "Munsan" },
  { ko: "인천", en: "Incheon" },
  { ko: "소요산", en: "Soyosan" },
  { ko: "동두천", en: "Dongducheon" },
  { ko: "양주", en: "Yangju" },
  { ko: "의정부", en: "Uijeongbu" },
  { ko: "천안", en: "Cheonan" },
  { ko: "신창", en: "Sinchang" },
  { ko: "서동탄", en: "Seodongtan" },
  { ko: "병점", en: "Byeongjeom" },
  { ko: "오이도", en: "Oido" },
  { ko: "안산", en: "Ansan" },
  { ko: "부평", en: "Bupyeong" },
  { ko: "용문", en: "Yongmun" },
  { ko: "지평", en: "Jipyeong" },
  { ko: "대화", en: "Daehwa" },
  { ko: "구로", en: "Guro" },
  { ko: "온수", en: "Onsu" },
  { ko: "수원", en: "Suwon" },
  { ko: "정왕", en: "Jeongwang" },
  { ko: "범계", en: "Beomgye" },
  { ko: "당고개", en: "Danggogae" },
  { ko: "오금", en: "Ogeum" },
  { ko: "마천", en: "Macheon" },
  { ko: "암사", en: "Amsa" },
  { ko: "방화", en: "Banghwa" },
  { ko: "신논현", en: "Sinnonhyeon" },
  { ko: "사평", en: "Sapyeong" },
  { ko: "응암", en: "Eungam" },
  { ko: "장암", en: "Jangam" },
  { ko: "총신대입구", en: "Chongshin Univ." },
  { ko: "이수", en: "Isu" },
  { ko: "구파발", en: "Gupabal" },
  { ko: "지축", en: "Jichuk" },
  { ko: "대곡", en: "Daegok" },
  { ko: "왕십리", en: "Wangsimni" },
  { ko: "청구", en: "Cheonggu" },
  { ko: "보문", en: "Bomun" },
  { ko: "인천공항1터미널", en: "Incheon Airport T1" },
  { ko: "인천공항2터미널", en: "Incheon Airport T2" },
  { ko: "서강대", en: "Sogang Univ." },
  { ko: "공항화물청사", en: "Airport Cargo Terminal" },
  { ko: "검암", en: "Geomam" },
  { ko: "계양", en: "Gyeyang" },
  // more frequently-seen current-location / terminus stations
  { ko: "아현", en: "Ahyeon" },
  { ko: "한남", en: "Hannam" },
  { ko: "마곡나루", en: "Magongnaru" },
  { ko: "운서", en: "Unseo" },
  { ko: "야당", en: "Yadang" },
  { ko: "가좌", en: "Gajwa" },
  { ko: "일산", en: "Ilsan" },
  { ko: "덕소", en: "Deokso" },
  { ko: "영등포구청", en: "Yeongdeungpo-gu Office" },
  { ko: "곡산", en: "Goksan" },
  { ko: "대곡", en: "Daegok" },
  { ko: "행신", en: "Haengsin" },
  { ko: "능곡", en: "Neunggok" },
  { ko: "백석", en: "Baekseok" },
  { ko: "지축", en: "Jichuk" },
  { ko: "구반포", en: "Gubanpo" },
  { ko: "동작", en: "Dongjak" },
  { ko: "이촌", en: "Ichon" },
  { ko: "옥수", en: "Oksu" },
  { ko: "응봉", en: "Eungbong" },
  { ko: "중랑", en: "Jungnang" },
  { ko: "상봉", en: "Sangbong" },
  { ko: "망우", en: "Mangu" },
  { ko: "양원", en: "Yangwon" },
  { ko: "구리", en: "Guri" },
  { ko: "도농", en: "Donong" },
];

const KO_TO_EN = new Map<string, string>();
const INPUT_TO_KO = new Map<string, string>();
for (const s of STATIONS) {
  KO_TO_EN.set(s.ko, s.en);
  INPUT_TO_KO.set(s.en.toLowerCase(), s.ko);
  INPUT_TO_KO.set(s.ko, s.ko);
  for (const a of s.aliases ?? []) INPUT_TO_KO.set(a.toLowerCase(), s.ko);
}

// Longest Korean names first, so "을지로3가" wins over "을지로" during replace.
const KO_NAMES_BY_LEN = [...KO_TO_EN.keys()].sort((a, b) => b.length - a.length);

const stationKeys = (s: StationPair): string[] => [s.en, s.ko, ...(s.aliases ?? [])];

/**
 * Resolve user input to a station, tolerating typos/case/spacing and offering
 * "did you mean?" candidates when not confident:
 *  - exact: an exact map hit, Korean input, or a confident fuzzy match.
 *  - suggest: plausible but unsure → caller should ask the user.
 *  - none: nothing close.
 */
export function resolveStationFuzzy(input: string): Resolution<StationPair> {
  const raw = input.trim();
  if (!raw) return { kind: "none" };
  // Korean input → use as the API name directly (unknown Korean passes through).
  if (/[가-힣]/.test(raw)) {
    const ko = raw.replace(/역$/u, "");
    return { kind: "exact", item: STATIONS.find((s) => s.ko === ko) ?? { ko, en: ko } };
  }
  // Exact English/alias hit (collapse repeated spaces first).
  const exactKo = INPUT_TO_KO.get(raw.toLowerCase().replace(/\s+/g, " "));
  if (exactKo) {
    const f = STATIONS.find((s) => s.ko === exactKo);
    if (f) return { kind: "exact", item: f };
  }
  // Fuzzy fallback (typos, spacing, partial names).
  return resolveName(raw, STATIONS, stationKeys, { exact: 0.85, suggest: 0.6, maxSuggest: 3 });
}

/** Resolve user input (English, alias, Korean, or a close typo) to the Korean
 *  station name. Returns undefined when not confident (caller may then suggest). */
export function resolveStationKo(input: string): string | undefined {
  const r = resolveStationFuzzy(input);
  return r.kind === "exact" ? r.item.ko : undefined;
}

// ── General Hangul → Latin transliteration (Revised Romanization, simplified;
// no cross-syllable liaison). Covers ANY Korean text — restaurant names,
// addresses, residual station names — so we never show raw Hangul. ─────────────
const RR_CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const RR_JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const RR_JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

/**
 * Transliterate Korean to readable Latin. Each Hangul "run" is capitalized at its
 * start (so "near 충정로" → "near Chungjeongro", not "Near ..."); non-Hangul passes
 * through unchanged. Phonetic, not a translation — names become pronounceable.
 */
export function romanizeHangul(text: string): string {
  let out = "";
  let runStart = true; // capitalize the first romanized letter of each Hangul run
  for (const ch of text ?? "") {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      let r = RR_CHO[Math.floor(s / 588)] + RR_JUNG[Math.floor((s % 588) / 28)] + RR_JONG[s % 28];
      if (runStart && r) {
        r = r[0].toUpperCase() + r.slice(1);
        runStart = false;
      }
      out += r;
    } else {
      out += ch;
      runStart = true;
    }
  }
  // Y5: addresses transliterate to run-together strings ("Wausanro35Gil") — the
  // one string a visitor pastes into Maps. Space the embedded numbers and hyphenate
  // the number+suffix units so it's legible ("Wausanro 35-gil"). Only split at
  // lowercase→digit and digit→Uppercase boundaries so pre-romanized English like
  // "T2" / "B1" is left intact.
  return out
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/\b(\d+) (Gil|Ga|Ro)\b/g, (_m, n: string, suf: string) => `${n}-${suf.toLowerCase()}`)
    .replace(/\s{2,}/g, " ");
}

/** Romanize a single Korean station name. Falls back to the original Korean. */
export function romanizeStation(ko: string): string {
  const trimmed = (ko ?? "").trim();
  const name = trimmed.replace(/역$/, ""); // station names from the API omit 역
  return KO_TO_EN.get(name) ?? romanizeHangul(name); // official name, else transliterate
}

/** Subway/rail line names → English (order matters: longest/most specific first). */
const LINE_PATTERNS: [RegExp, string][] = [
  [/수도권\s*(\d)호선/g, "Line $1"],
  [/(\d)호선/g, "Line $1"],
  [/경의중앙선/g, "Gyeongui–Jungang Line"],
  [/수인분당선/g, "Suin–Bundang Line"],
  [/신분당선/g, "Sinbundang Line"],
  [/분당선/g, "Bundang Line"],
  [/공항철도/g, "Airport Railroad"],
  [/경춘선/g, "Gyeongchun Line"],
  [/우이신설선/g, "Ui–Sinseol Line"],
  [/서해선/g, "Seohae Line"],
  [/김포골드라인/g, "Gimpo Goldline"],
  [/신림선/g, "Sillim Line"],
  [/지선/g, " Branch"], // e.g. 성수지선 → "Seongsu Branch", 신정지선 → "Sinjeong Branch"
  // common bus-stop descriptive suffixes from ODsay
  [/버스환승센터/g, " Bus Transfer Center"],
  [/(\d+)번\s*승강장/g, "Platform $1"],
  [/(\d+)번\s*출구/g, "Exit $1"],
  [/\(?급행\)?/g, " (express)"],
  [/\(?완행\)?/g, " (local)"],
];

/** Replace known Korean station + line names inside free text with English. */
export function romanizeText(text: string): string {
  let out = text ?? "";
  for (const ko of KO_NAMES_BY_LEN) {
    if (out.includes(ko)) out = out.split(ko).join(KO_TO_EN.get(ko)!);
  }
  for (const [re, en] of LINE_PATTERNS) out = out.replace(re, en);
  return romanizeHangul(out); // transliterate any Korean the maps didn't cover
}

/**
 * Format a subway direction string like "성수행 - 신설동방면" into English:
 * "to Seongsu (via Sinseol-dong)". Falls back to romanizing the whole string.
 */
export function formatSubwayDirection(trainLineNm: string): string {
  let s = (trainLineNm ?? "").trim();
  // Pull off an express/local marker first so it can't break the 행/방면 parse.
  const speed = /급행/.test(s) ? " (express)" : /완행/.test(s) ? " (local)" : "";
  s = s.replace(/\s*[(]?\s*(급행|완행)\s*[)]?\s*/g, " ").trim();
  const m = s.match(/^(.+?)행(?:\s*-\s*(.+?)방면)?$/);
  if (m) {
    // romanizeText (substring replace) handles compound names like "신촌(경의중앙선)".
    const dest = romanizeText(m[1]);
    return (m[2] ? `to ${dest} (via ${romanizeText(m[2])})` : `to ${dest}`) + speed;
  }
  return romanizeText(s) + speed;
}
