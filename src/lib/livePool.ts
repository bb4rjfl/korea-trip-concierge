/**
 * A live candidate pool for the course builder.
 *
 * The recommender used to compose from about seventy hand-written spots, which
 * is why asking for another course returned the same one: with four time blocks
 * and a dozen candidates per block there was nothing else to give. A visitor
 * noticed immediately — "this isn't a recommendation, it's one itinerary you
 * push no matter what I say".
 *
 * The city's own tourism data already holds hundreds of places per category,
 * translated, categorised and updated by the venues. This turns that into the
 * same shape the course engine already uses, so the curated spots stay as the
 * quality floor and the live entries widen the field behind them.
 *
 * Fetched once per city and cached for hours — tourism content is not live data,
 * and a course must not wait on eleven API calls.
 */

import { TtlCache } from "./cache.js";
import { getSeoulDetail, searchSeoulContent, VS_CATEGORY, type SeoulContent } from "./sources/visitseoul.js";
import { searchPlacesNearby, type Place } from "./sources/tourapi.js";
import { hasKey } from "./env.js";
import type { Spot } from "./courses.js";

const pool = new TtlCache<Spot[]>(6 * 60 * 60_000);

/** Coarse zones, by the districts their addresses name. */
const SEOUL_ZONES: [RegExp, string, string][] = [
  [/종로|Jongno|Insadong|Bukchon|Gwanghwamun|Ikseon|Seochon/i, "old-north", "Jongno"],
  [/중구|Jung-gu|Myeongdong|Euljiro|Namdaemun|Dongdaemun/i, "downtown", "Jung-gu"],
  [/마포|Mapo|Hongdae|Yeonnam|Mangwon|Sangam/i, "west", "Mapo"],
  [/서대문|Seodaemun|Sinchon/i, "west", "Seodaemun"],
  [/용산|Yongsan|Itaewon|Hannam|Ichon/i, "yongsan", "Yongsan"],
  [/성동|Seongdong|Seongsu|Ttukseom/i, "east", "Seongsu"],
  [/광진|Gwangjin|Konkuk/i, "east", "Gwangjin"],
  [/강남|Gangnam|Sinsa|Apgujeong|Samseong|Cheongdam/i, "south", "Gangnam"],
  [/서초|Seocho|Banpo/i, "south", "Seocho"],
  [/송파|Songpa|Jamsil/i, "south", "Songpa"],
  [/영등포|Yeongdeungpo|Yeouido/i, "central", "Yeouido"],
  // The eleven districts above covered the tourist core and left a third of the
  // live pool with zone "any" — and an unplaceable stop qualifies for every part
  // of the city, which is how a day ran Seongsu → Noryangjin → Nowon. The rest of
  // Seoul's twenty-five gu, plus the neighbourhood and landmark names that
  // actually appear in venue titles, place most of what was left.
  [/동대문구|Dongdaemun-gu|Cheongnyangni|Hoegi|Jegi/i, "east", "Dongdaemun-gu"],
  [/성북|Seongbuk|Seongsin|Anam|Bomun/i, "north", "Seongbuk"],
  [/강북구|Gangbuk|Suyu|Mia|Bukhansan/i, "north", "Gangbuk"],
  [/도봉|Dobong|Ssangmun|Chang-dong/i, "north", "Dobong"],
  [/노원|Nowon|Sanggye|Junggye|Hwarangdae/i, "north", "Nowon"],
  [/중랑|Jungnang|Myeonmok|Yongmasan/i, "north", "Jungnang"],
  [/은평|Eunpyeong|Yeonsinnae|Bulgwang/i, "northwest", "Eunpyeong"],
  [/강동|Gangdong|Cheonho|Amsa|Godeok/i, "east", "Gangdong"],
  [/동작|Dongjak|Noryangjin|Sadang|Heukseok/i, "southwest", "Dongjak"],
  [/관악|Gwanak|Sillim|Seoul National University/i, "southwest", "Gwanak"],
  [/강서|Gangseo|Gayang|Magok|Balsan|Gimpo Airport/i, "southwest", "Gangseo"],
  [/양천|Yangcheon|Mok-?dong|Sinjeong/i, "southwest", "Yangcheon"],
  [/구로|Guro|Sindorim|Gasan/i, "southwest", "Guro"],
  [/금천|Geumcheon|Doksan/i, "southwest", "Geumcheon"],
  // Landmarks last, so a district name in the same string still wins. Venue
  // titles rarely name a gu — "Gyeongbokgung Palace Jibokjae" and "Jongmyo
  // Shrine Stonewall Path" are unmistakably Jongno to a reader and were zone
  // "any" to us.
  [/Gyeongbokgung|Changdeokgung|Changgyeonggung|Jongmyo|Gwanghwamun|Cheong Wa Dae|Inwangsan|Naksan|경복궁|창덕궁|종묘/i, "old-north", "Jongno"],
  [/Deoksugung|Cheonggyecheon|Namdaemun|Sungnyemun|Seoul Plaza|DDP|Dongdaemun Design/i, "downtown", "Jung-gu"],
  [/Namsan|N Seoul Tower|남산/i, "central", "Namsan"],
  [/War Memorial|Yongsan Family Park|Noksapyeong/i, "yongsan", "Yongsan"],
  [/Olympic Park|Lotte World|Seokchon/i, "south", "Songpa"],
  [/COEX|Bongeunsa|Seonjeongneung/i, "south", "Gangnam"],
  [/Seoul Forest|Ttukseom|Achasan/i, "east", "Seongsu"],
  [/World Cup Stadium|Haneul Park|Nanjicheon/i, "west", "Mapo"],
  [/63 (?:Building|Square)|Saetgang|Bamseom/i, "central", "Yeouido"],
];

