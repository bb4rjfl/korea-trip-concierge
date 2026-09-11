/**
 * Is this pharmacy open now, and if not, when?
 *
 * Asked for a 24-hour pharmacy in Hongdae at 11pm, we could only say that none
 * was listed and that convenience stores sell painkillers — true, and no help
 * to someone with a fever. The National Medical Center publishes every
 * pharmacy's hours for each weekday and for public holidays; this reads them.
 *
 * Shared by the server (a pharmacy near a place someone named) and the phone
 * (a pharmacy near where they are), so it imports nothing.
 *
 * Hours are "HHMM-HHMM" per day, Monday to Sunday then public holidays, as the
 * source gives them. A closing time past midnight is written either as 2600 or
 * as a time smaller than the opening one; both mean "into the next morning".
 */

/** Monday…Sunday, then public holidays: eight "HHMM-HHMM" slots ("" = closed) joined by "|". */
export type WeekHours = string;

export interface OpenState {
  open: boolean;
  /** "22:00" — when it closes, if open. */
  until?: string;
  /** "09:00" — when it next opens, if closed. */
  opens?: string;
  /** Whether that opening is on a later day. */
  opensLater?: boolean;
  /** Open around the clock that day. */
  allDay?: boolean;
}

/** Minutes past a midnight (possibly the previous one) as a clock time: 1500 → "01:00". */
const hm = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** A day's hours as minutes from that day's midnight; the close may run past 24:00. */
function span(slot: string): [number, number] | undefined {
  const m = /^(\d{3,4})-(\d{3,4})$/.exec(slot.trim());
  if (!m) return undefined;
  const toMin = (s: string): number => Math.floor(Number(s) / 100) * 60 + (Number(s) % 100);
  const start = toMin(m[1]);
  let end = toMin(m[2]);
  if (end <= start) end += 24 * 60; // "2200-0100": into the next morning
  return [start, end];
}

/**
 * The state of a pharmacy at a moment, given its week and whether today (and
 * yesterday, for hours running past midnight) are public holidays.
 *
 * `day` is 0 for Monday … 6 for Sunday, in Korea; `minute` is minutes past
 * midnight, Korea time.
 */
export function openState(week: WeekHours, day: number, minute: number, holidayToday = false, holidayYesterday = false): OpenState {
  const slots = week.split("|");
  const slotFor = (d: number, holiday: boolean): string => (holiday && slots[7] !== undefined ? slots[7] : (slots[d] ?? "")) || "";
  // Still open from yesterday's late hours?
  const yesterday = span(slotFor((day + 6) % 7, holidayYesterday));
  if (yesterday && yesterday[1] > 24 * 60 && minute < yesterday[1] - 24 * 60) {
    return { open: true, until: hm(yesterday[1]) };
  }
  const today = span(slotFor(day, holidayToday));
  if (today && minute >= today[0] && minute < today[1]) {
    const allDay = today[1] - today[0] >= 24 * 60 - 1;
    return { open: true, until: hm(today[1]), ...(allDay ? { allDay } : {}) };
  }
  if (today && minute < today[0]) return { open: false, opens: hm(today[0]) };
  // Closed for the rest of today: the next day it opens, within a week.
  for (let ahead = 1; ahead <= 7; ahead++) {
    const next = span(slotFor((day + ahead) % 7, false));
    if (next) return { open: false, opens: hm(next[0]), opensLater: true };
  }
  return { open: false };
}

/** Korea's weekday (0 = Monday) and minute of the day, for a moment. */
export function koreaNow(at = Date.now()): { day: number; minute: number; ymd: string; yesterdayYmd: string } {
  const k = new Date(at + 9 * 3600_000);
  const y = new Date(at + 9 * 3600_000 - 24 * 3600_000);
  const ymd = (d: Date): string => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return { day: (k.getUTCDay() + 6) % 7, minute: k.getUTCHours() * 60 + k.getUTCMinutes(), ymd: ymd(k), yesterdayYmd: ymd(y) };
}
