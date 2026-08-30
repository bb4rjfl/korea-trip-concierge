/**
 * Optional LLM intent layer — Gemini function calling over plain REST (no SDK).
 * Env-gated by GEMINI_API_KEY: absent/empty = layer off, the rule router carries
 * everything. ANY failure (timeout, quota, parse) returns null so the caller
 * falls back — the LLM is a comprehension booster, never a dependency.
 */

import { CATALOG, type FunctionDeclaration } from "./catalog.js";
import type { Lang } from "./router.js";

export interface LlmToolCall {
  kind: "tool";
  name: string;
  args: Record<string, unknown>;
}
export interface LlmText {
  kind: "text";
  text: string;
}
export type LlmDecision = LlmToolCall | LlmText;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const LANG_NAMES: Record<Lang, string> = { en: "English", ja: "Japanese", zh: "Chinese (Simplified)", ko: "Korean" };

export function llmEnabled(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").trim().length > 0;
}

// Trim tool descriptions for the prompt — full MCP descriptions are ~1k chars each.
let declarationsCache: FunctionDeclaration[] | null = null;
function declarations(): FunctionDeclaration[] {
  declarationsCache ??= CATALOG.map((t) => ({
    ...t.declaration,
    description: t.declaration.description.slice(0, 400),
  }));
  return declarationsCache;
}

function systemInstruction(lang: Lang): string {
  return [
    "You are the intent router for 'Korea Trip Concierge', a real-time travel-help chat for visitors in Korea.",
    "STRONGLY prefer calling exactly one tool for anything about traveling in Korea: places, food/menus, transit routes, bus/subway arrivals, weather/air, payments, Korean apps & identity verification, Jeju, neighborhoods, opening hours, itineraries.",
    "Pass slot values in the user's own words — tools fuzzy-match names in any language; do not translate or romanize place names yourself.",
    "For search-like tools put the user's full request (minus filler) in `query`, and the neighborhood/area in `area` when mentioned.",
    `When a tool has a 'language' parameter, set it to '${lang}'.`,
    "If the user's message is a follow-up (e.g. 'what about Busan?'), resolve it against the recent conversation before choosing args.",
    "Resolve pronouns from the conversation: 'here', 'there', 'this place', 'one of these', 'that bus' all refer to something already named above — pass the concrete name, never the pronoun.",
    "Never ask the user to repeat something the conversation already established (which city, which place, where you are) — take it from the conversation.",
    `Only when no tool fits (greetings, thanks, questions about this service): reply directly in ${LANG_NAMES[lang]}, at most 2 short sentences, warmly, and mention one or two things you can help with.`,
    "Never state facts about Korea from your own knowledge — real facts must come from tools.",
    "You are Korea Trip Concierge, a travel service. Never describe yourself as a language model, name the company that built you, or mention tools, prompts or internal plumbing. If asked what you are, say you are a travel assistant for visitors in Korea and offer to help.",
  ].join(" ");
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }[] };
  }[];
}

