/**
 * Curated opening-hours overlay for the iconic landmarks foreign visitors ask
 * about most (C7). TourAPI indexes these poorly ("Han River" → a hotel, "Lotte
 * World" → a mall counter) and rarely returns real opening hours, so getNowInfo
 * can't give its headline promise — a crisp "open now / closed now" verdict.
 *
 * This is curated reference data (our value-add), not external grounding: it's
 * Kakao-rule-safe, instant (no API call, protects p99), and works even when the
 * TourAPI key isn't configured. getNowInfo fuzzy-matches the query here FIRST and
 * falls through to TourAPI for the long tail.
 *
 * Hours are accurate well-known values; seasonal/variable ones are marked `approx`
 * and the human label carries the nuance ("~", "varies seasonally"). All times are
 * Korea time (KST). Days of week follow JS convention (0 = Sunday … 6 = Saturday).
 */

import { resolveName, rankCandidates } from "./fuzzy.js";

/** An open window within a single day, in minutes-of-day (09:00 = 540). */
export interface Interval {
  open: number;
  close: number;
}

/**
 * How a landmark "opens":
 *  - "24h": always open (riverside parks, lit streams).
 *  - "daylight": open-air / residential — no fixed gate, best seen by day.
 *  - "sunrise": a sunrise spot, open roughly dawn → dusk.
 *  - Interval[]: explicit gated hours (most attractions).
 */
export type HourSpec = "24h" | "daylight" | "sunrise" | Interval[];

export interface Landmark {
  /** Canonical English display name. */
  name: string;
  /** Match keys (English + Korean + common variants), matched case-insensitively. */
  aliases: string[];
  /** Machine-readable hours driving the open/closed verdict. */
  hours: HourSpec;
  /** Human label shown to the visitor (carries seasonal nuance). */
  hoursLabel: string;
  /** Weekdays the place is closed (0 = Sun … 6 = Sat). */
  closedDays?: number[];
  /** Human label for the closed days, e.g. "Tuesdays". */
  closedLabel?: string;
  /** One-line visitor note. */
  note: string;
  /** Hours are seasonal/variable — verdict is a best estimate. */
  approx?: boolean;
  /** Mountain with strict summit-trail entry cutoffs — warn in the afternoon (Y20). */
  trailCutoff?: boolean;
  /** City for the live weather line (defaults to Seoul). */
  city?: string;
  lat?: number;
  lng?: number;
}

const hm = (h: number, m = 0): number => h * 60 + m;

