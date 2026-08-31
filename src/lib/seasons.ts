/**
 * "Is now a good time to come?" — answered with the season you are actually in.
 *
 * QA found this returning "which city are you curious about?", which is a weather
 * lookup answering a trip-planning question. What a visitor wants is the shape of
 * the month: how it feels, what is on, what to pack, and what will be shut.
 *
 * Curated by month rather than fetched, because this is climate, not weather — the
 * live temperature already rides on the same card.
 */

import { upcomingMajorHoliday } from "./holidays.js";

export interface Season {
  label: string;
  feel: string;
  whatsOn: string[];
  pack: string;
  /** The honest downside — the thing a brochure leaves out. */
  caveat?: string;
}

const BY_MONTH: Record<number, Season> = {
  1: {
    label: "Deep winter",
    feel: "Cold and dry, roughly −8 to 3°C in Seoul, with bright blue skies. The wind is what gets you, not the snow.",
    whatsOn: [
      "Ski and snowboard resorts within 2 hours of Seoul",
      "Ice-fishing festivals in Gangwon province",
      "Winter light displays along the Cheonggyecheon and at Everland",
    ],
    pack: "A proper winter coat, gloves and a hat. Indoors is heated hard, so wear layers you can strip off.",
    caveat: "Palaces and outdoor markets are genuinely cold — plan them for the middle of the day.",
  },
  2: {
    label: "Late winter",
    feel: "Still cold, −5 to 6°C, softening at the end of the month.",
    whatsOn: ["Ski season continues", "Plum blossoms in the far south from late February"],
    pack: "Winter coat, but a lighter one by the end of the month.",
  },
  3: {
    label: "Early spring",
    feel: "3 to 14°C and changeable — genuinely warm one day, back to winter the next.",
    whatsOn: [
      "Cherry blossoms open in Jeju and Busan late in the month",
      "Palace night openings begin",
    ],
    pack: "Layers and a windproof jacket.",
    caveat: "The worst fine-dust days of the year fall in March and April — check the air quality before a long walk.",
  },
  4: {
    label: "Cherry-blossom spring",
    feel: "8 to 19°C, the prettiest weeks of the year.",
    whatsOn: [
      "Cherry blossoms peak in Seoul in the first ten days — Yeouido, Seokchon Lake, Namsan",
      "Spring festivals in nearly every city",
    ],
    pack: "A light jacket over shirts; blossom season means crowds, so comfortable shoes.",
    caveat: "Blossom peak lasts about a week and moves with the weather — nobody can promise you the date.",
  },
  5: {
    label: "The best month",
    feel: "14 to 24°C, dry, green and comfortable. If you get to choose when to come, this is it.",
    whatsOn: [
      "Lotus Lantern Festival around Buddha's Birthday",
      "Rose and iris gardens; outdoor markets and night walks",
    ],
    pack: "Shirts and a light layer for evenings.",
  },
  6: {
    label: "Early summer",
    feel: "19 to 28°C, warm and increasingly humid; the rainy season usually arrives at the end of the month.",
    whatsOn: ["Beach season opens", "Hanging out along the Han River at night"],
    pack: "Light clothes and a compact umbrella.",
  },
  7: {
    label: "Monsoon",
    feel: "23 to 30°C, humid, with heavy rain in bursts rather than all day.",
    whatsOn: ["Museums, cafés and the underground shopping cities come into their own", "Water parks and mountain valleys"],
    pack: "An umbrella, quick-drying shoes, and a layer for aggressive indoor air-conditioning.",
    caveat: "Rain here is torrential and short. Plan indoor anchors and move between them.",
  },
  8: {
    label: "Peak summer",
    feel: "25 to 33°C and very humid, with heat advisories most weeks.",
    whatsOn: ["Beaches at Busan and Gangneung", "Late-night markets, which is when the city actually lives in August"],
    pack: "The lightest clothes you own, a fan, and sunscreen.",
    caveat: "Midday sightseeing outdoors is punishing. Go early, rest indoors from 13:00 to 16:00, go out again at dusk.",
  },
  9: {
    label: "Turning to autumn",
    feel: "20 to 28°C, hot at the start and pleasant by the end. Typhoon season tails off through the month.",
    whatsOn: ["Chuseok, the harvest holiday", "Autumn festivals begin; palace night tours return"],
    pack: "Summer clothes with a light jacket for the last week.",
  },
  10: {
    label: "The other best month",
    feel: "11 to 22°C, clear and dry — the light is extraordinary.",
    whatsOn: [
      "Autumn leaves peak in the mountains mid-month (Seoraksan) and in Seoul from the very end of October",
      "Festival season everywhere",
    ],
    pack: "A jumper and a light coat for evenings.",
  },
  11: {
    label: "Late autumn",
    feel: "4 to 15°C, crisp, with the last of the leaves in the city in the first two weeks.",
    whatsOn: ["City foliage — Deoksugung's stone wall road, Naksan Park", "Kimchi-making season"],
    pack: "A warm coat by the second half of the month.",
  },
  12: {
    label: "Early winter",
    feel: "−4 to 6°C, cold and dry, with Christmas lights everywhere from late November.",
    whatsOn: ["Christmas markets and illuminations", "Ski resorts open", "Year-end sales"],
    pack: "Winter coat, gloves, and something for the wind.",
  },
};

/** Is this about seasons and timing rather than today's forecast? */
export function asksAboutSeason(text: string): boolean {
  return /good time to (?:visit|come|travel|go)|best (?:time|season|month) to|what(?:'s| is) it like in (?:spring|summer|autumn|fall|winter)|which season|what season|what should i (?:pack|wear|bring)|cherry blossom|autumn (?:leaves|foliage)|fall (?:leaves|foliage)|monsoon|rainy season|여행하기 좋은|언제 가는 게|무엇을 챙|뭘 입|벚꽃|단풍|장마|旅行(?:に)?(?:いい|良い)(?:時期|季節)|桜|紅葉|梅雨|什[么麼]?[时時]候去|最佳[时時][间間]|[樱櫻]花|[红紅][叶葉]|雨季/i.test(
    text ?? "",
  );
}

/** The season card for a given month (1–12), with any big holiday coming up. */
export function seasonCard(month: number, today = new Date()): string {
  const s = BY_MONTH[month] ?? BY_MONTH[1];
  const holiday = upcomingMajorHoliday(today);
  const lines = [
    `📅 **${s.label} in Korea**`,
    "",
    s.feel,
    "",
    "**What's on**",
    ...s.whatsOn.map((w) => `- ${w}`),
    "",
    `🎒 **Pack:** ${s.pack}`,
  ];
  if (s.caveat) lines.push("", `⚠️ ${s.caveat}`);
  if (holiday) {
    lines.push(
      "",
      `🏮 **${holiday.name} falls on ${holiday.date}.** Around a major holiday, intercity trains and buses sell out weeks ahead, many small restaurants and shops close for two or three days, and the palaces are free and busy. Big malls and convenience stores stay open.`,
    );
  }
  return lines.join("\n");
}
