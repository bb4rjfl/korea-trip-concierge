/**
 * Korean→English romanization for Seoul subway/place names, so an English-first
 * product never shows raw Hangul a foreign visitor can't read (review item U1).
 *
 * Coverage is a curated set of major / transfer / tourist stations. Unknown
 * names fall back to the original Korean (never breaks). One canonical list
 * drives both directions: EN/alias→KO (input resolution) and KO→EN (display).
 */

interface StationPair {
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
  { ko: "교대", en: "Seoul Nat'l Univ. of Education" },
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

/** Resolve user input (English, alias, or Korean) to the Korean station name. */
export function resolveStationKo(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  if (/[가-힣]/.test(raw)) return raw.replace(/역$/, ""); // Korean passes through
  return INPUT_TO_KO.get(raw.toLowerCase());
}

/** Romanize a single Korean station name. Falls back to the original Korean. */
export function romanizeStation(ko: string): string {
  const trimmed = (ko ?? "").trim();
  const name = trimmed.replace(/역$/, ""); // station names from the API omit 역
  return KO_TO_EN.get(name) ?? trimmed;
}

/** Replace any known Korean station names inside free text with English. */
export function romanizeText(text: string): string {
  let out = text ?? "";
  for (const ko of KO_NAMES_BY_LEN) {
    if (out.includes(ko)) out = out.split(ko).join(KO_TO_EN.get(ko)!);
  }
  return out;
}

/**
 * Format a subway direction string like "성수행 - 신설동방면" into English:
 * "to Seongsu (via Sinseol-dong)". Falls back to romanizing the whole string.
 */
export function formatSubwayDirection(trainLineNm: string): string {
  const s = (trainLineNm ?? "").trim();
  const m = s.match(/^(.+?)행(?:\s*-\s*(.+?)방면)?$/);
  if (m) {
    const dest = romanizeStation(m[1]);
    return m[2] ? `to ${dest} (via ${romanizeStation(m[2])})` : `to ${dest}`;
  }
  return romanizeText(s);
}
