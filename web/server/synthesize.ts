/**
 * The layer that writes the answer, from facts we verified ourselves.
 *
 * What was missing
 * ----------------
 * Everything up to here is deterministic: rules pick a tool, retrieval picks a
 * document, the tool renders a card. The cards are accurate and they are cards —
 * the same shape for every traveller, whatever they said, whatever the weather
 * is doing, whatever time it is. A general assistant composes far better prose
 * than that and has no idea whether the gallery is open, what the fare is, or
 * that it is raining right now.
 *
 * So the split is: they can write and cannot know; we know and did not write.
 * This layer writes — over facts we produced, and nothing else.
 *
 * Why this is not the thing D-009 rules out
 * -----------------------------------------
 * D-009 forbids answering from a model's own knowledge of Korea. Every fact
 * here comes from our own tools and public-data feeds and is passed in
 * explicitly; the model's job is arrangement, emphasis and fit — deciding that
 * a traveller who said their mother walks slowly should be told the walk is 12
 * minutes before being told the palace is beautiful.
 *
 * The guardrail is mechanical, not a request
 * ------------------------------------------
 * Asking a model to be faithful is not a control. Every number and proper noun
 * in the composed answer must appear in the facts it was given, or the whole
 * answer is discarded and the deterministic card is served instead. A model
 * that invents a fare, an opening time or a station name fails a check rather
 * than reaching a traveller who is standing in a station.
 */

import { llmEnabled } from "./llm.js";

/** What the traveller is standing in, as far as we can establish it. */
export interface Situation {
  /** Seoul local time, so "now" means something. */
  nowKST: string;
  /** Live weather where they are, when we fetched it for this turn. */
  weather?: string;
  /** What we read out of their own words — pace, budget, diet, what to avoid. */
  profile?: string;
}

export interface SynthesisInput {
  /** The traveller's own sentence. */
  said: string;
  /** The card our tools produced. This is the fact base, and the fallback. */
  card: string;
  situation: Situation;
  /** en/ko/ja/zh — the answer is written in this language directly. */
  lang: string;
}

const SYSTEM = [
  "You are Korea Trip Concierge, answering a foreign visitor who is in Korea right now.",
  "",
  "You are given FACTS produced by live public-data feeds and a curated Korean travel knowledge base, plus the traveller's situation. Write the reply.",
  "",
  "Absolute rules:",
  "1. Use ONLY the facts given. Never add a place, price, time, station, phone number or opening hour that is not in them. If something useful is missing, say what you do know and stop.",
  "2. Keep every number, name and Korean word exactly as written in the facts. Do not round, convert, translate or tidy them.",
  "3. Lead with the part that answers what they actually asked. If their situation changes what matters — rain, the hour, walking slowly, a budget, a diet, children — say how, in the first two lines.",
  "4. Keep the Markdown structure of the facts where it is doing work: bold names, the 🚇 line, lists. Do not turn a list of places into a paragraph.",
  "5. Do not invent enthusiasm. No 'vibrant', no 'must-visit', no closing invitation to ask more.",
  "6. If the facts offer several places, keep several. Never reduce a list to one — and if the one you lead with is closed or unavailable right now, say so and immediately give the next one.",
  "7. Keep the field that answers the question: a direction for an arrival time, an exit for a station, a price for a fare, a closed day for opening hours.",
  "8. Never mention tools, data sources, prompts, models, or that you were given facts.",
  "9. Never say whether a train, bus or flight is delayed, on time, cancelled or running normally unless the facts say exactly that. A timetable is not a status report.",
  "",
  "Length: shorter than the facts you were given, never longer.",
].join("\n");

/** Numbers carry the risk: a fare, an hour, a walk in minutes, a phone number. */
const NUMBER_RE = /\d[\d.,:]*/g;