export const LANDMARKS: Landmark[] = [
  // ── Seoul palaces & royal heritage ──────────────────────────────────────────
  {
    name: "Gyeongbokgung Palace",
    aliases: ["gyeongbokgung", "gyeongbokgung palace", "gyeongbok palace", "경복궁", "景福宮", "景福宫"],
    hours: [{ open: hm(9), close: hm(18) }],
    hoursLabel: "09:00–18:00 (Nov–Feb to 17:00, summer to 18:30)",
    closedDays: [2],
    closedLabel: "Tuesdays",
    note: "Korea's grandest palace; wear hanbok and entry is free. Catch the changing-of-the-guard at the main gate.",
    approx: true,
    lat: 37.5796,
    lng: 126.977,
  },
  {
    name: "Changdeokgung Palace",
    aliases: ["changdeokgung", "changdeokgung palace", "창덕궁", "昌德宮", "昌德宫"],
    hours: [{ open: hm(9), close: hm(18) }],
    hoursLabel: "09:00–18:00 (Secret Garden by timed guided tour)",
    closedDays: [1],
    closedLabel: "Mondays",
    note: "UNESCO-listed palace; book the Secret Garden (Huwon) tour ahead — it sells out.",
    approx: true,
    lat: 37.5794,
    lng: 126.991,
  },
  {
    name: "Deoksugung Palace",
    aliases: ["deoksugung", "deoksugung palace", "덕수궁", "德壽宮", "德寿宫"],
    hours: [{ open: hm(9), close: hm(21) }],
    hoursLabel: "09:00–21:00 (last entry 20:00)",
    closedDays: [1],
    closedLabel: "Mondays",
    note: "Downtown palace with a stone-wall walk; lovely lit up at dusk. Changing-of-the-guard at the front gate.",
    lat: 37.5658,
    lng: 126.9751,
  },
  {
    name: "Changgyeonggung Palace",
    aliases: ["changgyeonggung", "changgyeonggung palace", "창경궁"],
    hours: [{ open: hm(9), close: hm(21) }],
    hoursLabel: "09:00–21:00 (last entry 20:00)",
    closedDays: [1],
    closedLabel: "Mondays",
    note: "Quiet palace with a large garden and pond, connected to Changdeokgung. Pretty in the evening.",
    lat: 37.5783,
    lng: 126.9947,
  },
  {
    name: "Jongmyo Shrine",
    aliases: ["jongmyo", "jongmyo shrine", "종묘"],
    hours: [{ open: hm(9), close: hm(18) }],
    hoursLabel: "09:00–18:00, guided tours only (free, self-guided on Saturdays)",
    closedDays: [2],
    closedLabel: "Tuesdays",
    note: "UNESCO royal ancestral shrine; you join a timed guided walk except on Saturdays. Solemn, forested, short visit.",
    approx: true,
    lat: 37.5743,
    lng: 126.9942,
  },

  // ── Towers & observatories ──────────────────────────────────────────────────
  {
    name: "N Seoul Tower (Namsan)",
    aliases: ["n seoul tower", "namsan tower", "namsan", "seoul tower", "남산타워", "남산", "엔서울타워", "n서울타워", "南山タワー", "Nソウルタワー", "南山塔", "南山首爾塔", "南山首尔塔"],
    hours: [{ open: hm(10), close: hm(23) }],
    hoursLabel: "~10:00–23:00 (observatory; varies seasonally)",
    note: "Take the Namsan cable car up; sunset and night views over the city. The plaza is open even when the deck isn't.",
    approx: true,
    lat: 37.5512,
    lng: 126.9882,
  },
  {
    name: "Lotte World Tower – Seoul Sky",
    aliases: ["seoul sky", "lotte world tower", "lotte tower", "롯데월드타워", "롯데타워", "서울스카이", "ロッテワールドタワー", "樂天世界塔", "乐天世界塔"],
    hours: [{ open: hm(10), close: hm(22) }],
    hoursLabel: "~10:00–22:00 (last entry 21:00)",
    note: "Observation deck on floors 117–123 of Korea's tallest building, at Jamsil. Glass floor and skywalk.",
    approx: true,
    lat: 37.5126,
    lng: 127.1025,
  },

  // ── Theme park & aquarium ───────────────────────────────────────────────────
  {
    name: "Lotte World Adventure",
    aliases: ["lotte world", "lotte world adventure", "롯데월드", "롯데월드어드벤처", "ロッテワールド", "樂天世界", "乐天世界"],
    hours: [{ open: hm(10), close: hm(21) }],
    hoursLabel: "~10:00–21:00 (later on weekends/holidays — check the app)",
    note: "Huge indoor + outdoor theme park at Jamsil; the indoor half is great on a rainy or cold day.",
    approx: true,
    lat: 37.5111,
    lng: 127.098,
  },
  {
    name: "COEX Aquarium",
    aliases: ["coex aquarium", "coex", "코엑스아쿠아리움", "코엑스 아쿠아리움"],
    hours: [{ open: hm(10), close: hm(20) }],
    hoursLabel: "10:00–20:00 (last entry 19:00)",
    note: "Large aquarium inside COEX Mall, Gangnam — easy to combine with the Starfield Library next door.",
    lat: 37.5126,
    lng: 127.0588,
  },

  // ── Open-air parks, streams & villages ──────────────────────────────────────
  {
    name: "Han River Parks (Hangang)",
    aliases: ["han river", "hangang", "han river park", "hangang park", "yeouido hangang park", "한강", "한강공원", "여의도한강공원", "漢江", "汉江"],
    hours: "24h",
    hoursLabel: "Open 24 hours",
    note: "Eleven riverside parks. Rent a mat, order fried chicken to the park, watch the bridge fountains, or bike the path.",
    lat: 37.5285,
    lng: 126.9326,
  },
  {
    name: "Bukchon Hanok Village",
    aliases: ["bukchon", "bukchon hanok village", "bukchon hanok", "북촌", "북촌한옥마을", "北村韓屋村", "北村韩屋村"],
    hours: "daylight",
    hoursLabel: "Daylight hours — residential area (recommended 10:00–17:00)",
    note: "A living neighbourhood of traditional hanok houses between two palaces. Real people live here — visit by day and keep your voice down.",
    lat: 37.5826,
    lng: 126.9849,
  },
  {
    name: "Seoul Forest",
    aliases: ["seoul forest", "서울숲"],
    hours: "24h",
    hoursLabel: "Park open 24 hours (deer park & facilities daytime only)",
    note: "Big leafy park near Seongsu — deer enclosure, wetlands, and riverside trails. Pair it with Seongsu's cafés.",
    lat: 37.5444,
    lng: 127.0374,
  },
  {
    name: "Dongdaemun Design Plaza (DDP)",
    aliases: ["ddp", "dongdaemun design plaza", "dongdaemun", "동대문디자인플라자", "동대문", "東大門", "东大门"],
    hours: "24h",
    hoursLabel: "Plaza & some shops 24 hours; exhibition halls ~10:00–20:00",
    note: "Zaha Hadid's spaceship-like landmark. The illuminated plaza and night-market fashion malls run around the clock; ticketed exhibits keep daytime hours.",
    lat: 37.5667,
    lng: 127.009,
  },
  {
    name: "Cheonggyecheon Stream",
    aliases: ["cheonggyecheon", "cheonggye stream", "청계천"],
    hours: "24h",
    hoursLabel: "Open 24 hours",
    note: "A restored stream cutting through downtown — a cool, walkable escape from the traffic, lit prettily at night.",
    lat: 37.5696,
    lng: 126.9779,
  },

  // ── Markets & shopping streets ──────────────────────────────────────────────
  {
    name: "Gwangjang Market",
    aliases: ["gwangjang market", "gwangjang", "광장시장", "廣藏市場", "广藏市场"],
    hours: [{ open: hm(9), close: hm(22) }],
    hoursLabel: "~09:00–22:00 (stalls vary; quieter on Sundays)",
    note: "Seoul's classic street-food market — bindaetteok (mung-bean pancake), mayak gimbap, and live-octopus stalls.",
    approx: true,
    lat: 37.5701,
    lng: 126.9996,
  },
  {
    name: "Namdaemun Market",
    aliases: ["namdaemun", "namdaemun market", "남대문", "남대문시장", "南大門市場", "南大门市场", "南大門", "南大门"],
    hours: [{ open: hm(8, 30), close: hm(18) }],
    hoursLabel: "~08:30–18:00 retail (many wholesale stalls run overnight)",
    note: "Korea's largest traditional market — accessories, kitchenware, and the famous galchi-jorim (cutlassfish) alley.",
    approx: true,
    lat: 37.5594,
    lng: 126.9776,
  },
  {
    name: "Myeongdong Shopping Street",
    aliases: ["myeongdong", "명동", "明洞"],
    hours: [{ open: hm(10, 30), close: hm(22) }],
    hoursLabel: "Shops ~10:30–22:00; street-food carts from late afternoon",
    note: "Cosmetics flagships, tax-free shops, and a famous evening street-food run. Busiest after dark.",
    approx: true,
    lat: 37.5609,
    lng: 126.9863,
  },
  {
    name: "Insadong",
    aliases: ["insadong", "인사동", "仁寺洞"],
    hours: [{ open: hm(10), close: hm(20) }],
    hoursLabel: "Shops ~10:00–20:00 (main street pedestrianised on weekends)",
    note: "Traditional crafts, hanji paper, teahouses, and the Ssamzigil spiral mall. Easy to pair with Gyeongbokgung.",
    approx: true,
    lat: 37.574,
    lng: 126.985,
  },

  // ── Museums & memorials ─────────────────────────────────────────────────────
  {
    name: "War Memorial of Korea",
    aliases: ["war memorial", "war memorial of korea", "전쟁기념관"],
    hours: [{ open: hm(9, 30), close: hm(18) }],
    hoursLabel: "09:30–18:00 (last entry 17:30)",
    closedDays: [1],
    closedLabel: "Mondays",
    note: "Free, vast military-history museum in Yongsan with outdoor tanks, planes, and ships kids love.",
    lat: 37.534,
    lng: 126.9774,
  },
  {
    name: "Leeum Museum of Art",
    aliases: ["leeum", "leeum museum", "leeum museum of art", "리움", "리움미술관"],
    hours: [{ open: hm(10), close: hm(18) }],
    hoursLabel: "10:00–18:00 (last entry 17:30)",
    closedDays: [1],
    closedLabel: "Mondays",
    note: "Samsung's flagship art museum near Itaewon — Korean antiquities and modern/contemporary art. Reserve online.",
    lat: 37.5384,
    lng: 126.999,
  },

  // ── Busan ───────────────────────────────────────────────────────────────────
  {
    name: "Haeundae Beach (Busan)",
    aliases: ["haeundae", "haeundae beach", "해운대", "해운대해수욕장", "海雲臺", "海云台"],
    hours: "24h",
    hoursLabel: "Open 24 hours (swimming season Jul–Aug)",
    note: "Busan's most famous beach — cafés, seafood, and the coastal Blue Line Park train nearby. Lively day and night.",
    city: "Busan",
    lat: 35.1587,
    lng: 129.1604,
  },
  {
    name: "Gwangalli Beach (Busan)",
    aliases: ["gwangalli", "gwangalli beach", "gwangan", "광안리", "광안리해수욕장"],
    hours: "24h",
    hoursLabel: "Open 24 hours (Gwangan Bridge lit at night)",
    note: "Beach with a front-row view of the illuminated Gwangan Bridge and weekend drone shows. Best after sunset.",
    city: "Busan",
    lat: 35.1532,
    lng: 129.1187,
  },
  {
    name: "Gamcheon Culture Village (Busan)",
    aliases: ["gamcheon", "gamcheon culture village", "감천문화마을"],
    hours: "daylight",
    hoursLabel: "Daylight — shops/cafés ~09:00–18:00; residential hillside",
    note: "A pastel hillside of art-filled lanes, nicknamed Korea's Santorini. People live here — visit by day and be respectful.",
    city: "Busan",
    lat: 35.0976,
    lng: 129.0107,
  },
  {
    name: "Jagalchi Market (Busan)",
    aliases: ["jagalchi", "jagalchi market", "자갈치", "자갈치시장"],
    hours: [{ open: hm(5), close: hm(22) }],
    hoursLabel: "~05:00–22:00 (closed the 1st & 3rd Tuesday each month)",
    note: "Korea's largest seafood market — pick your fish downstairs and have it served upstairs. Bustling and famously loud.",
    approx: true,
    city: "Busan",
    lat: 35.0966,
    lng: 129.0306,
  },

  // ── Jeju ────────────────────────────────────────────────────────────────────
  {
    name: "Seongsan Ilchulbong (Sunrise Peak, Jeju)",
    aliases: ["seongsan ilchulbong", "sunrise peak", "seongsan", "성산일출봉", "성산", "城山日出峰", "城山日出峯"],
    hours: "sunrise",
    hoursLabel: "Sunrise to ~20:00 (opens before dawn; last entry varies seasonally)",
    note: "A UNESCO tuff cone rising from the sea; a ~25-minute climb. Famous for sunrise — go early. Closed in storms.",
    approx: true,
    city: "Jeju",
    lat: 33.4581,
    lng: 126.9425,
  },
  {
    name: "Manjanggul Cave (Jeju)",
    aliases: ["manjanggul", "manjanggul cave", "만장굴"],
    hours: [{ open: hm(9), close: hm(18) }],
    hoursLabel: "09:00–18:00 (last entry 17:10; closed the 1st Wednesday monthly)",
    note: "A UNESCO lava tube you can walk ~1 km into. It's a steady 11°C inside — bring a jacket and grippy shoes.",
    approx: true,
    city: "Jeju",
    lat: 33.5285,
    lng: 126.7714,
  },
  {
    name: "Hallasan (Jeju)",
    aliases: ["hallasan", "mt hallasan", "mount hallasan", "한라산", "漢拏山", "汉拿山"],
    hours: "daylight",
    hoursLabel: "Daylight — trail entry cutoffs vary by season & trail; start early",
    note: "Korea's highest peak. Summit trails (Seongpanak/Gwaneumsa) have strict entry-cutoff times and may need a reservation — check before you set out.",
    approx: true,
    trailCutoff: true,
    city: "Jeju",
    lat: 33.3617,
    lng: 126.5292,
  },

  // ── More Seoul — museums, the Blue House, temples & squares ──────────────────
  {
    name: "National Museum of Korea",
    aliases: ["national museum of korea", "national museum", "국립중앙박물관", "中央博物館", "国立中央博物馆", "国立中央博物館"],
    hours: [{ open: hm(10), close: hm(18) }],
    hoursLabel: "10:00–18:00 (Wed & Sat to 21:00)",
    note: "Korea's vast flagship museum in Yongsan — free permanent galleries, the famous gold crowns and the Pensive Bodhisattva. Closed Jan 1, Seollal & Chuseok.",
    approx: true,
    lat: 37.524,
    lng: 126.9803,
  },
  {
    name: "Cheong Wa Dae (Blue House)",
    aliases: ["cheong wa dae", "cheongwadae", "blue house", "청와대", "靑瓦臺", "青瓦台"],
    hours: [{ open: hm(9), close: hm(18) }],
    hoursLabel: "09:00–18:00 (last entry 17:30)",
    closedDays: [2],
    closedLabel: "Tuesdays",
    note: "The former presidential compound behind Gyeongbokgung, opened to the public in 2022. Free, but reserve a time slot online — slots fill up.",
    lat: 37.5866,
    lng: 126.9748,
  },
  {
    name: "Bongeunsa Temple",
    aliases: ["bongeunsa", "bongeunsa temple", "봉은사", "奉恩寺"],
    hours: [{ open: hm(4), close: hm(21) }],
    hoursLabel: "Grounds ~04:00–21:00 (free)",
    note: "A 1,200-year-old working temple facing COEX in Gangnam — a calm contrast to the malls. English-friendly Temple Life program on Thursdays.",
    approx: true,
    lat: 37.515,
    lng: 127.0577,
  },
  {
    name: "Jogyesa Temple",
    aliases: ["jogyesa", "jogyesa temple", "조계사", "曹溪寺"],
    hours: [{ open: hm(4), close: hm(21) }],
    hoursLabel: "Grounds ~04:00–21:00 (free)",
    note: "The head temple of Korean Zen Buddhism, downtown by Insadong — spectacular lantern canopies, especially around Buddha's Birthday. Easy to pair with Gyeongbokgung.",
    approx: true,
    lat: 37.5725,
    lng: 126.981,
  },
  {
    name: "Gwanghwamun Square",
    aliases: ["gwanghwamun square", "gwanghwamun", "광화문광장", "광화문", "光化門廣場", "光化门"],
    hours: "24h",
    hoursLabel: "Open 24 hours",
    note: "The grand civic plaza leading to Gyeongbokgung, with the statues of King Sejong and Admiral Yi Sun-sin, fountains, and an underground exhibit. Lit at night.",
    lat: 37.5725,
    lng: 126.9769,
  },
  {
    name: "Bukhansan National Park",
    aliases: ["bukhansan", "bukhansan national park", "mt bukhansan", "북한산", "北漢山", "北汉山"],
    hours: "daylight",
    hoursLabel: "Daylight hiking — trail entry cutoffs vary by season; start early",
    note: "The granite-peaked national park ringing northern Seoul — accessible day hikes with city views (Baegundae is the top). Wear real shoes; some trails need a permit.",
    approx: true,
    trailCutoff: true,
    lat: 37.6586,
    lng: 126.9779,
  },

  // ── Day-trips near Seoul ─────────────────────────────────────────────────────
  {
    name: "Everland (Yongin)",
    aliases: ["everland", "에버랜드", "에버랜드 리조트"],
    hours: [{ open: hm(10), close: hm(22) }],
    hoursLabel: "~10:00–22:00 (varies daily/seasonally — check the app)",
    note: "Korea's biggest theme park, in Yongin south of Seoul — the T Express wooden coaster, a zoo safari, and the panda twins. Hours shift, so confirm before you go.",
    approx: true,
    lat: 37.294,
    lng: 127.2026,
  },
  {
    name: "Nami Island (Gapyeong)",
    aliases: ["nami island", "namiseom", "남이섬", "南怡島", "南怡岛"],
    hours: [{ open: hm(8), close: hm(21) }],
    hoursLabel: "~08:00–21:00 (last ferry back ~21:00; ferry ticket required)",
    note: "The tree-lined river island famous from K-dramas, reached by a short ferry (or zipline) from Gapyeong — a popular day trip with Garden of Morning Calm or Petite France.",
    approx: true,
    lat: 37.7902,
    lng: 127.5258,
  },

  // ── More Busan ───────────────────────────────────────────────────────────────
  {
    name: "Haedong Yonggungsa Temple (Busan)",
    aliases: ["haedong yonggungsa", "yonggungsa", "해동용궁사", "용궁사", "海東龍宮寺"],
    hours: [{ open: hm(5), close: hm(19, 30) }],
    hoursLabel: "~05:00–19:30 (free)",
    note: "A rare seaside temple built onto the rocks above the waves on Busan's east coast — sunrise is magical. Lots of stairs; pair with the nearby coast.",
    approx: true,
    city: "Busan",
    lat: 35.1885,
    lng: 129.2233,
  },

  // ── More Seoul — parks, views & photo spots ─────────────────────────────────
  {
    name: "Banpo Bridge Moonlight Rainbow Fountain",
    aliases: ["banpo bridge", "moonlight rainbow fountain", "rainbow fountain", "banpo", "반포대교", "달빛무지개분수", "반포한강공원"],
    hours: "24h",
    hoursLabel: "Riverside park open 24h; fountain show seasonal evenings",
    note: "The Han River bridge with a music-and-light fountain show — runs ~Apr–Oct, several times each evening (~19:30–21:00, weather permitting). Watch from Banpo Hangang Park.",
    lat: 37.5126,
    lng: 126.9956,
  },
  {
    name: "Ihwa Mural Village",
    aliases: ["ihwa mural village", "ihwa-dong", "ihwa village", "이화벽화마을", "이화동벽화마을", "梨花壁畫村"],
    hours: "daylight",
    hoursLabel: "Daylight — hillside residential area (recommended 10:00–18:00)",
    note: "An arty hillside of murals and staircase paintings below Naksan Park. People live here — visit by day, keep quiet, and don't photograph homes.",
    lat: 37.5793,
    lng: 127.0048,
  },
  {
    name: "Starfield Library (COEX)",
    aliases: ["starfield library", "byeolmadang library", "byeolmadang", "별마당도서관", "스타필드 도서관", "코엑스 별마당"],
    hours: [{ open: hm(10, 30), close: hm(22) }],
    hoursLabel: "~10:30–22:00 (with COEX Mall hours)",
    note: "The vast open library with two-storey bookshelves inside COEX Mall, Gangnam — free to browse and a top photo spot. Combine with the COEX Aquarium next door.",
    approx: true,
    lat: 37.5108,
    lng: 127.06,
  },
  {
    name: "Seoullo 7017",
    aliases: ["seoullo 7017", "seoullo", "skygarden", "서울로", "서울로7017"],
    hours: "24h",
    hoursLabel: "Open 24 hours",
    note: "A former highway overpass by Seoul Station turned into an elevated 'sky garden' walkway lined with plants — a quick, lit-up stroll above the city, best at dusk.",
    lat: 37.5564,
    lng: 126.9722,
  },
  {
    name: "Olympic Park",
    aliases: ["olympic park", "올림픽공원", "몽촌토성", "奧林匹克公園", "奥林匹克公园"],
    hours: [{ open: hm(5), close: hm(22) }],
    hoursLabel: "~05:00–22:00 (open green space; some facilities daytime)",
    note: "A huge, sculpture-dotted park in Songpa with the famous 'Lonely Tree', rose garden, and lake — great for a bike ride or picnic. Near Lotte World.",
    approx: true,
    lat: 37.5215,
    lng: 127.1216,
  },

  // ── More Busan & Jeju ───────────────────────────────────────────────────────
  {
    name: "Taejongdae (Busan)",
    aliases: ["taejongdae", "태종대", "태종대유원지", "太宗臺"],
    hours: "daylight",
    hoursLabel: "Daylight — Danubi tram ~09:20 to sunset; park accessible by day",
    note: "A dramatic coastal park of sea cliffs and pine forest on Busan's southern tip — ride the Danubi tram between the lighthouse and observatory viewpoints. Windy; bring a layer.",
    approx: true,
    city: "Busan",
    lat: 35.0518,
    lng: 129.0876,
  },
  {
    name: "Seopjikoji (Jeju)",
    aliases: ["seopjikoji", "섭지코지", "涉地可支"],
    hours: "daylight",
    hoursLabel: "Daylight — open-air coastal cape (best by day / sunrise)",
    note: "A scenic Jeju cape of grassy headlands, a lighthouse, and the All-in-One drama set, looking out to Seongsan Sunrise Peak — windy, photogenic, and free to roam.",
    city: "Jeju",
    lat: 33.4239,
    lng: 126.9304,
  },
];

