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
import { cjkToKorean, resolveName } from "./fuzzy.js";
import STATIONS_RAW from "./data/stationCoords.json" with { type: "json" };

export interface GeoPlace {
  label: string;
  lng: number;
  lat: number;
  aliases: string[];
}

// Exported for the web client's on-device "near me" snap (privacy: coordinates
// never leave the device — the client sends only the matched label text).
export const PLACES: GeoPlace[] = [
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
  { label: "Jeju City", lng: 126.5312, lat: 33.4996, aliases: ["jeju", "jeju city", "제주", "제주시", "済州", "濟州", "济州", "チェジュ"] },
  { label: "Seogwipo (Jeju)", lng: 126.5601, lat: 33.2542, aliases: ["seogwipo", "서귀포"] },
  // Where most visitors to Jeju actually sleep. Without it, a phone in a Yeon-dong
  // hotel snapped to "Jeju Int'l Airport", 2.7 km off — Jeju City's point above is
  // the old town, and the new town grew up a few kilometres west of it.
  { label: "Sinjeju (Yeon-dong · Nohyeong, Jeju)", lng: 126.4865, lat: 33.4872, aliases: ["sinjeju", "shinjeju", "yeon-dong", "yeondong", "nohyeong", "신제주", "연동", "노형", "노형동"] },
  { label: "Aewol (Jeju)", lng: 126.3121, lat: 33.4627, aliases: ["aewol", "애월", "한담"] },
  { label: "Hamdeok Beach (Jeju)", lng: 126.6694, lat: 33.5432, aliases: ["hamdeok", "함덕", "함덕해수욕장"] },
  // Airports, stations and terminals: the endpoints of almost every arrival-day
  // question, and none of them are tourism-database entries to be geocoded.
  { label: "Jeju Int'l Airport", lng: 126.4931, lat: 33.5071, aliases: ["jeju airport", "cju", "제주공항", "제주국제공항"] },
  { label: "Gimhae Int'l Airport (Busan)", lng: 128.9425, lat: 35.1795, aliases: ["gimhae airport", "busan airport", "pus", "김해공항", "김해국제공항"] },
  { label: "Cheongju Int'l Airport", lng: 127.4991, lat: 36.7166, aliases: ["cheongju airport", "cjj", "청주공항"] },
  { label: "Daegu Int'l Airport", lng: 128.6386, lat: 35.8941, aliases: ["daegu airport", "twu", "대구공항"] },
  { label: "Seoul Station", lng: 126.9707, lat: 37.5547, aliases: ["seoul station", "서울역", "ソウル駅", "首尔站", "首爾站"] },
  { label: "Yongsan Station", lng: 126.9648, lat: 37.5299, aliases: ["yongsan station", "용산역"] },
  { label: "Suseo Station (SRT)", lng: 127.1043, lat: 37.4874, aliases: ["suseo station", "srt", "수서역"] },
  { label: "Express Bus Terminal (Seoul)", lng: 127.0047, lat: 37.5049, aliases: ["express bus terminal", "고속터미널", "센트럴시티"] },
  { label: "Busan Station", lng: 129.0417, lat: 35.1151, aliases: ["busan station", "부산역", "釜山駅", "釜山站"] },
  { label: "Singyeongju Station (KTX)", lng: 129.1355, lat: 35.7955, aliases: ["singyeongju", "singyeongju station", "신경주역"] },
  { label: "Jeju Ferry Terminal", lng: 126.5251, lat: 33.5253, aliases: ["jeju ferry", "jeju port", "제주항", "제주여객터미널"] },
  // Jeju's headline sights — the island has no rail, so these are route endpoints.
  { label: "Seongsan Ilchulbong (Jeju)", lng: 126.9401, lat: 33.4586, aliases: ["seongsan", "seongsan ilchulbong", "sunrise peak", "성산일출봉"] },
  { label: "Hallasan National Park (Jeju)", lng: 126.5297, lat: 33.3617, aliases: ["hallasan", "mt hallasan", "한라산"] },
  { label: "Jungmun (Jeju)", lng: 126.4194, lat: 33.2461, aliases: ["jungmun", "중문", "중문관광단지"] },
  { label: "Udo Island (Jeju)", lng: 126.9527, lat: 33.5063, aliases: ["udo", "u-do", "우도"] },
  { label: "Hyeopjae Beach (Jeju)", lng: 126.2397, lat: 33.3941, aliases: ["hyeopjae", "협재", "협재해수욕장"] },
  { label: "Daegu", lng: 128.6014, lat: 35.8714, aliases: ["daegu", "대구", "동성로"] },
  { label: "Incheon (Chinatown)", lng: 126.6166, lat: 37.4759, aliases: ["incheon", "인천", "incheon chinatown", "인천차이나타운"] },
  { label: "Gwangju", lng: 126.8526, lat: 35.1595, aliases: ["gwangju", "광주"] },
  { label: "Daejeon", lng: 127.3845, lat: 36.3504, aliases: ["daejeon", "대전"] },
  { label: "Gyeongju", lng: 129.2247, lat: 35.8562, aliases: ["gyeongju", "경주", "慶州"] },
  { label: "Jeonju (Hanok Village)", lng: 127.153, lat: 35.815, aliases: ["jeonju", "전주", "jeonju hanok village", "전주한옥마을"] },
  { label: "Gangneung", lng: 128.8761, lat: 37.7519, aliases: ["gangneung", "강릉"] },
  { label: "Sokcho", lng: 128.5918, lat: 38.207, aliases: ["sokcho", "속초"] },
  { label: "Suwon (Hwaseong)", lng: 127.0152, lat: 37.282, aliases: ["suwon", "수원", "hwaseong fortress", "화성행궁"] },
  // Seoul neighbourhoods and museums the course builder plans around. They were
  // missing here, so a day made of them could not be timed or priced at all —
  // the transit summary was absent from exactly the hand-written itineraries.
  { label: "Ikseon-dong", lng: 126.9905, lat: 37.5735, aliases: ["ikseon", "ikseon-dong", "익선동"] },
  { label: "Tongin Market", lng: 126.97, lat: 37.5806, aliases: ["tongin", "tongin market", "통인시장"] },
  { label: "Yeonnam-dong", lng: 126.925, lat: 37.5605, aliases: ["yeonnam", "yeonnam-dong", "연남동", "연트럴파크"] },
  { label: "National Museum of Korea", lng: 126.9803, lat: 37.524, aliases: ["national museum of korea", "국립중앙박물관"] },
  { label: "Ihwa Mural Village", lng: 127.0055, lat: 37.5795, aliases: ["ihwa mural village", "이화벽화마을", "낙산공원"] },
  { label: "Euljiro", lng: 126.9917, lat: 37.5661, aliases: ["euljiro", "을지로", "hipjiro", "힙지로"] },
  { label: "Seochon", lng: 126.9709, lat: 37.5793, aliases: ["seochon", "서촌"] },
  { label: "Gwangjang Market", lng: 126.9999, lat: 37.5701, aliases: ["gwangjang", "gwangjang market", "광장시장"] },
  // The stations a trip outside the capital actually starts at. Only the Seoul
  // network is in the station table above, so "전주역" used to be read as Jeonju
  // and land on the hanok village — the destination of the very trip being
  // planned, which then came back as a one-stop bus ride. Coordinates checked
  // against Kakao Local, one by one.
  { label: "Suwon Station", lng: 127.0001, lat: 37.2658, aliases: ["suwon station", "수원역", "水原駅", "水原站"] },
  { label: "Jeonju Station", lng: 127.1618, lat: 35.8499, aliases: ["jeonju station", "전주역", "全州駅", "全州站"] },
  { label: "Gyeongju Station (KTX)", lng: 129.139, lat: 35.7984, aliases: ["gyeongju station", "경주역", "慶州駅", "庆州站"] },
  { label: "Gangneung Station", lng: 128.8996, lat: 37.7645, aliases: ["gangneung station", "강릉역"] },
  { label: "Jeongdongjin Station", lng: 129.0327, lat: 37.6914, aliases: ["jeongdongjin", "jeongdongjin station", "정동진", "정동진역", "正東津", "正东津"] },
  { label: "Yeosu Expo Station", lng: 127.7486, lat: 34.7531, aliases: ["yeosu expo station", "yeosu station", "여수엑스포역", "여수역"] },
  { label: "Andong Station", lng: 128.6749, lat: 36.5745, aliases: ["andong station", "안동역"] },
  { label: "Dongdaegu Station", lng: 128.6284, lat: 35.8793, aliases: ["dongdaegu station", "동대구역"] },
  { label: "Gwangju Songjeong Station", lng: 126.7908, lat: 35.1377, aliases: ["gwangju songjeong station", "광주송정역"] },
  { label: "Mokpo Station", lng: 126.3866, lat: 34.7911, aliases: ["mokpo station", "목포역"] },
  { label: "Suncheon Station", lng: 127.5031, lat: 34.9458, aliases: ["suncheon station", "순천역"] },
  { label: "Pohang Station", lng: 129.3419, lat: 36.0716, aliases: ["pohang station", "포항역"] },
  { label: "Ulsan Station (KTX)", lng: 129.1386, lat: 35.5514, aliases: ["ulsan station", "울산역"] },
  { label: "Chuncheon Station", lng: 127.7167, lat: 37.8845, aliases: ["chuncheon station", "춘천역"] },
  { label: "Wonju Station", lng: 127.9219, lat: 37.3159, aliases: ["wonju station", "원주역"] },
  { label: "Jinju Station", lng: 128.1179, lat: 35.1507, aliases: ["jinju station", "진주역"] },
  { label: "Changwon Jungang Station", lng: 128.7013, lat: 35.2424, aliases: ["changwon jungang station", "창원중앙역"] },
  { label: "Cheonan-Asan Station", lng: 127.1044, lat: 36.7943, aliases: ["cheonan-asan station", "cheonan asan station", "천안아산역"] },
  { label: "Osong Station", lng: 127.3276, lat: 36.6201, aliases: ["osong station", "오송역"] },
  { label: "Iksan Station", lng: 126.9457, lat: 35.9405, aliases: ["iksan station", "익산역"] },
  { label: "Gongju Station", lng: 127.0968, lat: 36.3325, aliases: ["gongju station", "공주역"] },
  { label: "Namwon Station", lng: 127.3614, lat: 35.4112, aliases: ["namwon station", "남원역"] },
  { label: "Gimcheon(Gumi) Station", lng: 128.181, lat: 36.1135, aliases: ["gimcheon station", "gimcheon-gumi station", "김천구미역", "김천(구미)역"] },
  { label: "Daejeon Station", lng: 127.4346, lat: 36.3323, aliases: ["daejeon station", "대전역"] },
  { label: "Donghae Station", lng: 129.1238, lat: 37.4982, aliases: ["donghae station", "동해역"] },
  // Where an intercity coach actually sets you down, which is rarely the station.
  { label: "Sokcho Intercity Bus Terminal", lng: 128.5908, lat: 38.2112, aliases: ["sokcho bus terminal", "sokcho intercity bus terminal", "속초시외버스터미널"] },
  { label: "Tongyeong Bus Terminal", lng: 128.4169, lat: 34.8851, aliases: ["tongyeong bus terminal", "통영종합버스터미널"] },
  { label: "Gyeongju Intercity Bus Terminal", lng: 129.2025, lat: 35.8398, aliases: ["gyeongju bus terminal", "경주시외버스터미널"] },
  // And the places those trips are for. Without a coordinate, a destination can
  // only be searched for by name — which is how "Dongpirang" came back as no
  // answer at all while a bus to it was sitting two streets away.
  { label: "Bulguksa Temple", lng: 129.3318, lat: 35.7899, aliases: ["bulguksa", "bulguksa temple", "불국사", "仏国寺", "佛国寺", "佛國寺"] },
  { label: "Andong Hahoe Folk Village", lng: 128.5181, lat: 36.539, aliases: ["hahoe", "hahoe village", "hahoe folk village", "하회마을", "안동하회마을", "河回村", "河回마을"] },
  { label: "Dongpirang Mural Village", lng: 128.4276, lat: 34.8453, aliases: ["dongpirang", "동피랑", "동피랑벽화마을"] },
  { label: "Odongdo Island", lng: 127.7663, lat: 34.7446, aliases: ["odongdo", "오동도", "梧桐島", "梧桐岛"] },
  { label: "Suncheonman Bay Wetland", lng: 127.5096, lat: 34.8856, aliases: ["suncheonman", "suncheon bay", "순천만", "순천만습지"] },
  { label: "Juknokwon Bamboo Forest", lng: 126.9859, lat: 35.3278, aliases: ["juknokwon", "죽녹원", "담양죽녹원"] },
  { label: "Boseong Green Tea Fields", lng: 127.0779, lat: 34.716, aliases: ["boseong", "boseong green tea", "보성녹차밭"] },
  { label: "Cheomseongdae", lng: 129.219, lat: 35.8347, aliases: ["cheomseongdae", "첨성대", "瞻星台", "瞻星臺"] },
  { label: "Donggung Palace and Wolji Pond", lng: 129.227, lat: 35.8348, aliases: ["donggung", "wolji", "anapji", "동궁과월지", "안압지"] },
  { label: "Anmok Beach (Coffee Street)", lng: 128.9483, lat: 37.7723, aliases: ["anmok", "anmok beach", "안목해변", "강릉커피거리"] },
  { label: "Sokcho Tourist & Fishery Market", lng: 128.5902, lat: 38.2045, aliases: ["sokcho market", "속초관광수산시장", "속초중앙시장"] },
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

/* -------------------------------- stations -------------------------------- */

/** A subway station, named in each language we serve. */
export interface StationEntry {
  k: string;
  e: string;
  j?: string;
  z?: string;
  lat: number;
  lng: number;
}

/**
 * Every subway station in the Seoul area — 653, from the city's own register
 * (scripts/build-station-coords.ts).
 *
 * The phone names where a traveller is by the nearest station, so the server has
 * to be able to place a station name too. Before this, "내 주변 맛집 (성수역
 * 근처예요)" came back with restaurants at City Hall: 성수역 was not among the
 * 82 landmarks above, the search could not place it, and it fell back to the
 * middle of the city.
 */
export const STATIONS = STATIONS_RAW as StationEntry[];

const bareStation = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s*(?:station|stn)\.?$/i, "")
    .replace(/[역駅站驛]$/, "")
    .trim();

