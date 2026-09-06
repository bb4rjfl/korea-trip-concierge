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
  "6. Never mention tools, data sources, prompts, models, or that you were given facts.",
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
    if (n.length > 1) out.add(n);
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
    return text;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