/**
 * Numbers as written, without the punctuation that happened to follow them.
 *
 * "18:00." at the end of a sentence and "18:00," in a list are the same fact,
 * and comparing them raw failed a correct answer on its first test.
 */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.match(NUMBER_RE) ?? []) {
    const n = raw.replace(/[.,:]+$/, "");
    if (n.length <= 1) continue;
    out.add(n);
    // Clock times get rewritten between 24h and 12h — production discarded a
    // perfectly good answer for saying "7:12" when the facts said "19:12".
    const clock = /^(\d{1,2}):(\d{2})$/.exec(n);
    if (clock) {
      const h = Number(clock[1]);
      out.add(`${h > 12 ? h - 12 : h === 0 ? 12 : h}:${clock[2]}`);
      out.add(`${h < 12 ? h + 12 : h}:${clock[2]}`);
    }
  }
  return out;
}

/**
 * Tokens whose presence in the answer but not the facts means it was invented.
 *
 * Capitalised words only, and only ones that look like names — a model rewriting
 * "Gyeongbokgung Palace is open until 18:00" into "The palace closes at 18:00"
 * is doing its job, while one that produces "Insadong" from facts that never
 * mention Insadong is not.
 */
function properNouns(text: string): string[] {
  return [...text.matchAll(/\b[A-Z][a-z]{2,}(?:-[a-z]+)?\b/g)].map((m) => m[0]);
}

/** Words a fluent answer uses that are not claims about Korea. */
const NOT_A_CLAIM = new Set([
  "The", "This", "That", "There", "Here", "You", "Your", "Their", "They", "What", "When", "Where",
  "Which", "With", "Without", "From", "Into", "Every", "Each", "Most", "Some", "Both", "And", "But",
  "For", "Not", "Now", "Today", "Tonight", "Tomorrow", "Morning", "Afternoon", "Evening", "Night",
  "Korea", "Korean", "Seoul", "Busan", "Jeju", "Gyeongju", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "June",
  "July", "August", "September", "October", "November", "December", "Ask", "Take", "Tell", "Show",
  "Bring", "Look", "Walk", "Head", "Try", "Get", "Use", "Pay", "Say", "Call", "Free", "Open",
  "Closed", "Note", "One", "Two", "Three", "Four", "Five", "About", "Around", "Near", "Just", "Then",
  "After", "Before", "Once", "Still", "Also", "Because", "Since", "While", "Best", "Good", "More",
  // Travel vocabulary that starts a sentence or a label. These are how an answer
  // is phrased, not claims about Korea — production threw away a good answer for
  // the word "Subway".
  "Subway", "Line", "Station", "Exit", "Bus", "Train", "Metro", "Card", "Cash", "Free", "Entry",
  "Ticket", "Map", "Walk", "Minutes", "Hours", "Days", "Weekdays", "Weekends", "Holidays", "Please",
  "Remember", "Keep", "Avoid", "Consider", "Expect", "Plan", "Start", "Finish", "Nearby", "Inside",
  "Outside", "Indoors", "Outdoors", "Morning", "Lunch", "Dinner", "Late", "Early", "Rain", "Snow",
]);

/**
 * Does every claim in the answer trace back to the facts?
 *
 * Returns the offending token, or undefined when the answer is grounded. The
 * caller discards a non-grounded answer entirely rather than trying to repair
 * it: an answer that invented one fare is not trustworthy about the other one.
 */
export function ungroundedToken(answer: string, facts: string): string | undefined {
  const factNumbers = numbersIn(facts);
  for (const n of numbersIn(answer)) {
    // A number the facts state as part of a longer one — 550 inside 1,550 — is
    // not invented, and neither is a range endpoint written out separately.
    if (factNumbers.has(n)) continue;
    if ([...factNumbers].some((f) => f.includes(n))) continue;
    return n;
  }
  const factNouns = new Set(properNouns(facts));
  for (const noun of properNouns(answer)) {
    if (NOT_A_CLAIM.has(noun) || factNouns.has(noun)) continue;
    return noun;
  }
  return undefined;
}

