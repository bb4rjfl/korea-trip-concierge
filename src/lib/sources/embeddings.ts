/**
 * Text embeddings, for ranking our own corpus against what someone actually typed.
 *
 * Why this does not breach D-009 (no runtime LLM grounding)
 * --------------------------------------------------------
 * An embedding model here never writes a sentence. It turns a phrase into a
 * vector so we can *rank documents we authored ourselves* — curated spots, the
 * city's own tourism blurbs, our dish and service guides. Every word that
 * reaches the traveller still comes from that corpus, so there is no
 * hallucination surface and nothing third-party is generated. What changes is
 * only which of our own answers we choose.
 *
 * Why a hosted model rather than a local one
 * ------------------------------------------
 * The box this runs on is four cores with no GPU. A local multilingual encoder
 * would either be too slow at request time or too weak to be worth the RAM.
 * Gemini's embedding model is multilingual across the four languages we serve,
 * and our whole corpus is a few hundred short documents — under a cent to index.
 *
 * Failure is not an error. If the key is missing, the call is slow, or the
 * service is down, the caller falls back to lexical search, which is worse at
 * paraphrase and perfectly serviceable at names.
 */

import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

const MODEL = "gemini-embedding-001";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;

/**
 * 768 rather than the full 3072. The model is trained so a truncated vector
 * stays useful (Matryoshka), the price is the same either way, and a corpus of
 * a few hundred documents gains nothing from four times the memory.
 */
export const EMBED_DIMS = 768;

/** A query is embedded on the request path, so it gets a tight leash. */
const QUERY_TIMEOUT_MS = 1200;
/** Indexing runs in the background and may take its time. */
const INDEX_TIMEOUT_MS = 20_000;

/** Queries repeat far more than documents do; 6h of them costs nothing to hold. */
const queryCache = new TtlCache<number[]>(6 * 60 * 60_000);

function key(): string {
  return process.env.GEMINI_API_KEY ?? "";
}

export function embeddingsAvailable(): boolean {
  return Boolean(key());
}

interface EmbedResponse {
  embeddings?: { values?: number[] }[];
  embedding?: { values?: number[] };
}

/**
 * `taskType` is not decoration: asking for RETRIEVAL_QUERY and
 * RETRIEVAL_DOCUMENT puts questions and answers in the same space on purpose,
 * and using one for both measurably weakens ranking.
 */
async function embed(texts: string[], taskType: string, timeoutMs: number): Promise<number[][]> {
  if (!key() || !texts.length) return [];
  const body = {
    requests: texts.map((text) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBED_DIMS,
    })),
  };
  const json = await fetchJson<EmbedResponse>(
    `${ENDPOINT}:batchEmbedContents?key=${encodeURIComponent(key())}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    timeoutMs,
  );
  const rows = json.embeddings ?? (json.embedding ? [json.embedding] : []);
  return rows.map((r) => normalize(r.values ?? []));
}

/**
 * Unit-length vectors, so similarity is a dot product.
 *
 * Truncated Matryoshka vectors are *not* unit length as returned, and skipping
 * this makes every score subtly wrong in a way that still looks plausible.
 */
function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const len = Math.sqrt(sum);
  return len > 0 ? v.map((x) => x / len) : v;
}

/** Embed corpus documents. Batched by the caller; empty array on any failure. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "RETRIEVAL_DOCUMENT", INDEX_TIMEOUT_MS).catch(() => []);
}

/** Embed one search phrase. Cached, and undefined rather than throwing. */
export async function embedQuery(text: string): Promise<number[] | undefined> {
  const q = text.trim().slice(0, 800);
  if (!q || !key()) return undefined;
  const cached = queryCache.get(q.toLowerCase());
  if (cached) return cached;
  const [vec] = await embed([q], "RETRIEVAL_QUERY", QUERY_TIMEOUT_MS).catch(() => []);
  if (vec?.length) queryCache.set(q.toLowerCase(), vec);
  return vec?.length ? vec : undefined;
}

/** Both vectors are unit length, so this is the cosine. */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