async function geminiGenerate(body: unknown, timeoutMs: number): Promise<GeminiResponse | null> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) return null;
  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.warn(`[llm] gemini HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as GeminiResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------- output translation ---------------------------- */

// The 13 tools answer English-first (their MCP host translated for users; on the
// web we are the host). Translate tool Markdown for ko/ja/zh readers, with a small
// TTL cache so chip round-trips don't re-pay the call.
const translateCache = new Map<string, { value: string; exp: number }>();
const TRANSLATE_TTL_MS = 60 * 60 * 1000;
const TRANSLATE_CACHE_MAX = 300;

export async function llmTranslate(
  markdown: string,
  lang: Lang,
  timeoutMs = 9000,
  /** The reader wrote in Traditional characters, so answer in them. */
  traditional = false,
): Promise<string | null> {
  if (!llmEnabled() || lang === "en") return null;
  const cacheKey = `${lang}${traditional ? "-hant" : ""}:${markdown}`;
  const hit = translateCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.value;

  // Swap long URLs for tiny placeholders before translating — cuts tokens hard
  // (map links dominate place lists) and makes URL corruption impossible.
  const urls: string[] = [];
  const masked = markdown.replace(/\((https?:\/\/[^\s)]+)\)/g, (_m, url: string) => {
    urls.push(url);
    return `(__L${urls.length - 1}__)`;
  });

  const prompt = [
    `Translate the following Markdown travel answer into ${
      traditional ? "Traditional Chinese (繁體中文, as written in Taiwan and Hong Kong)" : LANG_NAMES[lang]
    }.`,
    "Keep ALL Markdown structure, emoji, placeholders like (__L0__), numbers, and times unchanged.",
    "Proper nouns (station/place/dish names) may stay as-is or add the local form.",
    "Translate only the prose. Do not add or remove information. Output ONLY the translated Markdown.",
    "",
    masked,
  ].join("\n");

  // One retry: a dropped translation used to surface as an English card inside a
  // Korean session, so the same question looked translated on one turn and not on
  // the next. Retrying costs a second only when the first attempt actually failed.
  let json = await geminiGenerate(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 3072, thinkingConfig: { thinkingBudget: 0 } },
    },
    timeoutMs,
  );
  if (!json?.candidates?.[0]?.content?.parts?.length) {
    json = await geminiGenerate(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 3072, thinkingConfig: { thinkingBudget: 0 } },
      },
      timeoutMs,
    );
  }
  let raw = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!raw) return null;
  // Strip a chatty preamble ("Here is your translated Markdown:") — one leaked
  // into a live answer and read as if the service were talking to itself.
  raw = raw.replace(/^[^\n]{0,120}?(?:markdown|マークダウン|마크다운|Markdown)[^\n]{0,40}[:：]\s*\n+/i, "").trim();
  // Unwrap a fenced block if the model wrapped the whole answer in one.
  const fence = /^```[a-z]*\s*\n([\s\S]*?)\n```$/.exec(raw);
  if (fence) raw = fence[1].trim();

  // Restore URLs; if the model mangled a placeholder, fail closed (fallback note).
  const text = raw.replace(/__L(\d+)__/g, (_m, i: string) => urls[Number(i)] ?? "");
  if (/__L\d+__/.test(text) || (urls.length > 0 && !text.includes(urls[0]))) return null;

  if (translateCache.size >= TRANSLATE_CACHE_MAX) {
    const first = translateCache.keys().next().value;
    if (first !== undefined) translateCache.delete(first);
  }
  translateCache.set(cacheKey, { value: text, exp: Date.now() + TRANSLATE_TTL_MS });
  return text;
}

/**
 * Decide tool-vs-text for the latest user message. `history` is the recent
 * window (user + assistant turns, newest last). Returns null on any failure.
 */
export async function llmDecide(
  history: ChatTurn[],
  lang: Lang,
  contextHint = "",
  timeoutMs = 4500,
): Promise<LlmDecision | null> {
  if (!llmEnabled()) return null;

  const contents = history.slice(-8).map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.content.slice(0, 1200) }],
  }));

  const json = await geminiGenerate(
    {
      systemInstruction: { parts: [{ text: systemInstruction(lang) + (contextHint ? " " + contextHint : "") }] },
      contents,
      tools: [{ functionDeclarations: declarations() }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      // thinkingBudget 0: 2.5-flash is a thinking model, and thinking tokens count
      // against maxOutputTokens — long thinking returned EMPTY visible output.
      generationConfig: { temperature: 0.2, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
    },
    timeoutMs,
  );
  if (!json) return null;

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      return { kind: "tool", name: p.functionCall.name, args: p.functionCall.args ?? {} };
    }
  }
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (text) return { kind: "text", text };
  console.warn(`[llm] decide: empty candidate (parts=${parts.length})`);
  return null;
}