/** Category path → the themes the course engine scores on. */
const THEME_RULES: [RegExp, string[]][] = [
  [/palace|history|heritage|temple|shrine|hanok|traditional|고궁|역사|사찰/i, ["history", "photo"]],
  [/museum|gallery|art|exhibition|cultural|박물관|미술관|전시/i, ["experience", "photo"]],
  [/park|garden|mountain|river|forest|trail|nature|공원|산|숲/i, ["nature", "view"]],
  [/market|시장/i, ["market", "food"]],
  [/mall|department|shopping|duty.?free|백화점|쇼핑/i, ["shopping"]],
  [/cafe|café|dessert|bakery|카페/i, ["cafe"]],
  [/restaurant|cuisine|food|dining|맛집|음식/i, ["food"]],
  [/bar|pub|club|night|nightlife|주점|야경/i, ["nightlife", "view"]],
  [/observatory|tower|view|전망/i, ["view", "photo"]],
  [/theme ?park|zoo|aquarium|kids|family|테마파크|아쿠아리움/i, ["family", "experience"]],
  [/experience|workshop|class|craft|hanbok|체험|공방/i, ["experience"]],
  [/spa|jjimjilbang|sauna|wellness|beauty|찜질방|뷰티/i, ["beauty", "experience"]],
];

/** Best time of day, inferred from what the place is. */
function blocksFor(themes: string[]): Spot["blocks"] {
  if (themes.includes("nightlife")) return ["evening"];
  if (themes.includes("history") || themes.includes("nature")) return ["morning", "afternoon"];
  if (themes.includes("view")) return ["afternoon", "evening"];
  if (themes.includes("food") || themes.includes("market")) return ["afternoon", "evening"];
  return ["afternoon"];
}

function themesFor(text: string): string[] {
  const found = new Set<string>();
  for (const [re, ts] of THEME_RULES) if (re.test(text)) ts.forEach((t) => found.add(t));
  return found.size ? [...found] : ["experience"];
}

function zoneFor(text: string): { zone: string; area: string } {
  for (const [re, zone, area] of SEOUL_ZONES) if (re.test(text)) return { zone, area };
  return { zone: "any", area: "Seoul" };
}