function stationPlace(s: StationEntry): GeoPlace {
  const label = /station$/i.test(s.e) ? s.e : `${s.e} Station`;
  return { label, lat: s.lat, lng: s.lng, aliases: [s.k, `${s.k}역`, s.e, label] };
}

/** Whole-value lookups: a place slot that says "성수" or "Seongsu Station" means the station. */
const STATION_INDEX = new Map<string, GeoPlace>();
/**
 * Running-text lookups: only the suffixed form counts.
 *
 * Many station names are ordinary words — 오리 is a duck, 온수 hot water, 대화 a
 * conversation, 개봉 a film coming out — and matched bare they would turn "오리고기
 * 맛집" into a question about Ori Station. With the suffix they cannot be
 * anything else.
 */
const STATION_IN_TEXT: { alias: string; place: GeoPlace }[] = [];
const STATION_LATIN_BY_NAME = new Map<string, GeoPlace>();

for (const s of STATIONS) {
  const p = stationPlace(s);
  for (const n of [s.k, s.e, s.j, s.z]) {
    const key = n ? bareStation(n) : "";
    if (key && !STATION_INDEX.has(key)) STATION_INDEX.set(key, p);
  }
  for (const alias of [`${s.k}역`, s.j ? `${s.j}駅` : "", s.z ? `${s.z}站` : ""]) {
    if (alias) STATION_IN_TEXT.push({ alias: alias.toLowerCase(), place: p });
  }
  const e = bareStation(s.e);
  if (/[a-z]/.test(e) && !STATION_LATIN_BY_NAME.has(e)) STATION_LATIN_BY_NAME.set(e, p);
}

