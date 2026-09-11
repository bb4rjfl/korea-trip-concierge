/**
 * Build the subway networks outside the capital — Busan, Daegu, Gwangju,
 * Daejeon — for the phone's route planner (web/client/src/device/networks.ts)
 * and the server's named routes (src/lib/regionalSubway.ts).
 *
 * The order of stations along each line is public and changes only when a
 * line is extended, so it is written out below, line by line. Kakao's own
 * directory supplies where each station is — and confirms it: every station
 * must be found filed under that very line ("서면역 부산1호선"), or the build
 * stops rather than draw a network with a hole or a station in the wrong city.
 * Consecutive stations more than a few kilometres apart stop it too, which is
 * how a typo in the order would show.
 *
 * (A first version walked the lines through the routing service, which knows
 * each station's neighbours; its daily allowance ran out part-way, at night,
 * with the traveller-facing routes depending on the same allowance. This
 * spends none of it.)
 *
 *   npx tsx --env-file=.env scripts/build-regional-subway.ts
 *
 * Output: src/lib/data/regionalSubway.json (committed).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { romanizeHangul } from "../src/lib/romanize.js";

const KEY = (process.env.KAKAO_REST_API_KEY ?? "").trim();
const CACHE = path.resolve("scripts/.cache/kakao-stations");
mkdirSync(CACHE, { recursive: true });

interface LineSpec {
  /** The planner's line key: "부산 1호선", or the named line. */
  key: string;
  /** How Kakao files it: the last step of its category path. */
  kakao: string;
  /** Wider spacing on commuter and light-rail lines. */
  maxGapKm: number;
  stations: string[];
}

const NETWORKS: Record<string, LineSpec[]> = {
  busan: [
    {
      key: "부산 1호선",
      kakao: "부산1호선",
      maxGapKm: 3,
      stations: "다대포해수욕장 다대포항 낫개 신장림 장림 동매 신평 하단 당리 사하 괴정 대티 서대신 동대신 토성 자갈치 남포 중앙 부산역 초량 부산진 좌천 범일 범내골 서면 부전 양정 시청 연산 교대 동래 명륜 온천장 부산대 장전 구서 두실 남산 범어사 노포".split(" "),
    },
    {
      key: "부산 2호선",
      kakao: "부산2호선",
      maxGapKm: 3.5,
      stations: "장산 중동 해운대 동백 벡스코 센텀시티 민락 수영 광안 금련산 남천 경성대·부경대 대연 못골 지게골 문현 국제금융센터·부산은행 전포 서면 부암 가야 동의대 개금 냉정 주례 감전 사상 덕포 모덕 모라 구남 구명 덕천 수정 화명 율리 동원 금곡 호포 증산 부산대양산캠퍼스 남양산 양산".split(" "),
    },
    {
      key: "부산 3호선",
      kakao: "부산3호선",
      // 미남–만덕 runs under the mountain: 3 km.
      maxGapKm: 3.5,
      stations: "수영 망미 배산 물만골 연산 거제 종합운동장 사직 미남 만덕 남산정 숙등 덕천 구포 강서구청 체육공원 대저".split(" "),
    },
    {
      key: "부산 4호선",
      kakao: "부산4호선",
      maxGapKm: 3,
      stations: "미남 동래 수안 낙민 충렬사 명장 서동 금사 반여농산물시장 석대 영산대 윗반송 고촌 안평".split(" "),
    },
    {
      key: "부산김해경전철",
      kakao: "부산김해경전철",
      maxGapKm: 3.5,
      stations: "사상 괘법르네시떼 서부산유통지구 공항 덕두 등구 대저 평강 대사 불암 지내 김해대학 인제대 김해시청 부원 봉황 수로왕릉 박물관 연지공원 장신대 가야대".split(" "),
    },
    {
      key: "동해선",
      kakao: "동해선",
      // 서생–남창 crosses open country: 8 km.
      maxGapKm: 9,
      stations: "부전 거제해맞이 거제 교대 동래 안락 부산원동 재송 센텀 벡스코 신해운대 송정 오시리아 기장 일광 좌천 월내 서생 남창 망양 덕하 개운포 태화강".split(" "),
    },
  ],
  daegu: [
    {
      key: "대구 1호선",
      kakao: "대구1호선",
      // The Hayang extension: 대구한의대병원–부호 is almost 6 km.
      maxGapKm: 6,
      stations: "설화명곡 화원 대곡 진천 월배 상인 월촌 송현 서부정류장 대명 안지랑 현충로 영대병원 교대 명덕 반월당 중앙로 대구역 칠성시장 신천 동대구역 동구청 아양교 동촌 해안 방촌 용계 율하 신기 반야월 각산 안심 대구한의대병원 부호 하양".split(" "),
    },
    {
      key: "대구 2호선",
      kakao: "대구2호선",
      maxGapKm: 3,
      stations: "문양 다사 대실 강창 계명대 성서산업단지 이곡 용산 죽전 감삼 두류 내당 반고개 청라언덕 반월당 경대병원 대구은행 범어 수성구청 만촌 담티 연호 수성알파시티 고산 신매 사월 정평 임당 영남대".split(" "),
    },
    {
      key: "대구 3호선",
      kakao: "대구3호선",
      maxGapKm: 2.5,
      stations: "칠곡경대병원 학정 팔거 동천 칠곡운암 구암 태전 매천 매천시장 팔달 공단 만평 팔달시장 원대 북구청 달성공원 서문시장 청라언덕 남산 명덕 건들바위 대봉교 수성시장 수성구민운동장 어린이세상 황금 수성못 지산 범물 용지".split(" "),
    },
  ],
  gwangju: [
    {
      key: "광주 1호선",
      kakao: "광주1호선",
      maxGapKm: 3,
      stations: "녹동 소태 학동·증심사입구 남광주 문화전당 금남로4가 금남로5가 양동시장 돌고개 농성 화정 쌍촌 운천 상무 김대중컨벤션센터 공항 송정공원 광주송정 도산 평동".split(" "),
    },
  ],
  daejeon: [
    {
      key: "대전 1호선",
      kakao: "대전1호선",
      maxGapKm: 3,
      stations: "판암 신흥 대동 대전역 중앙로 중구청 서대전네거리 오룡 용문 탄방 시청 정부청사 갈마 월평 갑천 유성온천 구암 현충원 월드컵경기장 노은 지족 반석".split(" "),
    },
  ],
};