// Exact alias index for instant, unambiguous hits ("lotte world" → Adventure,
// not the Tower). Fuzzy resolution is the safety net for the long tail.
const INDEX = new Map<string, Landmark>();
for (const l of LANDMARKS) {
  INDEX.set(l.name.toLowerCase(), l);
  for (const a of l.aliases) INDEX.set(a.toLowerCase(), l);
}

const landmarkKeys = (l: Landmark): string[] => [l.name, ...l.aliases];

/**
 * Resolve a query to a curated landmark, or undefined for the long tail (the
 * caller then falls back to TourAPI). Exact alias hit first, then a CONFIDENT
 * fuzzy match only — a loose match would wrongly hijack an ordinary place query.
 */
export function resolveLandmark(input: string): Landmark | undefined {
  const raw = (input ?? "").trim();
  if (!raw) return undefined;
  const direct = INDEX.get(raw.toLowerCase());
  if (direct) return direct;
  const r = resolveName(raw, LANDMARKS, landmarkKeys, { exact: 0.84, suggest: 0.84, maxSuggest: 1 });
  return r.kind === "exact" ? r.item : undefined;
}

/** Plausible landmark candidates for an ambiguous brand/partial name ("Lotte" →
 *  Lotte World / Lotte World Tower / Lotte World Adventure). Empty when nothing is
 *  close or a single match is confident. Lets getNowInfo ask "which one?" instead
 *  of letting TourAPI pick a wrong-city department store (F2). */
