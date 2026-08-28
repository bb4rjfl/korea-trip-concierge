/**
 * Conversation slots.
 *
 * The chat is stateless — the client resends its history — but the tools take
 * concrete arguments, so a follow-up like "how do I get there from here?" or a
 * tapped chip reading "Is one of these open right now?" arrived with nothing to
 * act on. Every QA sweep put this at the top: the chips are rendered WITH the
 * context ("How do I get to Dongdaemun?") and sent WITHOUT it, so the service
 * threw away what it had just produced and asked the user to type it again.
 *
 * We recover the slots by reading back what was actually said — the tool cards
 * have a fixed shape — and use them to fill arguments the router left empty.
 */

import type { ChatTurn } from "./llm.js";

export interface ConvoContext {
  /** Places named in recent answers, most recent first. */
  places: string[];
  /** Neighborhood/area last in focus. */
  area?: string;
  /** Subway station last in focus. */
  station?: string;
  /** Bus route number last in focus. */
  busNumber?: string;
  /** City last in focus (bus lookups need one). */
  city?: string;
}

const CITY_RE =
  /\b(Seoul|Busan|Jeju|Incheon|Daegu|Daejeon|Gwangju|Gyeongju|Suwon|Jeonju|Gangneung)\b|서울|부산|제주|인천|대구|대전|광주|경주/i;
const CITY_CANON: Record<string, string> = {
  서울: "Seoul", 부산: "Busan", 제주: "Jeju", 인천: "Incheon",
  대구: "Daegu", 대전: "Daejeon", 광주: "Gwangju", 경주: "Gyeongju",
};

/** Trim a display name down to something the tools can look up again. */
function clean(name: string): string {
  return name
    .replace(/\s*·.*$/, "")        // trailing " · _Category_"
    .replace(/\s+—\s+.*$/, "")     // "Name — right now"
    .replace(/^\d+\.\s*/, "")
    .replace(/\*+/g, "")
    .trim();
}

export function deriveContext(history: ChatTurn[]): ConvoContext {
  const ctx: ConvoContext = { places: [] };
  // Newest first: the most recent mention wins every slot.
  for (const turn of [...history].reverse()) {
    const t = turn.content ?? "";

    if (!ctx.busNumber) {
      const m = /(?:bus|버스|バス|公交|巴士)\s*#?\s*([0-9]{1,4}(?:-[0-9]+)?[A-Za-z]?)\b/i.exec(t) ?? /\b([0-9]{1,4})\s*번\s*버스/.exec(t);
      if (m) ctx.busNumber = m[1];
    }
    if (!ctx.station) {
      const m = /\*\*([^*\n]{1,30}?)\s*(?:Station|역)\*\*/i.exec(t) ?? /([가-힣A-Za-z]{2,20})\s*(?:Station|역)\b/.exec(t);
      if (m) ctx.station = clean(m[1]);
    }
    if (!ctx.area) {
      // Area-guide header: "🗺️ **Hongdae (홍대)**"
      const m = /🗺️\s*\*\*([^*\n(]{2,24})/.exec(t);
      if (m) ctx.area = clean(m[1]);
    }
    if (!ctx.city) {
      const m = CITY_RE.exec(t);
      if (m) ctx.city = CITY_CANON[m[0]] ?? m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase();
    }

    if (turn.role === "assistant") {
      // Numbered result entries, then a hero title ("🕒 **Gyeongbokgung — right now**").
      const entries = [...t.matchAll(/^\*\*\d+\.\s+([^*\n]+?)\*\*/gm)].map((m) => clean(m[1]));
      const hero = /\*\*([^*\n]{2,60})\*\*/.exec(t)?.[1];
      for (const p of [...entries, hero ? clean(hero) : ""]) {
        if (p && p.length > 1 && !/^\d/.test(p) && !ctx.places.includes(p)) ctx.places.push(p);
      }
    }
  }
  ctx.places = ctx.places.slice(0, 6);
  return ctx;
}

/** A short line handed to the LLM so it can resolve "here", "there", "one of these". */
export function contextHint(ctx: ConvoContext): string {
  const bits: string[] = [];
  if (ctx.places.length) bits.push(`places just shown: ${ctx.places.slice(0, 4).join(", ")}`);
  if (ctx.area) bits.push(`area in focus: ${ctx.area}`);
  if (ctx.station) bits.push(`station in focus: ${ctx.station}`);
  if (ctx.busNumber) bits.push(`bus in focus: ${ctx.busNumber}`);
  if (ctx.city) bits.push(`city: ${ctx.city}`);
  return bits.length ? `Conversation so far — ${bits.join(" · ")}.` : "";
}

const BLANK = /^\s*$|^(?:this|that|here|there|it|one of these|the place|거기|여기|이곳|그곳|そこ|ここ|这里|那里)\s*$/i;
const missing = (v: unknown): boolean => typeof v !== "string" || BLANK.test(v);

/**
 * Fill arguments the router left empty (or left as a pronoun) from the slots.
 * Only ever ADDS information the conversation already established — it never
 * overrides something the user actually said.
 */
export function backfillArgs(
  tool: string,
  args: Record<string, unknown>,
  ctx: ConvoContext,
): Record<string, unknown> {
  const out = { ...args };
  const put = (k: string, v?: string): void => {
    if (v && missing(out[k])) out[k] = v;
  };

  switch (tool) {
    case "getNowInfo":
      put("place", ctx.places[0]);
      break;
    case "getAreaGuide":
      put("area", ctx.area ?? ctx.places[0]);
      break;
    case "searchPlaceForeigner":
    case "findForeignerFriendlyStore":
      put("area", ctx.area ?? ctx.station);
      break;
    case "trackBusArrival":
      put("busNumber", ctx.busNumber);
      put("city", ctx.city ?? "Seoul");
      break;
    case "trackSubwayArrival":
      put("station", ctx.station);
      break;
    case "getTransitRoute":
      put("to", ctx.places[0]);
      // "from here" — the station we were just at, else the area in focus.
      put("from", ctx.station ?? ctx.area);
      break;
    default:
      break;
  }
  return out;
}
