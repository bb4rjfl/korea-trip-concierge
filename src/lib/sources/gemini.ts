/**
 * One way to call Gemini, for every part of the service that does.
 *
 * Understanding a question, translating the answer, composing it and reranking
 * search results all called one model on one key. On the free tier that model
 * allows twenty requests a day per project, and when they ran out — early, and
 * every day — the web chat fell back to keyword rules without anyone noticing:
 * "何ができますか" was answered with a bar's opening hours, and Korean, Japanese
 * and Chinese readers got English cards. The key's other Flash models each keep
 * their own allowance, and on the paid tier the same chain rides out one model
 * being overloaded.
 *
 * So a call names the model it prefers and falls through the chain on quota
 * (429), overload (503) or a retired model (404), remembering which model is
 * spent so the next request does not pay for the failed round trip again. The
 * whole chain shares the caller's time budget: a fallback is never allowed to
 * make an answer later than the caller could afford.
 */

import { fetchWithTimeout } from "../http.js";

export interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }[] };
  }[];
}

/** Preferred first; each keeps its own free allowance and its own overload state. */
const CHAIN = ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];

const spentUntil = new Map<string, number>();
let lastLogged = "";

/** Which models are currently being skipped, and until when — for the health endpoint. */
export function geminiSkipped(): Record<string, string> {
  const now = Date.now();
  return Object.fromEntries(
    [...spentUntil.entries()].filter(([, t]) => t > now).map(([m, t]) => [m, new Date(t).toISOString()]),
  );
}

function modelsFor(prefer?: string): string[] {
  const first = (prefer ?? process.env.GEMINI_MODEL ?? CHAIN[0]).trim();
  const now = Date.now();
  const order = [first, ...CHAIN.filter((m) => m !== first)];
  const live = order.filter((m) => (spentUntil.get(m) ?? 0) <= now);
  // If every model is marked spent, try the preferred one anyway: the marks are
  // estimates, and a reset we did not predict should not keep us offline.
  return live.length ? live : [first];
}

function holdFor(status: number, errorBody: string): number {
  if (status === 404) return 24 * 60 * 60_000;
  if (status === 503) return 30_000;
  if (status === 429) return /PerDay/i.test(errorBody) ? 60 * 60_000 : 60_000;
  return 0;
}

/**
 * generateContent on the first model that will answer, within `timeoutMs` in
 * total. Null when none did — callers already fall back to rules or the card.
 */
export async function geminiGenerate(
  body: unknown,
  opts: { timeoutMs: number; prefer?: string },
): Promise<GeminiResponse | null> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) return null;
  const deadline = Date.now() + opts.timeoutMs;
  let first = true;
  for (const model of modelsFor(opts.prefer)) {
    const left = first ? opts.timeoutMs : deadline - Date.now();
    first = false;
    if (left < 700) break;
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
        },
        left,
      );
      if (res.ok) {
        if (lastLogged !== model) {
          if (lastLogged) console.warn(`[gemini] answering on ${model}`);
          lastLogged = model;
        }
        return (await res.json()) as GeminiResponse;
      }
      const text = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      const hold = holdFor(res.status, text);
      if (hold) spentUntil.set(model, Date.now() + hold);
      console.warn(`[gemini] ${model} HTTP ${res.status}${hold ? ` — skipping for ${Math.round(hold / 60_000)} min` : ""}`);
      // 400 is usually this model refusing a parameter another model accepts, so
      // the chain goes on; anything else unexpected ends it.
      if (!hold && res.status !== 400) return null;
    } catch {
      // Timed out or the connection failed: out of time for this call.
      return null;
    }
  }
  return null;
}