interface Doc {
  place_name: string;
  category_name: string;
  x: string;
  y: string;
}

let calls = 0;
async function search(query: string): Promise<Doc[]> {
  const file = path.join(CACHE, `${encodeURIComponent(query)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Doc[];
  calls++;
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&category_group_code=SW8&size=15`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (!r.ok) throw new Error(`Kakao ${r.status}: ${await r.text()}`);
  const docs = ((await r.json()) as { documents?: Doc[] }).documents ?? [];
  writeFileSync(file, JSON.stringify(docs));
  await new Promise((res) => setTimeout(res, 60));
  return docs;
}

/** Hangul and digits only — "경성대.부경대역" and "경성대·부경대" are the same name. */
const bare = (s: string): string => s.replace(/역$/, "").replace(/[^가-힣0-9]/g, "");

/** A station on a line, as Kakao files it — or undefined, which stops the build. */
async function locate(name: string, line: LineSpec): Promise<{ lat: number; lng: number } | undefined> {
  const query = name.endsWith("역") ? `${name} ${line.kakao}` : `${name}역 ${line.kakao}`;
  const tries = [query, name.endsWith("역") ? name : `${name}역`];
  for (const q of tries) {
    const docs = await search(q);
    const hit = docs.find((d) => {
      const lineOf = d.category_name.split(">").pop()!.trim();
      const station = d.place_name.replace(new RegExp(`\\s*${line.kakao}.*$`), "").trim();
      return lineOf === line.kakao && bare(station) === bare(name);
    });
    if (hit) return { lat: Number(hit.y), lng: Number(hit.x) };
  }
  return undefined;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The English names on the signs, where they are not simply the romanised
 * Korean — "Bekseuko" is BEXCO, "Yuseongoncheon" is Yuseong Spa. Keyed by
 * network, because Busan's 교대 and Daegu's 교대 are different universities.
 */
const SIGNED: Record<string, Record<string, string>> = {
  busan: {
    부산역: "Busan Station",
    시청: "City Hall",
    벡스코: "BEXCO",
    센텀시티: "Centum City",
    센텀: "Centum",
    "경성대·부경대": "Kyungsung Univ.·Pukyong Nat'l Univ.",
    부산대: "Pusan Nat'l Univ.",
    교대: "Busan Nat'l Univ. of Education",
    "국제금융센터·부산은행": "BIFC·Busan Bank",
    종합운동장: "Sports Complex",
    체육공원: "Sports Park",
    강서구청: "Gangseo-gu Office",
    공항: "Airport",
    김해시청: "Gimhae City Hall",
    수로왕릉: "Tomb of King Suro",
    박물관: "Gimhae National Museum",
    연지공원: "Yeonji Park",
    가야대: "Gaya Univ.",
    인제대: "Inje Univ.",
    김해대학: "Gimhae College",
    영산대: "Youngsan Univ.",
    동의대: "Dong-eui Univ.",
    부산대양산캠퍼스: "Pusan Nat'l Univ. Yangsan Campus",
    오시리아: "OSIRIA",
    다대포해수욕장: "Dadaepo Beach",
    반여농산물시장: "Banyeo Agricultural Market",
  },
  daegu: {
    동대구역: "Dongdaegu Station",
    대구역: "Daegu Station",
    서부정류장: "Seobu Bus Terminal",
    영대병원: "Yeungnam Univ. Medical Center",
    교대: "Daegu Nat'l Univ. of Education",
    경대병원: "Kyungpook Nat'l Univ. Hospital",
    칠곡경대병원: "Chilgok KNU Hospital",
    대구은행: "DGB",
    계명대: "Keimyung Univ.",
    영남대: "Yeungnam Univ.",
    수성구청: "Suseong-gu Office",
    수성알파시티: "Suseong Alpha City",
    대구한의대병원: "Daegu Haany Univ. Hospital",
    칠성시장: "Chilseong Market",
    서문시장: "Seomun Market",
    팔달시장: "Paldal Market",
    매천시장: "Maecheon Market",
    수성시장: "Suseong Market",
    달성공원: "Dalseong Park",
    수성못: "Suseongmot (Suseong Lake)",
    어린이세상: "Children's World",
    수성구민운동장: "Suseong Stadium",
    북구청: "Buk-gu Office",
    동구청: "Dong-gu Office",
    성서산업단지: "Seongseo Industrial Complex",
  },
  gwangju: {
    문화전당: "Asia Culture Center",
    광주송정: "Gwangju Songjeong Station",
    김대중컨벤션센터: "Kim Dae-jung Convention Center",
    "학동·증심사입구": "Hakdong·Jeungsimsa Temple",
    양동시장: "Yangdong Market",
    송정공원: "Songjeong Park",
    공항: "Airport",
  },
  daejeon: {
    대전역: "Daejeon Station",
    시청: "City Hall",
    정부청사: "Government Complex-Daejeon",
    유성온천: "Yuseong Spa",
    현충원: "National Cemetery",
    월드컵경기장: "World Cup Stadium",
    중구청: "Jung-gu Office",
    서대전네거리: "Seodaejeon Negeori",
  },
};

/** "Seomyeon", "Gyeongseongdae·Bugyeongdae" — the romanised name, each part capitalised. */
function english(ko: string): string {
  return ko
    .replace(/역$/, "")
    .split("·")
    .map((part) => romanizeHangul(part).replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()))
    .join("·");
}

const problems: string[] = [];
const out: Record<string, unknown> = {};
for (const [id, lines] of Object.entries(NETWORKS)) {
  const stations: { c: string; k: string; e: string; l: string; lat: number; lng: number }[] = [];
  const edges: [string, string][] = [];
  for (const [li, line] of lines.entries()) {
    let prev: (typeof stations)[number] | undefined;
    for (const [si, name] of line.stations.entries()) {
      const at = await locate(name, line);
      if (!at) {
        problems.push(`${id} ${line.key}: "${name}" not found under ${line.kakao}`);
        prev = undefined;
        continue;
      }
      const s = { c: `${id}-${li + 1}-${String(si + 1).padStart(2, "0")}`, k: name, e: SIGNED[id]?.[name] ?? english(name), l: line.key, ...at };
      if (prev) {
        const gap = km(prev, s);
        if (gap > line.maxGapKm) problems.push(`${id} ${line.key}: ${prev.k} → ${s.k} is ${gap.toFixed(1)} km apart`);
        edges.push([prev.c, s.c]);
      }
      stations.push(s);
      prev = s;
    }
  }
  // Transfers: the same name on two lines, a short walk apart — Busan's 좌천 on
  // Line 1 and on the Donghae Line share a name and are 20 km apart.
  const transfers: [string, string][] = [];
  for (const a of stations)
    for (const b of stations)
      if (a.c < b.c && a.l !== b.l && bare(a.k) === bare(b.k) && km(a, b) < 0.8) transfers.push([a.c, b.c]);
  out[id] = { stations, edges, transfers };
  console.log(`${id}: ${stations.length} stations on ${lines.length} lines, ${edges.length} links, ${transfers.length} transfers`);
}
console.log(`Kakao calls this run: ${calls}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s) — nothing written:\n${problems.join("\n")}`);
  process.exit(1);
}
writeFileSync("src/lib/data/regionalSubway.json", JSON.stringify(out));
console.log("wrote src/lib/data/regionalSubway.json");