/**
 * English station names followed by "station" — one pattern, compiled once,
 * longest names first so "Seoul Nat'l Univ. of Education Station" is not read
 * as "Seoul Station".
 */
const STATION_LATIN_RE = new RegExp(
  `\\b(${[...STATION_LATIN_BY_NAME.keys()]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(ESC_RE, "\\$&"))
    .join("|")})\\s+(?:station|stn)\\b`,
  "i",
);

/** A station named with its suffix somewhere in a sentence, longest first. */
function stationInText(t: string): { place: GeoPlace; len: number } | undefined {
  let best: { place: GeoPlace; len: number } | undefined;
  const m = STATION_LATIN_RE.exec(t);
  if (m) {
    const place = STATION_LATIN_BY_NAME.get(m[1].toLowerCase());
    if (place) best = { place, len: m[0].length };
  }
  for (const { alias, place } of STATION_IN_TEXT) {
    if (alias.length > (best?.len ?? 0) && t.includes(alias)) best = { place, len: alias.length };
  }
  return best;
}

/** Find the most specific curated place named anywhere inside a free-text phrase
 *  ("things to see in Busan" → Busan; "attractions near Haeundae" → Haeundae), so
 *  a query that embeds a place still yields a geocode anchor for the radius
 *  fallback. Prefers the longest alias match; ASCII aliases match on word
 *  boundaries, Korean aliases on substring. Used only as a best-effort anchor. */
