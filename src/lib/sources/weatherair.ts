/**
 * Weather + air quality — powers getWeatherAndAir.
 *
 * Two data.go.kr sources, both on ENV.BUS_API_KEY (one account key covers all
 * data.go.kr APIs we activated):
 *   - KMA short-term forecast (VilageFcstInfoService_2.0/getVilageFcst): needs a
 *     Lambert grid (nx,ny), not lat/lng — we keep a small table for major cities.
 *   - AirKorea by-province realtime (ArpltnInforInqireSvc): PM10/PM2.5 by sido.
 *
 * Real-time air quality + live forecast is exactly the foreigner-relevant,
 * structured signal a plain LLM can't fetch — and fine dust matters a lot here.
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

const KMA_BASE = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const AIR_BASE = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

export interface CityGeo {
  nx: number;
  ny: number;
  sido: string; // AirKorea sidoName
  label: string;
}

/** KMA grid (nx,ny) + AirKorea sido for major cities. */
export const CITIES: Record<string, CityGeo> = {
  seoul: { nx: 60, ny: 127, sido: "서울", label: "Seoul" },
  busan: { nx: 98, ny: 76, sido: "부산", label: "Busan" },
  incheon: { nx: 55, ny: 124, sido: "인천", label: "Incheon" },
  daegu: { nx: 89, ny: 90, sido: "대구", label: "Daegu" },
  daejeon: { nx: 67, ny: 100, sido: "대전", label: "Daejeon" },
  gwangju: { nx: 58, ny: 74, sido: "광주", label: "Gwangju" },
  ulsan: { nx: 102, ny: 84, sido: "울산", label: "Ulsan" },
  sejong: { nx: 66, ny: 103, sido: "세종", label: "Sejong" },
  jeju: { nx: 52, ny: 38, sido: "제주", label: "Jeju" },
  suwon: { nx: 60, ny: 121, sido: "경기", label: "Suwon" },
  gangneung: { nx: 92, ny: 131, sido: "강원", label: "Gangneung" },
  jeonju: { nx: 63, ny: 89, sido: "전북", label: "Jeonju" },
  gyeongju: { nx: 100, ny: 91, sido: "경북", label: "Gyeongju" },
};

const KO_ALIAS: Record<string, string> = {
  서울: "seoul", 부산: "busan", 인천: "incheon", 대구: "daegu", 대전: "daejeon",
  광주: "gwangju", 울산: "ulsan", 세종: "sejong", 제주: "jeju", 수원: "suwon",
  강릉: "gangneung", 전주: "jeonju", 경주: "gyeongju",
};

/** Resolve a city name (English or Korean) to its geo entry. Defaults to Seoul. */
export function resolveCity(name?: string): CityGeo {
  const raw = (name ?? "").trim().toLowerCase();
  if (!raw) return CITIES.seoul;
  if (CITIES[raw]) return CITIES[raw];
  const ko = KO_ALIAS[(name ?? "").trim()];
  if (ko && CITIES[ko]) return CITIES[ko];
  const hit = Object.values(CITIES).find((c) => c.label.toLowerCase() === raw);
  return hit ?? CITIES.seoul;
}

// ---------- Weather ----------

export interface Weather {
  tempC?: number;
  sky?: string;
  precip?: string;
  rainProb?: number;
  when?: string;
}

const SKY: Record<string, string> = { "1": "Clear", "3": "Partly cloudy", "4": "Cloudy" };
const PTY: Record<string, string> = { "0": "", "1": "Rain", "2": "Rain/Snow", "3": "Snow", "4": "Showers", "5": "Drizzle", "6": "Drizzle/Snow", "7": "Snow flurries" };

interface FcstItem {
  category?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
}

/** Pick the earliest forecast slot and extract TMP/SKY/PTY/POP. */
export function parseWeather(items: FcstItem[]): Weather {
  if (!Array.isArray(items) || items.length === 0) return {};
  const key = (it: FcstItem) => `${it.fcstDate ?? ""}${it.fcstTime ?? ""}`;
  const earliest = items.reduce((min, it) => (key(it) < min ? key(it) : min), key(items[0]));
  const slot = items.filter((it) => key(it) === earliest);
  const val = (cat: string) => slot.find((it) => it.category === cat)?.fcstValue;
  const tmp = val("TMP");
  const sky = val("SKY");
  const pty = val("PTY");
  const pop = val("POP");
  return {
    tempC: tmp != null && tmp !== "" ? Number(tmp) : undefined,
    sky: sky != null ? SKY[sky] : undefined,
    precip: pty != null && PTY[pty] ? PTY[pty] : undefined,
    rainProb: pop != null && pop !== "" ? Number(pop) : undefined,
    when: earliest ? `${earliest.slice(0, 8)} ${earliest.slice(8, 10)}:00` : undefined,
  };
}

