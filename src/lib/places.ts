/**
 * Curated coordinate index for high-traffic Korean landmarks & stations (B).
 *
 * Used to geocode from/to for transit routing FIRST — deterministic, instant,
 * and accurate for the places foreign visitors actually ask about. Falls back to
 * TourAPI for the long tail. This is curated reference data (our value-add), not
 * external grounding, so it's Kakao-rule-safe and protects p99 (no API call).
 *
 * Coordinates are WGS84 (lng, lat) to ~4 dp — precise enough for ODsay to snap to
 * the nearest stop. Aliases are matched case-insensitively after stripping a
 * trailing "station"/"stn"/"역", then a confident fuzzy fallback.
 */
import { resolveName } from "./fuzzy.js";

export interface GeoPlace {
  label: string;
  lng: number;
  lat: number;
  aliases: string[];
}

const PLACES: GeoPlace[] = [
  { label: "Gyeongbokgung Palace", lng: 126.977, lat: 37.5796, aliases: ["gyeongbokgung", "경복궁"] },
  { label: "Changdeokgung Palace", lng: 126.991, lat: 37.5794, aliases: ["changdeokgung", "창덕궁"] },
  { label: "Deoksugung Palace", lng: 126.9751, lat: 37.5658, aliases: ["deoksugung", "덕수궁"] },
  { label: "N Seoul Tower", lng: 126.9882, lat: 37.5512, aliases: ["n seoul tower", "namsan tower", "남산타워", "남산"] },
  { label: "Myeongdong", lng: 126.9863, lat: 37.5609, aliases: ["myeongdong", "명동"] },
  { label: "Hongik Univ. Station", lng: 126.9245, lat: 37.5572, aliases: ["hongdae", "hongik", "홍대", "홍대입구"] },
  { label: "Gangnam Station", lng: 127.0276, lat: 37.4979, aliases: ["gangnam", "강남"] },
  { label: "Seoul Station", lng: 126.9707, lat: 37.5547, aliases: ["seoul station", "서울역", "ソウル", "首爾", "首尔"] },
  { label: "Itaewon", lng: 126.9947, lat: 37.5345, aliases: ["itaewon", "이태원"] },
  { label: "Insadong", lng: 126.985, lat: 37.574, aliases: ["insadong", "인사동"] },
  { label: "Dongdaemun (DDP)", lng: 127.009, lat: 37.5663, aliases: ["dongdaemun", "ddp", "동대문"] },
  { label: "Gwangjang Market", lng: 126.9996, lat: 37.5701, aliases: ["gwangjang market", "광장시장"] },
  { label: "Bukchon Hanok Village", lng: 126.9849, lat: 37.5826, aliases: ["bukchon", "북촌"] },
  { label: "Seongsu", lng: 127.0559, lat: 37.5445, aliases: ["seongsu", "성수", "성수동"] },
  { label: "Jamsil (Lotte World)", lng: 127.1001, lat: 37.5133, aliases: ["jamsil", "lotte world", "롯데월드", "잠실"] },
  { label: "COEX", lng: 127.0588, lat: 37.5126, aliases: ["coex", "삼성역", "코엑스"] },
  { label: "Express Bus Terminal", lng: 127.0048, lat: 37.5046, aliases: ["express bus terminal", "고속터미널"] },
  { label: "Yeouido", lng: 126.9245, lat: 37.5217, aliases: ["yeouido", "여의도"] },
  { label: "Noryangjin", lng: 126.9425, lat: 37.5125, aliases: ["noryangjin", "노량진"] },
  { label: "Ewha Womans Univ.", lng: 126.9466, lat: 37.5567, aliases: ["ewha", "이대"] },
  { label: "Sinchon", lng: 126.9368, lat: 37.5559, aliases: ["sinchon", "신촌"] },
  { label: "Apgujeong", lng: 127.0286, lat: 37.5274, aliases: ["apgujeong", "압구정"] },
  { label: "Garosu-gil (Sinsa)", lng: 127.0203, lat: 37.5163, aliases: ["garosugil", "garosu-gil", "sinsa", "가로수길", "신사"] },
  { label: "Yongsan", lng: 126.9648, lat: 37.5299, aliases: ["yongsan", "용산"] },
  { label: "Cheongnyangni", lng: 127.0469, lat: 37.5803, aliases: ["cheongnyangni", "청량리"] },
  { label: "Gwanghwamun", lng: 126.9765, lat: 37.5717, aliases: ["gwanghwamun", "광화문"] },
  { label: "City Hall", lng: 126.978, lat: 37.5658, aliases: ["city hall", "시청"] },
  { label: "Jongno 3-ga", lng: 126.992, lat: 37.5704, aliases: ["jongno", "jongno 3-ga", "종로", "종로3가"] },
  { label: "Hyehwa (Daehangno)", lng: 127.0019, lat: 37.5822, aliases: ["hyehwa", "daehangno", "혜화", "대학로"] },
  { label: "Konkuk Univ.", lng: 127.0703, lat: 37.5404, aliases: ["konkuk", "건대", "건대입구"] },
  { label: "Wangsimni", lng: 127.0378, lat: 37.5614, aliases: ["wangsimni", "왕십리"] },
  { label: "Hapjeong", lng: 126.9138, lat: 37.5495, aliases: ["hapjeong", "합정"] },
  { label: "Namdaemun Market", lng: 126.9776, lat: 37.5594, aliases: ["namdaemun", "namdaemun market", "남대문", "남대문시장"] },
  { label: "Seoul Forest", lng: 127.0374, lat: 37.5444, aliases: ["seoul forest", "서울숲"] },
  { label: "War Memorial of Korea", lng: 126.9774, lat: 37.534, aliases: ["war memorial", "전쟁기념관"] },
  { label: "Lotte World Tower", lng: 127.1025, lat: 37.5126, aliases: ["lotte world tower", "롯데타워", "롯데월드타워"] },
  { label: "Gimpo Int'l Airport", lng: 126.8016, lat: 37.5631, aliases: ["gimpo airport", "gimpo", "김포공항"] },
  { label: "Incheon Int'l Airport T1", lng: 126.4515, lat: 37.4486, aliases: ["incheon airport", "incheon airport t1", "incheon international airport", "incheon airport terminal 1", "icn", "인천공항", "인천국제공항", "인천공항1터미널"] },
  { label: "Incheon Int'l Airport T2", lng: 126.4407, lat: 37.4602, aliases: ["incheon airport t2", "incheon airport terminal 2", "인천공항2터미널"] },
  { label: "Dongmyo Flea Market", lng: 127.0166, lat: 37.5727, aliases: ["dongmyo", "동묘"] },
  // ── Major non-Seoul cities & destinations (geocode anchors for national search) ──
  { label: "Busan", lng: 129.0413, lat: 35.1151, aliases: ["busan", "부산", "busan station", "부산역", "釜山", "プサン"] },
  { label: "Haeundae (Busan)", lng: 129.1639, lat: 35.1631, aliases: ["haeundae", "해운대"] },
  { label: "Seomyeon (Busan)", lng: 129.0594, lat: 35.1577, aliases: ["seomyeon", "서면"] },
  { label: "Gwangalli (Busan)", lng: 129.1187, lat: 35.1532, aliases: ["gwangalli", "gwangan", "광안리", "광안"] },
  { label: "Nampo-dong / Jagalchi (Busan)", lng: 129.0306, lat: 35.0975, aliases: ["nampo", "nampo-dong", "jagalchi", "남포동", "자갈치"] },
  { label: "Gamcheon Culture Village (Busan)", lng: 129.0107, lat: 35.0976, aliases: ["gamcheon", "감천", "감천문화마을"] },
  { label: "Jeju City", lng: 126.5312, lat: 33.4996, aliases: ["jeju", "jeju city", "제주", "제주시", "済州", "濟州", "チェジュ"] },
  { label: "Seogwipo (Jeju)", lng: 126.5601, lat: 33.2542, aliases: ["seogwipo", "서귀포"] },
  { label: "Daegu", lng: 128.6014, lat: 35.8714, aliases: ["daegu", "대구", "동성로"] },
  { label: "Incheon (Chinatown)", lng: 126.6166, lat: 37.4759, aliases: ["incheon", "인천", "incheon chinatown", "인천차이나타운"] },
  { label: "Gwangju", lng: 126.8526, lat: 35.1595, aliases: ["gwangju", "광주"] },
  { label: "Daejeon", lng: 127.3845, lat: 36.3504, aliases: ["daejeon", "대전"] },
  { label: "Gyeongju", lng: 129.2247, lat: 35.8562, aliases: ["gyeongju", "경주", "慶州"] },
  { label: "Jeonju (Hanok Village)", lng: 127.153, lat: 35.815, aliases: ["jeonju", "전주", "jeonju hanok village", "전주한옥마을"] },
  { label: "Gangneung", lng: 128.8761, lat: 37.7519, aliases: ["gangneung", "강릉"] },
  { label: "Sokcho", lng: 128.5918, lat: 38.207, aliases: ["sokcho", "속초"] },
  { label: "Suwon (Hwaseong)", lng: 127.0152, lat: 37.282, aliases: ["suwon", "수원", "hwaseong fortress", "화성행궁"] },
];