/**
 * Titles that are not somewhere you can put on an itinerary.
 *
 * The tourism feed mixes places with what is *happening* in them, so a raw pool
 * offered "Photographer Kang Jae-gu Solo Exhibition" and "2027 S/S Seoul Fashion
 * Week" as stops on a day out — things that will have ended by the time anyone
 * reads the course. Dated events belong on the festival card, not here.
 *
 * It also keeps medical businesses out. The feed lists cosmetic clinics as
 * tourism content, and a family asking for a cheap day with a grandmother was
 * handed "SYNERGY Plastic Surgery" as an evening stop. Beyond being absurd as an
 * itinerary, routing anyone to a named clinic is exactly the medical-advertising
 * line this service does not cross (see D-025).
 *
 * Last, chain outlets and showrooms. A packed family day came back with
 * "Nabijam Massage Chair Gwanghwamun Signature Branch" as its afternoon and a
 * character-goods shop called "Nagano Market SEOUL" as its evening — retail the
 * feed carries because it is registered, not because anyone would plan around it.
 * A named branch of a chain is the clearest signal: destinations rarely have one.
 */
const NOT_A_STOP =
  /exhibition|exhibit\b|fanfest|fan ?meet|concert|festival|fashion week|biennale|showcase|special ?show|screening|기획전|특별전|전시회|콘서트|페스티벌|ticket|reservation|package|coupon|voucher|rental|delivery|storage|locker|pharmacy|drug ?store|drugstore|clinic|hospital|dental|surgery|surgical|plastic surg|dermatolog|aesthetic|medical|oriental medicine|한의원|의원|성형|피부과|치과|academy|office|예약|쿠폰|렌탈|보관|약국|병원|massage chair|안마의자|showroom|signature branch|\bbranch\b|지점|character (?:store|goods|shop)|캐릭터 ?(?:샵|스토어)|phone ?case|nail ?shop|convenience store|편의점|\b20\d\d\b|《|》|<[^>]{4,}>|^[^:]{3,44}\s?:\s/i;

/**
 * Medical businesses hide in the blurb rather than the title — "Seoul Yangnyeong
 * Market is one of the most famous oriental medicine markets in Korea" arrived as
 * a family's lunch stop. Only the medical words are worth reading the whole
 * summary for; testing it against the full filter would throw away any place
 * whose description happens to mention a hospital nearby.
 */
const MEDICAL_ANYWHERE = /oriental medicine|traditional medicine|plastic surg|cosmetic surg|dermatolog|한의|성형외과/i;

/**
 * Shops whose title hides what they are. "Nagano Market SEOUL" reads as a market
 * and was picked as the evening food stop; the blurb says it is a character-goods
 * store. The title lies, the description does not.
 */
const RETAIL_IN_BLURB = /character (?:store|goods|shop)|goods (?:store|shop)|massage chair|showroom|flagship store|캐릭터|안마의자/i;

/**
 * A run that ends. "Louis Vuitton Visionary Journeys Seoul" carries no word the
 * title filter recognises and was offered to a family with a five-year-old as a
 * stop on their day; the description is unambiguous that it is a show with dates.
 */
const EVENT_IN_BLURB = /\bexhibition\b|\bexhibits?\b|on (?:view|display) (?:until|through)|runs? (?:until|through)|pop-?up store|limited-time|기간 한정|전시(?:회|장)?|팝업/i;

function fromSeoul(c: SeoulContent, i: number): Spot | undefined {
  const title = (c.title ?? "").trim();
  if (!title || NOT_A_STOP.test(`${title} ${c.categoryPath ?? ""}`)) return undefined;
  if (MEDICAL_ANYWHERE.test(`${title} ${c.summary ?? ""}`)) return undefined;
  if (RETAIL_IN_BLURB.test(`${title} ${c.summary ?? ""}`)) return undefined;
  if (EVENT_IN_BLURB.test(`${title} ${c.summary ?? ""}`)) return undefined;
  // Themes come from what the place IS — its category and its name. Reading them
  // out of the blurb instead gave a children's play centre a nightlife theme,
  // because the description happened to mention the evening, and it turned up as
  // a couple's dinner stop.
  const label = `${title} ${c.categoryPath ?? ""}`;
  const byLabel = themesFor(label);
  const themes = byLabel.length && byLabel[0] !== "experience" ? byLabel : themesFor(`${label} ${c.summary ?? ""}`);
  const { zone, area } = zoneFor(`${label} ${c.summary ?? ""}`);
  return {
    id: `vs_${c.cid || i}`,
    name: title,
    area,
    zone,
    themes,
    blocks: blocksFor(themes),
    note: trimBlurb(c.summary ?? ""),
  };
}