const weatherCache = new TtlCache<Weather>(30 * 60_000);

/** KMA base_date/base_time: latest published slot in KST (10-min buffer). */
function baseSlot(): { date: string; time: string } {
  const k = new Date(Date.now() + 9 * 3600_000); // KST wall clock via UTC getters
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const slot = slots.find((s) => mins >= s * 60 + 10);
  if (slot === undefined) {
    const y = new Date(k.getTime() - 24 * 3600_000);
    return { date: ymd(y), time: "2300" };
  }
  return { date: ymd(k), time: String(slot).padStart(2, "0") + "00" };
}

export async function getWeather(city: CityGeo): Promise<Weather> {
  return weatherCache.getOrLoad(`w:${city.nx},${city.ny}`, async () => {
    const { date, time } = baseSlot();
    const sp = new URLSearchParams({
      serviceKey: ENV.BUS_API_KEY,
      dataType: "JSON",
      numOfRows: "300",
      pageNo: "1",
      base_date: date,
      base_time: time,
      nx: String(city.nx),
      ny: String(city.ny),
    });
    const json = await fetchJson<{ response?: { body?: { items?: { item?: FcstItem[] } } } }>(`${KMA_BASE}?${sp}`);
    return parseWeather(json.response?.body?.items?.item ?? []);
  });
}

// ---------- Air quality ----------

export interface Air {
  pm10?: number;
  pm25?: number;
  grade: string;
  advisory: string;
  dataTime?: string;
  stations: number;
}

interface AirItem {
  pm10Value?: string;
  pm25Value?: string;
  dataTime?: string;
}

const GRADES = ["Good", "Moderate", "Unhealthy", "Very unhealthy"];
const ADVISORY = [
  "Great air — enjoy the outdoors.",
  "Air is okay for most activities.",
  "Sensitive groups should limit time outside; a mask helps.",
  "Avoid prolonged outdoor activity and wear a KF mask.",
];

/** Korean PM breakpoints → 0..3 grade index. */
function pm10Grade(v: number): number {
  return v <= 30 ? 0 : v <= 80 ? 1 : v <= 150 ? 2 : 3;
}
function pm25Grade(v: number): number {
  return v <= 15 ? 0 : v <= 35 ? 1 : v <= 75 ? 2 : 3;
}

const num = (s?: string): number | undefined => {
  if (s == null || s === "" || s === "-") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const avg = (xs: number[]): number | undefined =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined;

/** Aggregate by-station readings into a city-wide PM10/PM2.5 + worst grade. */
export function parseAir(items: AirItem[]): Air {
  const arr = Array.isArray(items) ? items : [];
  const pm10s = arr.map((i) => num(i.pm10Value)).filter((n): n is number => n != null);
  const pm25s = arr.map((i) => num(i.pm25Value)).filter((n): n is number => n != null);
  const pm10 = avg(pm10s);
  const pm25 = avg(pm25s);
  const grades = [pm10 != null ? pm10Grade(pm10) : -1, pm25 != null ? pm25Grade(pm25) : -1];
  const gi = Math.max(0, ...grades);
  return {
    pm10,
    pm25,
    grade: GRADES[gi],
    advisory: ADVISORY[gi],
    dataTime: arr.find((i) => i.dataTime)?.dataTime,
    stations: Math.max(pm10s.length, pm25s.length),
  };
}

const airCache = new TtlCache<Air>(20 * 60_000);

export async function getAir(city: CityGeo): Promise<Air> {
  return airCache.getOrLoad(`a:${city.sido}`, async () => {
    const sp = new URLSearchParams({
      serviceKey: ENV.BUS_API_KEY,
      returnType: "json",
      numOfRows: "100",
      pageNo: "1",
      sidoName: city.sido,
      ver: "1.0",
    });
    const json = await fetchJson<{ response?: { body?: { items?: AirItem[] } } }>(`${AIR_BASE}?${sp}`);
    return parseAir(json.response?.body?.items ?? []);
  });
}