export function landmarkSuggestions(input: string): Landmark[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  // Only STRONG candidates (≥0.8) AND only when genuinely ambiguous (≥2 of them) —
  // so a brand token like "Lotte" → its two Lotte landmarks, but a loose fuzzy
  // neighbourhood like "Hongdae" (own area-redirect path) returns nothing.
  const strong = rankCandidates(raw, LANDMARKS, landmarkKeys).filter((r) => r.score >= 0.8);
  return strong.length >= 2 ? strong.slice(0, 3).map((r) => r.item) : [];
}

export interface LandmarkVerdict {
  /** open = clearly open now; closed = clearly closed; info = open-air/advisory. */
  status: "open" | "closed" | "info";
  /** Emoji + one-line headline, e.g. "🟢 Open now (until 18:00)". */
  headline: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const hhmm = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/**
 * Render a crisp open/closed verdict for a landmark at the given Korea weekday
 * (0 = Sun … 6 = Sat) and minute-of-day. Pure and time-injected so it's testable.
 */
export function landmarkVerdict(l: Landmark, dow: number, minutes: number): LandmarkVerdict {
  const tilde = l.approx ? "~" : "";

  // Closed for the whole day takes precedence over any time-of-day reasoning.
  if (l.closedDays?.includes(dow)) {
    return { status: "closed", headline: `🔴 Closed today — closed ${l.closedLabel ?? "today"}.` };
  }

  if (l.hours === "24h") {
    return { status: "open", headline: "🟢 Open now — open 24 hours." };
  }

  if (l.hours === "daylight") {
    const daytime = minutes >= hm(7) && minutes < hm(18);
    // Mountains: daytime-only, with a strict early-afternoon summit cutoff (Y20).
    if (l.trailCutoff === true) {
      if (!daytime) {
        return { status: "closed", headline: "🔴 Closed now — mountain trails are daytime-only. Start at dawn for the summit." };
      }
      if (minutes >= hm(13)) {
        return {
          status: "info",
          headline: "🟠 Too late for the summit — trails have strict early-afternoon entry cutoffs. Lower trails / visitor center only now; start at dawn for the top.",
        };
      }
      return { status: "open", headline: "🟢 Good to go now — daytime hiking; start early to reach the summit before the cutoff." };
    }
    // Open-air / residential spots (villages, riversides without gates).
    if (daytime) {
      return { status: "open", headline: "🟢 Good to go now — open-air area, best by day." };
    }
    return { status: "info", headline: "🟠 Best by day — it's an open-air/residential spot with little to see after dark." };
  }

  if (l.hours === "sunrise") {
    if (minutes < hm(5)) {
      return { status: "closed", headline: "🔴 Closed now — opens around dawn (it's a sunrise spot)." };
    }
    if (minutes >= hm(20)) {
      return { status: "closed", headline: "🔴 Closed for the day — come back at sunrise." };
    }
    return { status: "open", headline: `🟢 Open now (until ~${hhmm(hm(20))}) — famous at sunrise, so dawn is best.` };
  }

  // Explicit gated intervals.
  const intervals = l.hours;
  const open = intervals.find((iv) => minutes >= iv.open && minutes < iv.close);
  if (open) {
    return { status: "open", headline: `🟢 Open now (until ${tilde}${hhmm(open.close)}).` };
  }
  const firstOpen = Math.min(...intervals.map((iv) => iv.open));
  const lastClose = Math.max(...intervals.map((iv) => iv.close));
  if (minutes < firstOpen) {
    return { status: "closed", headline: `🔴 Closed now — opens ${tilde}${hhmm(firstOpen)}.` };
  }
  // After the last close → shut for the day.
  void lastClose;
  return { status: "closed", headline: `🔴 Closed now — closed for the day (opens ${tilde}${hhmm(firstOpen)} tomorrow).` };
}
