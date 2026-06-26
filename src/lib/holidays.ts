/**
 * Korean public-holiday calendar (curated) — so getNowInfo can warn that today is
 * a holiday, which English map apps ("open now") routinely miss. The big ones —
 * **Seollal** (Lunar New Year) and **Chuseok** — empty out cities and close many
 * shops/restaurants/markets, the single most-cited "showed up, it was closed"
 * holiday trap for tourists (docs/18 #5).
 *
 * Curated reference data (no API, Kakao-rule-safe). Lunar dates are exact for
 * 2026–2027 (date.nager.at). REFRESH for 2028+. Minor national holidays are
 * included so we can name the day, but only `major` ones imply broad closures —
 * palaces/attractions and convenience stores usually stay open even then.
 */

export interface KoreanHoliday {
  name: string;
  /** True for Seollal/Chuseok — broad shop/restaurant/market closures. */
  major: boolean;
}

// Keyed by KST date YYYY-MM-DD. (Labour Day / election days omitted — most shops
// stay open, so flagging them would mislead.)
const HOLIDAYS: Record<string, KoreanHoliday> = {
  // ── 2026 ──
  "2026-01-01": { name: "New Year's Day", major: false },
  "2026-02-16": { name: "Seollal holiday (Lunar New Year eve)", major: true },
  "2026-02-17": { name: "Seollal (Lunar New Year)", major: true },
  "2026-02-18": { name: "Seollal holiday", major: true },
  "2026-03-02": { name: "Independence Movement Day (substitute)", major: false },
  "2026-05-05": { name: "Children's Day", major: false },
  "2026-05-25": { name: "Buddha's Birthday", major: false },
  "2026-06-06": { name: "Memorial Day", major: false },
  "2026-08-17": { name: "Liberation Day (substitute)", major: false },
  "2026-09-24": { name: "Chuseok holiday (eve)", major: true },
  "2026-09-25": { name: "Chuseok (Korean Thanksgiving)", major: true },
  "2026-09-26": { name: "Chuseok holiday", major: true },
  "2026-10-05": { name: "National Foundation Day (substitute)", major: false },
  "2026-10-09": { name: "Hangeul Day", major: false },
  "2026-12-25": { name: "Christmas Day", major: false },
  // ── 2027 ──
  "2027-01-01": { name: "New Year's Day", major: false },
  "2027-02-06": { name: "Seollal holiday (Lunar New Year eve)", major: true },
  "2027-02-07": { name: "Seollal (Lunar New Year)", major: true },
  "2027-02-08": { name: "Seollal holiday", major: true },
  "2027-02-09": { name: "Seollal holiday (substitute)", major: true },
  "2027-03-01": { name: "Independence Movement Day", major: false },
  "2027-05-05": { name: "Children's Day", major: false },
  "2027-05-13": { name: "Buddha's Birthday", major: false },
  "2027-06-06": { name: "Memorial Day", major: false },
  "2027-08-15": { name: "Liberation Day", major: false },
  "2027-09-14": { name: "Chuseok holiday (eve)", major: true },
  "2027-09-15": { name: "Chuseok (Korean Thanksgiving)", major: true },
  "2027-09-16": { name: "Chuseok holiday", major: true },
  "2027-10-03": { name: "National Foundation Day", major: false },
  "2027-10-09": { name: "Hangeul Day", major: false },
  "2027-12-25": { name: "Christmas Day", major: false },
};

/** Holiday on a given KST date (YYYY-MM-DD), or undefined. Pure/testable. */
export function koreanHolidayOn(yyyymmdd: string): KoreanHoliday | undefined {
  return HOLIDAYS[yyyymmdd];
}

/** Today's KST date as YYYY-MM-DD (server runtime; not used by pure parsers). */
export function todayKST(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return p; // en-CA formats as YYYY-MM-DD
}

/** Today's Korean holiday (KST), or undefined. */
export function koreanHolidayToday(): KoreanHoliday | undefined {
  return koreanHolidayOn(todayKST());
}

/** A one-line banner for a holiday, or "" when there's none. */
export function holidayBanner(h: KoreanHoliday | undefined): string {
  if (!h) return "";
  return h.major
    ? `🎌 **Today is ${h.name}** — during this holiday many shops, restaurants, and traditional markets **close or run reduced hours**, and cities empty out. Palaces/attractions, convenience stores, and big malls usually stay open — but call ahead or check before you go.`
    : `🎌 _Today is a Korean public holiday (${h.name}). Banks and offices are closed; most attractions, shops, and restaurants stay open, though some may keep holiday hours._`;
}