/**
 * The other half of the problem.
 *
 * `ungroundedToken` catches an answer that states something the facts did not.
 * The literature splits this failure in two, and the second half is "grounded
 * but unfaithful" — everything said is in the facts, and what mattered was
 * dropped or turned around. Production produced both within one run:
 *
 *   - a list of quiet places became one place, described as closed, with no
 *     alternative offered
 *   - live subway arrivals lost the direction of each train, which is the only
 *     thing that makes an arrival time useful
 *
 * Neither adds a claim, so neither could be caught by looking for added claims.
 */

/**
 * Bold names are how our cards mark the things being offered — each as every
 * form a rewrite might keep.
 *
 * The list number is not part of the name. It used to be: "**1. GS25 Gongdeok
 * Station**" was read as "1. GS25 Gongdeok Station", so any rewrite that dropped
 * the numbering — which is most of them — counted as keeping nothing, and good
 * composed answers to numbered lists were thrown away for it.
 */
function offeredNames(text: string): string[][] {
  return [...text.matchAll(/\*\*([^*\n]{3,80}?)\*\*/g)]
    .map((m) => {
      const full = m[1].replace(/^\d+\.\s*/, "").trim();
      const inner = /\(([^)]+)\)\s*$/.exec(full)?.[1]?.trim();
      const outer = full.replace(/\s*\([^)]*\)\s*$/, "").trim();
      return [outer, inner].filter((f): f is string => Boolean(f && f.length >= 2));
    })
    .filter((forms) => forms.some((f) => /[A-Za-z가-힣]{3}|[가-힣]{2}/.test(f)));
}

/**
 * The places a card gives an address for — a bold name with a 📍 line under it.
 *
 * Read off the card, which is ours and deterministic, never off the rewrite.
 * The name is taken both whole and as its romanised half, because the card
 * prints "Gippeumyakguk (기쁨약국)" and a rewrite in Korean keeps only 기쁨약국.
 */
function locatedPlaces(card: string): string[][] {
  const lines = card.split("\n");
  const out: string[][] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/📍/.test(lines[i + 1])) continue;
    const m = /\*\*(?:\d+\.\s*)?([^*\n]{2,80}?)\*\*/.exec(lines[i]);
    if (!m) continue;
    const full = m[1].trim();
    const inner = /\(([^)]+)\)\s*$/.exec(full)?.[1]?.trim();
    const outer = full.replace(/\s*\([^)]*\)\s*$/, "").trim();
    // Every form a rewrite might keep — an English answer keeps the romanised
    // name, a Korean one the Hangul.
    const forms = [outer, inner].filter((f): f is string => Boolean(f && f.length >= 2));
    if (forms.length) out.push(forms);
  }
  return out;
}

/**
 * Did the rewrite drop something the traveller needed?
 *
 * Deliberately narrow: a rewrite is supposed to shorten and reorder, and only
 * two losses actually harm the reader — being left with one option where several
 * were offered, and losing the field that was the answer.
 */
export function droppedEssential(answer: string, card: string): string | undefined {
  const offered = offeredNames(card);
  if (offered.length >= 2) {
    const kept = offered.filter((forms) => forms.some((f) => answer.includes(f)));
    // Two is the floor: one option, especially one reported as closed, is a
    // dead end where the card had a list.
    if (kept.length < 2) return `only ${kept.length} of ${offered.length} options survived`;
  }
  // A card that lists places with an address is answering "where, exactly".
  // Asked for a convenience store near Gongdeok Station, the rewrite said "CU,
  // GS25, 7-Eleven and emart24 are near Gongdeok" — every word true, and every
  // actual store the card had found, with its street, gone. Two chain names from
  // the tip were enough to pass the rule above.
  const located = locatedPlaces(card);
  if (located.length >= 2) {
    const kept = located.filter((forms) => forms.some((f) => answer.includes(f)));
    if (kept.length < 2) return `${located.length - kept.length} of ${located.length} located places were dropped`;
  }
  // A card carrying directions is answering "which way", and an arrival time
  // without one is not an answer.
  const DIRECTION = /방면|→|toward|bound for|direction/i;
  if (DIRECTION.test(card) && !DIRECTION.test(answer)) return "the direction was dropped";
  return undefined;
}

