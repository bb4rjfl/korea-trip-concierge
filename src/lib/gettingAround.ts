/**
 * "How do I get around here?" — asked constantly, and answered nowhere.
 *
 * A route planner answers A→B. This answers the question before that one: what
 * transport this city actually has, what it costs, how you pay for it, and the one
 * thing that catches visitors out. QA found "How do I get around Jeju without a
 * car?" returning a Jeju City area guide that ended "Jeju isn't especially known
 * for transit" — which is both unhelpful and wrong: Jeju has no rail at all, and
 * the express buses are the answer.
 *
 * Curated because it is stable knowledge that changes on the scale of years, and
 * because a visitor deciding whether to rent a car needs it to be right.
 */

export interface CityMobility {
  city: string;
  /** The one-line shape of the place: what mode dominates. */
  headline: string;
  modes: string[];
  /** The thing visitors get wrong here. */
  watch: string;
}

export const CITIES: { match: RegExp; guide: CityMobility }[] = [
  {
    match: /seoul|서울|ソウル|首尔|首爾/i,
    guide: {
      city: "Seoul",
      headline: "The subway does almost everything — it is signed and announced in English, Japanese and Chinese.",
      modes: [
        "🚇 **Subway** — base **₩1,550** (~10 km), a bit more with distance. Runs about **05:30–24:00**. Every station has a number as well as a name, so you can navigate by number alone.",
        "🚌 **Buses** are colour-coded: **blue** = long trunk routes, **green** = short feeders to a subway station, **red** = express to the suburbs, **yellow** = short downtown loops. Stops are announced in English on most routes.",
        "🚕 **Taxis** — base **₩4,800**; a **20% late-night surcharge** applies roughly 22:00–04:00. Hail on the street or use **Kakao T** (works without a Korean card if you pay the driver directly in cash or by card in the car).",
        "🚶 Distances downtown are short — Myeongdong to Namdaemun, or Insadong to Gwanghwamun, are 10-minute walks.",
      ],
      watch:
        "Tap your card **in and out** every ride. Tapping out is what gives you the free 30-minute transfer between bus and subway, and skipping it can charge you a penalty fare on the next trip.",
    },
  },
  {
    match: /busan|부산|釜山|プサン/i,
    guide: {
      city: "Busan",
      headline: "Four subway lines cover everywhere a visitor goes, and they are far easier than the buses.",
      modes: [
        "🚇 **Subway** — Lines 1–4 plus the **Donghae Line** along the coast and the **Gimhae light rail** to the airport. Fare is zoned: **₩1,550** within one zone, **₩1,750** beyond. Signs and announcements are multilingual.",
        "🚌 **Buses** reach the beaches and hillside neighbourhoods the subway misses — Gamcheon Culture Village in particular is a bus or taxi ride uphill from Toseong station.",
        "🚕 **Taxis** are cheaper than Seoul and plentiful; base fare around **₩4,800**.",
        "✈️ **From Gimhae Airport**: the light rail to Sasang (Line 2), or an airport limousine bus to Haeundae and Seomyeon.",
      ],
      watch:
        "Busan uses **Cashbee** cards as well as **T-money** — both work, and a T-money card bought in Seoul works here without any change.",
    },
  },
  {
    match: /jeju|제주|済州|濟州|济州|チェジュ/i,
    guide: {
      city: "Jeju",
      headline: "There is **no railway on the island at all** — it is buses, taxis, or a rented car, and buses are better than their reputation.",
      modes: [
        "🚌 **Express buses (급행, the 100-series, red)** are the ones to know: airport to Seongsan Ilchulbong, Seogwipo or Jungmun in about 1–1.5 hours. Fare is distance-based, roughly **₩1,150–4,000**.",
        "🚌 **Trunk (200–400 series) and local buses** fill in everything else; flat **₩1,150** with a card. T-money and Cashbee both work.",
        "🚕 **Taxis** are easy to find in Jeju City and Seogwipo, and scarce in between — book a return before heading somewhere rural.",
        "🚗 **Rental cars** are how most visitors do it, but you need an **International Driving Permit** issued in your own country before you travel. Korea recognises the 1949 Geneva convention permit; a few countries (China among them) are not covered, so check before you plan around driving.",
      ],
      watch:
        "The island is bigger than it looks — the airport to Seongsan is over an hour each way. Two or three sights a day is a realistic pace, not six.",
    },
  },
  {
    match: /gyeongju|경주|慶州|庆州/i,
    guide: {
      city: "Gyeongju",
      headline: "A small city with its sights spread out — buses and bicycles, not rail.",
      modes: [
        "🚌 **City buses 10 and 11** run the tourist loop in opposite directions and stop at nearly every major site (Bulguksa, Cheomseongdae, Daereungwon).",
        "🚲 **Bicycle rental** near the station and Hwangnidan-gil — the historic centre is flat and compact, and this is how locals suggest you see it.",
        "🚕 **Taxis** are cheap here; Bulguksa to the centre is a modest fare.",
        "🚄 **KTX arrives at Singyeongju**, which is outside town — take bus 700 or a taxi for the last 20 minutes.",
      ],
      watch:
        "Seokguram Grotto is up the mountain behind Bulguksa; the connecting bus runs infrequently, so check the return time before you go up.",
    },
  },
  {
    match: /daegu|대구|大邱/i,
    guide: {
      city: "Daegu",
      headline: "Three subway lines, including a monorail that doubles as a sightseeing ride.",
      modes: [
        "🚇 **Subway Lines 1–3**; Line 3 is an elevated **monorail** with good views across the city.",
        "🚌 Buses fill the gaps; the same T-money card works.",
        "🚕 Taxis are inexpensive and easy to hail.",
      ],
      watch: "Seomun Market and Dongseongno are both walkable from the Line 1/2 interchange at Banwoldang.",
    },
  },
  {
    match: /incheon|인천|仁川/i,
    guide: {
      city: "Incheon",
      headline: "Connected to Seoul by subway, with two local lines of its own.",
      modes: [
        "🚇 **Seoul Line 1** and the **Suin–Bundang Line** run in from Seoul; **Incheon Lines 1 and 2** cover the city.",
        "🚇 **AREX** links both airport terminals to Seoul Station in about 43–60 minutes.",
        "🚌 Airport limousine buses serve most Seoul neighbourhoods directly and take luggage in the hold.",
      ],
      watch:
        "Chinatown and Wolmido are at **Incheon station on Line 1** — not Incheon *Airport*, and not the newer Incheon subway. It is a common and time-expensive mix-up.",
    },
  },
];