const INDEX = new Map<string, GeoPlace>();
for (const p of PLACES) for (const a of p.aliases) INDEX.set(a.toLowerCase(), p);

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s*(station|stn)\.?$/i, "")
    .replace(/역$/, "")
    .trim();
}

const placeKeys = (p: GeoPlace): string[] => [p.label, ...p.aliases];

const ESC_RE = /[.*+?^${}()|[\]\\]/g;

/** Find the most specific curated place named anywhere inside a free-text phrase
 *  ("things to see in Busan" → Busan; "attractions near Haeundae" → Haeundae), so
 *  a query that embeds a place still yields a geocode anchor for the radius
 *  fallback. Prefers the longest alias match; ASCII aliases match on word
 *  boundaries, Korean aliases on substring. Used only as a best-effort anchor. */
export function findPlaceInText(text: string): GeoPlace | undefined {
  const t = (text ?? "").toLowerCase();
  if (!t) return undefined;
  let best: { p: GeoPlace; len: number } | undefined;
  for (const p of PLACES) {
    for (const a of p.aliases) {
      const al = a.toLowerCase();
      const latin = /[a-z]/.test(al);
      if (al.length < (latin ? 3 : 2)) continue; // 2-char CJK/Korean city names are valid
      const hit = latin ? new RegExp(`\\b${al.replace(ESC_RE, "\\$&")}\\b`).test(t) : t.includes(al);
      if (hit && (!best || al.length > best.len)) best = { p, len: al.length };
    }
  }
  return best?.p;
}

/** Resolve a place name to curated coordinates, or undefined for the long tail.
 *  Tolerates typos/spacing/variant phrasings via a confident fuzzy fallback
 *  (e.g. "Incheon International Airport", "Incheon Airport Terminal 1"). */
export function resolvePlaceCoord(input: string): GeoPlace | undefined {
  const raw = (input ?? "").trim();
  if (!raw) return undefined;
  const direct = INDEX.get(raw.toLowerCase()) ?? INDEX.get(normalize(raw));
  if (direct) return direct;
  // Confident fuzzy match only (a wrong geocode would misroute) — else undefined
  // so the caller falls back to TourAPI geocoding.
  const r = resolveName(raw, PLACES, placeKeys, { exact: 0.84, suggest: 0.84, maxSuggest: 1 });
  return r.kind === "exact" ? r.item : undefined;
}