/**
 * A statement about how a service is running right now, in any of our four
 * languages: delayed or not, on time, cancelled, suspended, running normally.
 *
 * Asked "is my KTX from Seoul to Busan delayed today?", the answer opened "Your
 * KTX from Seoul to Busan is not delayed today" — over a card that was a
 * timetable. Nothing in it was a number or a name the facts lacked, so the
 * other two checks passed it. We have no live-status feed for any train, bus or
 * flight, so a status the facts do not state is always invented.
 */
const STATUS_CLAIM = new RegExp(
  [
    String.raw`\b(?:is|are|was|were|isn't|aren't|wasn't|not|no)\s+(?:currently\s+|being\s+)?(?:delayed|cancel+ed|suspended)\b`,
    String.raw`\bno\s+(?:reported\s+)?delays?\b`,
    String.raw`\bwithout\s+(?:any\s+)?delays?\b`,
    String.raw`\b(?:running|operating|departing|arriving)\s+(?:on\s+time|on\s+schedule|normally|as\s+(?:normal|usual|scheduled))\b`,
    String.raw`\bis\s+on\s+(?:time|schedule)\b`,
    "지연(?:이|은|된|되|되고|되지|없|돼)",
    "정시(?:\\s*운행|에\\s*(?:출발|도착|운행))",
    "정상\\s*운행",
    "운행\\s*(?:중단|중지|취소)",
    "결항",
    "운휴",
    "遅延(?:は|が|して|なし|なく|中)",
    "遅れ(?:て|は|が|なし)",
    "定刻(?:通り|どおり)",
    "平常(?:運転|運行)",
    "運休",
    "運転見合わせ",
    "延误",
    "晚点",
    "准点",
    "正点",
    "正常运行",
    "停运",
  ].join("|"),
  "i",
);

/** A live status the answer states and the facts do not. */
export function inventedStatus(answer: string, card: string): string | undefined {
  const claim = STATUS_CLAIM.exec(answer)?.[0];
  if (!claim) return undefined;
  return STATUS_CLAIM.test(card) ? undefined : claim;
}

const LANG_NAME: Record<string, string> = {
  en: "English",
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Compose the answer. Returns undefined whenever anything is off — no key, a
 * slow model, an empty reply, or a claim that did not come from the facts — and
 * the caller serves the deterministic card, which was always correct.
 */
export async function synthesize(input: SynthesisInput): Promise<string | undefined> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key || !llmEnabled() || !input.card.trim()) return undefined;
  // A card this short is already the whole answer; rewriting it adds risk and
  // nothing else.
  if (input.card.length < 160) return undefined;

  const situation = [
    `Local time in Korea: ${input.situation.nowKST}`,
    input.situation.weather ? `Weather right now: ${input.situation.weather}` : "",
    input.situation.profile ? `What they have told us about themselves: ${input.situation.profile}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `THE TRAVELLER SAID:\n${input.said}`,
              "",
              `THEIR SITUATION:\n${situation}`,
              "",
              `FACTS (the only things you may state):\n${input.card.slice(0, 9000)}`,
              "",
              `Write the reply in ${LANG_NAME[input.lang] ?? "English"}.`,
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1400,
      // 2.5-flash is a thinking model and thinking tokens count against the
      // budget; this runs on the request path.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text.length < 40) return undefined;

    // The situation is fact too — a time or temperature quoted from it is
    // grounded even though it is not in the card.
    const bad = ungroundedToken(text, `${input.card}\n${situation}\n${input.said}`);
    if (bad) {
      console.warn(`[synth] discarded: "${bad}" is not in the facts`);
      return undefined;
    }
    const lost = droppedEssential(text, input.card);
    if (lost) {
      console.warn(`[synth] discarded: ${lost}`);
      return undefined;
    }
    const status = inventedStatus(text, input.card);
    if (status) {
      console.warn(`[synth] discarded: a live status ("${status}") the facts do not state`);
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