/**
 * A blurb that stops mid-word ("divided into three different spaces: a charact")
 * reads like a broken page. Prefer the end of a sentence, then the end of a word.
 */
function trimBlurb(raw: string, max = 160): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentence > max * 0.5) return window.slice(0, sentence + 1);
  const word = window.lastIndexOf(" ");
  return `${(word > 0 ? window.slice(0, word) : window).replace(/[,;:]$/, "")}…`;
}

function fromTour(p: Place, i: number): Spot | undefined {
  const title = (p.title ?? "").trim();
  if (!title || NOT_A_STOP.test(title)) return undefined;
  const hay = `${title} ${p.address ?? ""}`;
  const themes = themesFor(hay);
  const { zone, area } = zoneFor(hay);
  return {
    id: `ta_${p.contentId ?? i}`,
    name: title,
    area,
    zone,
    themes,
    blocks: blocksFor(themes),
    note: "",
    // The feed already carries these; not using them was leaving the day to be
    // planned on district-name string matching when we had the actual point.
    lat: p.mapy,
    lng: p.mapx,
  };
}

/**
 * Where we sweep from. One city-centre anchor returned everything within a
 * kilometre of City Hall and nothing else, which is not a city — these are the
 * neighbourhoods a visitor actually spends a day in, and sweeping each of them
 * gives both the volume and the spread across town that a varied course needs.
 */
const ANCHORS: Record<string, { lat: number; lng: number }[]> = {
  Seoul: [
    { lat: 37.5759, lng: 126.9769 }, // Gwanghwamun
    { lat: 37.5636, lng: 126.9827 }, // Myeongdong
    { lat: 37.5563, lng: 126.9236 }, // Hongdae
    { lat: 37.5345, lng: 126.9946 }, // Itaewon
    { lat: 37.4979, lng: 127.0276 }, // Gangnam
    { lat: 37.5133, lng: 127.1028 }, // Jamsil
    { lat: 37.5445, lng: 127.0557 }, // Seongsu
    { lat: 37.5219, lng: 126.9245 }, // Yeouido
  ],
  Busan: [
    { lat: 35.1587, lng: 129.1604 }, // Haeundae
    { lat: 35.1577, lng: 129.0594 }, // Seomyeon
    { lat: 35.0975, lng: 129.0306 }, // Nampo
  ],
  Jeju: [
    { lat: 33.4996, lng: 126.5312 }, // Jeju City
    { lat: 33.2542, lng: 126.5601 }, // Seogwipo
  ],
};

/** One retry, because the tourism endpoint answers an empty body under load. */
async function withRetry<T>(run: () => Promise<T[]>): Promise<T[]> {
  const first = await run().catch(() => [] as T[]);
  if (first.length) return first;
  await new Promise((r) => setTimeout(r, 250));
  return run().catch(() => [] as T[]);
}

/**
 * Everything we can offer in a city, beyond the curated spots.
 *
 * Failure here is not an error: the curated pool alone still produces a course,
 * so a slow or missing source quietly narrows the field instead of breaking it.
 */
export async function livePool(city: string): Promise<Spot[]> {
  const key = `pool:${city}`;
  const hit = pool.get(key);
  if (hit !== undefined) return hit;
  const { spots, degraded } = await buildPool(city);
  // Place the ones the list endpoint could not. This runs behind the answer
  // rather than in front of it: the first course after a cold start is built on
  // zones as before, and by the next one the same cached array carries real
  // coordinates, because the objects are enriched in place.
  void locate(spots);
  // A source that was merely rate-limited when we happened to build the pool
  // should not narrow the whole afternoon. TourAPI's development quota runs out
  // on a busy day and answers 429 for a while; caching that half-pool for six
  // hours turns a passing outage into the rest of the day.
  pool.set(key, spots, degraded ? 20 * 60_000 : undefined);
  return spots;
}

/** Guards against two pool builds enriching the same entries at once. */
let locating = false;

