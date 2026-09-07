/**
 * Reranking: a second, more careful look at the shortlist.
 *
 * Why a reranker at all
 * ---------------------
 * Retrieval scores a query against each document independently — the query
 * vector never meets the document text. That is what makes it fast enough to
 * run over the whole corpus, and it is also why the top few results are often
 * the right *neighbourhood* in the wrong order. A reranker reads the query and
 * a candidate together and answers a narrower question: of these ten, which
 * actually answers this. Published comparisons put that at five to fifteen
 * points of MRR on hard queries, which is worth one extra call on the shortlist.
 *
 * Why this one
 * ------------
 * A hosted cross-encoder would mean a new vendor, a new key and a new bill for
 * one function. We already call Gemini for routing, translation and
 * composition, and asking it to order ten short candidates is a small, cheap,
 * well-shaped task. The box has no GPU, so running a cross-encoder locally is
 * not on the table.
 *
 * What it is not allowed to do
 * ----------------------------
 * It returns positions, never text. The answer is still assembled from the
 * documents we hold; the model only says which of them to put first. Anything
 * unexpected in the reply — a position that was not offered, a truncated list,
 * a slow call — and the fused order stands. Reordering must never be able to
 * lose a candidate or invent one.
 *
 * It also gets one attempt, not the usual retry: a second try would double the
 * worst case to three seconds, and this is an improvement to an answer we
 * already have, not a fact we need.
 */

import { fetchWithTimeout } from "../http.js";
import { TtlCache } from "../cache.js";

/** The shortlist is small and the task is easy; a long wait is never worth it. */
const TIMEOUT_MS = 1500;

/**
 * The smallest model that can do this.
 *
 * Ordering ten one-line candidates is not the reasoning task the composing
 * layer does, and this sits directly on the request path, so it runs on the
 * lite model rather than the one that writes answers. Overridable, because the
 * right size for this is a measurement and not a belief.
 */
const RERANK_MODEL = (process.env.RERANK_MODEL ?? "gemini-2.5-flash-lite").trim();

/** Beyond this many candidates the prompt gets long and the gain flattens. */
const MAX_CANDIDATES = 10;

/** Same query, same shortlist, same answer — and chips re-ask constantly. */
const cache = new TtlCache<number[]>(30 * 60_000);

export interface RerankCandidate {
  title: string;
  /** A line or two — enough to judge relevance, short enough to stay cheap. */
  snippet: string;
  /**
   * What sort of thing this is — a place, a dish, a guide to a Korean system.
   *
   * We know it and were throwing it away. "I need a pharmacy open late at
   * night" retrieves three sightseeing spots above the guide that answers it,
   * and told only the names, a model has to infer from "Cheomseongdae" that an
   * observatory is not a pharmacy. Told that one candidate is a guide to
   * getting help and the others are places to visit, the question answers
   * itself. It is the same reason the corpus embeds a kind line with each
   * document: a short text often does not say what it is.
   */
  kind?: string;
}

function enabled(): boolean {
  // An explicit off switch, so a latency incident can disable reranking without
  // a deploy.
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim()) && process.env.RERANK !== "off";
}

const INSTRUCTIONS = [
  "You are ranking candidate answers to a traveller's question about Korea.",
  "",
  "You are given the question and a numbered list of candidates. Put them in order of how well each ANSWERS THE QUESTION ASKED — not how popular, famous or generally good it is.",
  "",
  "Judge on:",
  "- does it match what was actually asked for (a gallery is not a library; a quiet place is not a mall)",
  "- does it satisfy every condition in the question, not just the main noun",
  "- would a well-informed local put it first",
  "",
  'Reply as JSON only: {"order": [<indices, best first>]}',
  "List ALL of the indices you were given, each exactly once, best first. Do not add commentary.",
].join("\n");

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Order the shortlist. Returns indices into `candidates`, best first, or
 * undefined when anything is off — in which case the caller keeps its own order,
 * which was already a reasonable answer.
 */
export async function rerank(query: string, candidates: RerankCandidate[]): Promise<number[] | undefined> {
  if (!enabled() || candidates.length < 3) return undefined;
  const list = candidates.slice(0, MAX_CANDIDATES);
  const key = `${query} :: ${list.map((c) => c.title).join("|")}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const numbered = list
    .map((c, i) => {
      const what = c.kind ? `[${c.kind}] ` : "";
      return `${i}. ${what}${c.title} — ${c.snippet.replace(/\s+/g, " ").slice(0, 200)}`;
    })
    .join("\n");
  const body = {
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: `QUESTION:\n${query}\n\nCANDIDATES:\n${numbered}` }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 200,
      responseMimeType: "application/json",
      // 2.5-flash thinks by default and thinking tokens come out of the budget;
      // this runs on the request path.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(RERANK_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": (process.env.GEMINI_API_KEY ?? "").trim() },
        body: JSON.stringify(body),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) return give_up(`HTTP ${res.status}`);
    const json = (await res.json()) as GeminiResponse;
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(reply) as { order?: unknown };
    const order = Array.isArray(parsed.order) ? parsed.order : undefined;
    if (!order) return give_up(`no order in ${reply.slice(0, 80)}`);

    // A reorder must be exactly that. Anything the model returned that was not
    // offered is dropped, and anything it forgot is appended in the order we
    // already had — so the shortlist can never shrink or gain a member.
    const seen = new Set<number>();
    const cleaned: number[] = [];
    for (const position of order) {
      const i = Number(position);
      if (!Number.isInteger(i) || i < 0 || i >= list.length || seen.has(i)) continue;
      seen.add(i);
      cleaned.push(i);
    }
    for (let i = 0; i < list.length; i++) if (!seen.has(i)) cleaned.push(i);
    // A partial answer is still an answer. Asked which of eight documents
    // answers "I need a pharmacy open late at night", the model replies with
    // the single index that does and says nothing about the three sightseeing
    // spots ranked above it — which is correct, and which a rule demanding a
    // full permutation was throwing away. What it named goes first, in its
    // order; what it did not stays in ours. A reply naming nothing at all is
    // not a ranking, and there the fused order stands.
    if (!seen.size || cleaned.length !== list.length) return give_up(`named ${seen.size} of ${list.length}`);

    cache.set(key, cleaned);
    return cleaned;
  } catch (err) {
    return give_up(err instanceof Error ? err.message : "failed");
  }
}

/**
 * Say why the fused order stood.
 *
 * A reranker that quietly does nothing looks exactly like a reranker that is
 * working, which is how the composing layer spent a week discarding good
 * answers over a 12-hour clock before its own discards were logged.
 */
function give_up(why: string): undefined {
  console.warn(`[rerank] kept retrieval order: ${why}`);
  return undefined;
}