const NATIONAL: CityMobility = {
  city: "Korea",
  headline: "One card covers the whole country, and the intercity network is fast and cheap.",
  modes: [
    "💳 A **T-money or Cashbee card** works on buses and subways in every major city, and on most taxis. Buy and top it up in cash at any convenience store.",
    "🚄 **KTX and SRT** connect the big cities — Seoul to Busan in about 2.5 hours.",
    "🚌 **Express and intercity buses** reach everywhere the trains don't, usually cheaper.",
    "🚕 **Taxis** are metered and inexpensive by international standards; **Kakao T** is the app, and you can pay the driver directly.",
  ],
  watch:
    "Google Maps cannot give walking or driving directions in Korea — use **Naver Map** or **Kakao Map** instead. Both have English interfaces.",
};

/** Does this read as "how do I get around here?" rather than "how do I get from A to B?" */
export function asksHowToGetAround(text: string): boolean {
  const t = text ?? "";
  // "get from X to Y" is a route question and must not be caught here.
  if (/\bfrom\b[\s\S]{1,40}\bto\b/i.test(t)) return false;
  return /how (?:do|can|should) (?:i|we|you) (?:get around|move around|travel around|get about)|getting around|get around\b|public transport(?:ation)?\b|without a car|어떻게 (?:다니|이동|돌아다)|교통(?:편|수단)|移動手段|どうやって回|交通手段|怎么出行|如何出行|交通方式/i.test(
    t,
  );
}

/** The mobility card for whichever city the question names, or the national one. */
export function gettingAroundCard(text: string): string {
  const hit = CITIES.find(({ match }) => match.test(text ?? ""));
  const g = hit?.guide ?? NATIONAL;
  return [
    `🚉 **Getting around ${g.city}**`,
    "",
    g.headline,
    "",
    ...g.modes.map((m) => `- ${m}`),
    "",
    `⚠️ **Worth knowing:** ${g.watch}`,
  ].join("\n");
}