export function findPlaceInText(text: string): GeoPlace | undefined {
  // Japanese/Chinese forms are rewritten to Korean first — otherwise 明洞 or
  // 首尔站 never matches an alias and the place silently fails to geocode.
  const t = cjkToKorean(text ?? "").toLowerCase();
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
  // A station, named with its suffix — only when it says more than a landmark
  // did, so "Hongdae" keeps meaning the neighbourhood.
  const station = stationInText(t) ?? stationInText((text ?? "").toLowerCase());
  if (station && (!best || station.len > best.len)) return station.place;
  return best?.p;
}

/** Resolve a place name to curated coordinates, or undefined for the long tail.
 *  Tolerates typos/spacing/variant phrasings via a confident fuzzy fallback
 *  (e.g. "Incheon International Airport", "Incheon Airport Terminal 1"). */
export function resolvePlaceCoord(input: string): GeoPlace | undefined {
  const raw = cjkToKorean(input ?? "").trim();
  if (!raw) return undefined;
  const exact = INDEX.get(raw.toLowerCase());
  if (exact) return exact;
  // Every station, by exact name in any of our four languages — before the fuzzy
  // pass, because an exact station is surer than a near-miss landmark.
  const station = STATION_INDEX.get(bareStation(raw)) ?? STATION_INDEX.get(bareStation(input ?? ""));
  // Someone who says "역" or "Station" means the station. Stripping the suffix and
  // matching what is left sent 수원역 to Hwaseong Haenggung, 1.7 km away and on the
  // far side of the trip we were being asked to plan.
  if (station && /(?:\s*(?:station|stn)\.?|[역駅站驛])\s*$/i.test(raw)) return station;
  const direct = INDEX.get(normalize(raw));
  if (direct) return direct;
  if (station) return station;
  // Confident fuzzy match only (a wrong geocode would misroute) — else undefined
  // so the caller falls back to TourAPI geocoding.
  const r = resolveName(raw, PLACES, placeKeys, { exact: 0.84, suggest: 0.84, maxSuggest: 1 });
  return r.kind === "exact" ? r.item : undefined;
}