/**
 * Fill in coordinates for candidates the list endpoint gave us without one.
 *
 * VisitSeoul's list response carries no address, so more than half the pool had
 * no location at all and the day had to be planned by comparing district names.
 * The detail endpoint has the point — it is just one call per place, which is
 * far too slow to do before answering (about a hundred seconds for a full pool)
 * and perfectly fine to do behind the answer, once, for a pool that then lives
 * for six hours.
 *
 * Entries are mutated in place, so the array already handed to the cache — and
 * to any course built from it — picks the coordinates up as they arrive.
 */
async function locate(spots: Spot[]): Promise<void> {
  if (locating || !hasKey("VISITSEOUL_API_KEY")) return;
  locating = true;
  try {
    const todo = spots.filter((s) => s.id.startsWith("vs_") && s.lat == null);
    // Strictly one at a time. Four lanes located 39 of 203: the endpoint answers
    // concurrent detail calls with a 500, exactly as it answers concurrent list
    // calls with an empty body. Nothing is waiting on this, so slow is free.
    for (const spot of todo) {
      const cid = spot.id.slice(3);
      let detail = await getSeoulDetail(cid).catch(() => undefined);
      if (!detail) {
        await new Promise((r) => setTimeout(r, 300));
        detail = await getSeoulDetail(cid).catch(() => undefined);
      }
      if (!detail) continue;
      if (detail.lat != null && detail.lng != null) {
        spot.lat = detail.lat;
        spot.lng = detail.lng;
      }
      // The address names the district, which is what the zone reader wanted all
      // along — the list endpoint simply never carried one.
      if (spot.zone === "any" && detail.address) {
        const { zone, area } = zoneFor(`${detail.address} ${spot.name}`);
        if (zone !== "any") {
          spot.zone = zone;
          spot.area = area;
        }
      }
      // The line and exit are the single most useful thing we can tell someone
      // holding a place name, and the same call already carries them. Kept apart
      // from the blurb so a card can show it without losing the reason to go.
      if (detail.subway) spot.access = detail.subway.replace(/\s+/g, " ").trim();
    }
  } finally {
    locating = false;
  }
}

async function buildPool(city: string): Promise<{ spots: Spot[]; degraded: boolean }> {
  {
    const out: Spot[] = [];
    const seen = new Set<string>();
    const add = (s?: Spot): void => {
      if (!s) return;
      const key = s.name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(s);
    };

    if (city === "Seoul" && hasKey("VISITSEOUL_API_KEY")) {
      // Sequential: firing all eight categories at once made the endpoint answer
      // several of them with an empty body, and a pool of thirty is no pool.
      // Culture and Museum list what is *showing*, not where — a pool built from
      // them offered "KAWS: FRIENDS AND NEIGHBORS" as a stop on a day out. The
      // categories below are venues, which is what an itinerary needs.
      for (const category of [
        VS_CATEGORY.history,
        VS_CATEGORY.nature,
        VS_CATEGORY.shopping,
        VS_CATEGORY.experience,
        VS_CATEGORY.market,
        VS_CATEGORY.themepark,
      ]) {
        const batch = await withRetry(() =>
          searchSeoulContent({ category, keyword: "", language: "en", limit: 50 }),
        );
        batch.forEach((c, i) => add(fromSeoul(c, i)));
      }
    }

    const anchors = ANCHORS[city] ?? [];
    const wantsTour = hasKey("TOUR_API_KEY") && anchors.length > 0;
    let tourCalls = 0;
    let tourEmpty = 0;
    for (const anchor of anchors) {
      if (!wantsTour) break;
      // Thirty-two calls per cold build is what exhausts the daily quota in the
      // first place. Once several sweeps in a row come back with nothing, the
      // key is spent — keep going and we simply burn tomorrow's allowance too.
      if (tourEmpty >= 4) break;
      for (const category of ["attraction", "culture", "shopping", "food"]) {
        const batch = await withRetry(() =>
          searchPlacesNearby({ ...anchor, radius: 3000, category, limit: 30, language: "en" }),
        );
        tourCalls++;
        if (!batch.length) tourEmpty++;
        batch.forEach((p, i) => add(fromTour(p, i)));
      }
    }

    return { spots: out, degraded: wantsTour && tourCalls > 0 && tourEmpty === tourCalls };
  }
}
