/**
 * Hybrid retrieval over everything this service knows.
 *
 * Why this exists
 * ---------------
 * A sweep of twelve sentences a real visitor would type failed on seven of
 * them, and every failure was the same failure. "Something indoors and quiet,
 * I'm exhausted from shopping" → *Nothing matched*. "I want to see a
 * traditional wedding or ceremony" → *Nothing matched*. "Can I bring my dog
 * into a cafe" → the Centre Pompidou.
 *
 * None of those were missing data. Quiet indoor places, ceremony venues and
 * halal restaurants are all in the corpus already. What was missing was any way
 * to get from an English sentence about being tired to a document about a
 * teahouse — because matching was regular expressions, and a regular expression
 * cannot know that "exhausted from shopping" wants somewhere to sit down.
 *
 * How it works
 * ------------
 * Lexical and semantic search, fused. Published benchmarks are consistent that
 * BM25 and dense embeddings fused with Reciprocal Rank Fusion beat either alone,
 * because they fail differently: BM25 nails a name you typed exactly and is
 * blind to paraphrase; embeddings understand the paraphrase and drift on proper
 * nouns. Fusing them keeps both strengths without tuning a weight.
 *
 * Each document is indexed with a short line saying what *kind* of thing it is
 * ("A place to visit in Seoul", "A Korean dish") prepended to its own text —
 * the cheap form of contextual embedding, and worth it because our documents
 * are short enough that a bare blurb often carries no clue what it describes.
 *
 * What it deliberately does not do
 * --------------------------------
 * It never writes an answer. It picks which of our own documents to answer
 * from, and the answer is that document. See src/lib/sources/embeddings.ts for
 * why that keeps us on the right side of D-009.
 */

import { embedDocuments, embedQuery, embeddingsAvailable, dot } from "./sources/embeddings.js";

export type DocKind = "spot" | "landmark" | "area" | "dish" | "service" | "payment" | "card";

export interface Doc {
  id: string;
  kind: DocKind;
  /** What to show as the name of the hit. */
  title: string;
  /** Everything a query might reasonably match against. */
  text: string;
  /** Which tool answers this, and with what — so a hit becomes an answer. */
  route?: { tool: string; args: Record<string, unknown> };
  /** Set for spots: the neighbourhood, for a one-line label. */
  area?: string;
}

export interface Hit {
  doc: Doc;
  /** Fused rank score. Orders results; says nothing about absolute relevance. */
  score: number;
  /** Which retrievers found it — useful when judging whether to trust a hit. */
  from: ("lexical" | "semantic")[];
  /**
   * Cosine against the query, where the vectors were ready. Unlike the fused
   * score this has an absolute meaning, which is what makes it the thing worth
   * thresholding on.
   */
  cosine?: number;
  /** Raw BM25. Scale depends on the corpus, so only useful comparatively. */
  lexical?: number;
}

/* ------------------------------- tokenizing -------------------------------- */

/**
 * Latin words plus CJK character bigrams.
 *
 * Whitespace tokenizing is useless for Korean: "조용한 카페" and "조용하고
 * 카페" share no token, and Korean particles glue onto every noun. Bigrams over
 * the raw characters sidestep morphology entirely and cost nothing — this is
 * the standard cheap approach for CJK lexical search, and it is why a Korean or
 * Japanese query gets the same quality of lexical match as an English one.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const lower = (text ?? "").toLowerCase();
  for (const word of lower.match(/[a-z0-9][a-z0-9'’-]*/g) ?? []) {
    if (word.length >= 2) out.push(word);
  }
  const cjk = lower.match(/[぀-ヿ㐀-鿿가-힯]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) out.push(run);
    for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

/** Words that match everything and therefore rank nothing. */
const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "are", "can", "any", "where", "what", "how", "want",
  "have", "get", "there", "here", "some", "something", "near", "from", "that", "this", "into",
  "would", "should", "could", "about", "will", "does", "seoul", "korea", "korean",
]);

/* --------------------------------- BM25 ----------------------------------- */

const K1 = 1.4;
const B = 0.72;

interface LexicalIndex {
  /** token → [docIndex, termFrequency][] */
  postings: Map<string, [number, number][]>;
  lengths: number[];
  avgLength: number;
  docCount: number;
}

function buildLexical(docs: Doc[]): LexicalIndex {
  const postings = new Map<string, [number, number][]>();
  const lengths: number[] = [];
  docs.forEach((doc, i) => {
    const tokens = tokenize(`${doc.title} ${doc.text}`);
    lengths.push(tokens.length || 1);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, n] of tf) {
      const list = postings.get(t);
      if (list) list.push([i, n]);
      else postings.set(t, [[i, n]]);
    }
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  return { postings, lengths, avgLength: total / (lengths.length || 1), docCount: docs.length };
}

function bm25(index: LexicalIndex, query: string, limit: number): [number, number][] {
  const terms = tokenize(query).filter((t) => !STOP.has(t));
  if (!terms.length) return [];
  const scores = new Map<number, number>();
  const seen = new Set<string>();
  for (const term of terms) {
    if (seen.has(term)) continue;
    seen.add(term);
    const list = index.postings.get(term);
    if (!list?.length) continue;
    // A term in almost every document tells us nothing; the +0.5 smoothing keeps
    // that from going negative and quietly subtracting relevance.
    const idf = Math.log(1 + (index.docCount - list.length + 0.5) / (list.length + 0.5));
    for (const [docIndex, tf] of list) {
      const norm = tf * (K1 + 1);
      const denom = tf + K1 * (1 - B + (B * index.lengths[docIndex]) / index.avgLength);
      scores.set(docIndex, (scores.get(docIndex) ?? 0) + idf * (norm / denom));
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/* ---------------------------- the index itself ----------------------------- */

/** Prepended before embedding, so a bare blurb still says what it describes. */
const KIND_CONTEXT: Record<DocKind, string> = {
  spot: "A place to visit on a day out in Korea.",
  landmark: "A well-known Korean attraction, with opening hours.",
  area: "A neighbourhood in a Korean city, and what it is like.",
  dish: "A Korean dish: what is in it, how spicy, and its allergens.",
  service: "How a foreign visitor gets past a Korean app, system or requirement.",
  payment: "How paying works in this situation in Korea, for a foreign card.",
  card: "Practical guidance for travelling in Korea.",
};

interface Index {
  docs: Doc[];
  lexical: LexicalIndex;
  /** Parallel to docs; empty until the background embedding pass finishes. */
  vectors: (number[] | undefined)[];
  embedded: boolean;
}

let index: Index | undefined;
let embedding = false;

/** Text we actually embed: what kind of thing, then the thing. */
function embedText(doc: Doc): string {
  return `${KIND_CONTEXT[doc.kind]} ${doc.title}. ${doc.text}`.replace(/\s+/g, " ").slice(0, 1600);
}

/**
 * Install a corpus. Lexical search works immediately; the vectors fill in
 * behind it, exactly like the coordinate pass on the candidate pool — a cold
 * start answers from BM25 rather than waiting on a network round trip per batch.
 */
export function setCorpus(docs: Doc[]): void {
  const deduped: Doc[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    if (!d.id || seen.has(d.id) || !d.text.trim()) continue;
    seen.add(d.id);
    deduped.push(d);
  }
  index = { docs: deduped, lexical: buildLexical(deduped), vectors: deduped.map(() => undefined), embedded: false };
  void fillVectors();
}

export function corpusSize(): number {
  return index?.docs.length ?? 0;
}

export function corpusEmbedded(): boolean {
  return Boolean(index?.embedded);
}

/** Batches of 64: comfortably inside the request limit, few enough round trips. */
async function fillVectors(): Promise<void> {
  if (embedding || !index || !embeddingsAvailable()) return;
  embedding = true;
  const target = index;
  try {
    for (let i = 0; i < target.docs.length; i += 64) {
      const slice = target.docs.slice(i, i + 64);
      const vecs = await embedDocuments(slice.map(embedText));
      if (vecs.length !== slice.length) continue; // a failed batch just stays lexical
      vecs.forEach((v, j) => {
        target.vectors[i + j] = v;
      });
      if (index !== target) return; // corpus was replaced under us
    }
    target.embedded = target.vectors.some(Boolean);
  } finally {
    embedding = false;
  }
}

/* -------------------------------- searching -------------------------------- */

/**
 * Reciprocal Rank Fusion.
 *
 * Ranks, not scores: BM25 scores and cosine similarities are not on the same
 * scale and any attempt to normalise them needs a weight nobody can defend.
 * Summing 1/(k + rank) needs no tuning and is what the benchmarks use. k = 60
 * is the standard constant; it flattens the difference between the top few
 * results so a document both retrievers liked beats one that either loved.
 */
const RRF_K = 60;

export interface SearchOptions {
  /** Restrict to these kinds. Omit for everything. */
  kinds?: DocKind[];
  limit?: number;
}

export async function search(query: string, opts: SearchOptions = {}): Promise<Hit[]> {
  if (!index || !query.trim()) return [];
  const limit = opts.limit ?? 6;
  const allowed = opts.kinds?.length ? new Set(opts.kinds) : undefined;
  const eligible = (i: number) => !allowed || allowed.has(index!.docs[i].kind);

  // Retrieve wide, fuse, then cut — a document ranked 30th by one retriever and
  // 3rd by the other is often the right answer, and a narrow first pass loses it.
  const pool = Math.max(40, limit * 8);
  const lexicalHits = bm25(index.lexical, query, pool * 2)
    .filter(([i]) => eligible(i))
    .slice(0, pool);
  const lexicalScore = new Map(lexicalHits);

  const cosine = new Map<number, number>();
  let semanticRanks: number[] = [];
  const qv = index.embedded ? await embedQuery(query) : undefined;
  if (qv) {
    const scored: [number, number][] = [];
    for (let i = 0; i < index.docs.length; i++) {
      const v = index.vectors[i];
      if (!v || !eligible(i)) continue;
      const c = dot(qv, v);
      cosine.set(i, c);
      scored.push([i, c]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    semanticRanks = scored.slice(0, pool).map(([i]) => i);
  }

  const fused = new Map<number, { score: number; from: Set<"lexical" | "semantic"> }>();
  const add = (ranks: number[], label: "lexical" | "semantic") => {
    ranks.forEach((docIndex, rank) => {
      const entry = fused.get(docIndex) ?? { score: 0, from: new Set<"lexical" | "semantic">() };
      entry.score += 1 / (RRF_K + rank + 1);
      entry.from.add(label);
      fused.set(docIndex, entry);
    });
  };
  add(
    lexicalHits.map(([i]) => i),
    "lexical",
  );
  add(semanticRanks, "semantic");

  return [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([docIndex, { score, from }]) => ({
      doc: index!.docs[docIndex],
      score,
      from: [...from],
      cosine: cosine.get(docIndex),
      lexical: lexicalScore.get(docIndex),
    }));
}

/**
 * Cosine below which a document is not about the query.
 *
 * Measured, not guessed. Six questions this service cannot answer ("capital of
 * France", "bitcoin price", "fix my car engine") land between 0.49 and 0.56;
 * nine it can ("where can I try making kimchi", "somewhere with a night view",
 * "how do I get a T-money card") land between 0.61 and 0.71. The gap is wide
 * and the floor sits in it.
 */
const COSINE_FLOOR = 0.6;

/**
 * BM25 floor, used only when there are no vectors to consult.
 *
 * High, because lexical overlap alone is a poor relevance signal on a corpus
 * this varied: "what is the bitcoin price today" scored 9.6 against the tipping
 * guide on the strength of "price" and "today".
 */
const LEXICAL_ONLY_FLOOR = 14;

/**
 * Is the top hit good enough to answer with?
 *
 * Never thresholded on the fused score: Reciprocal Rank Fusion encodes rank
 * only, so the first result scores 1/61 whether it is perfect or nonsense. The
 * first version of this function did exactly that and passed everything,
 * including an art museum offered as the answer to a question about dogs.
 *
 * When cosine is available it decides alone. Letting a high lexical score
 * override a low cosine is what let the bitcoin question through: if the
 * semantic signal says "this document is not about that", a shared common word
 * is not evidence to the contrary.
 */
export function confident(hits: Hit[]): boolean {
  const top = hits[0];
  if (!top) return false;
  if (top.cosine != null) return top.cosine >= COSINE_FLOOR;
  return (top.lexical ?? 0) >= LEXICAL_ONLY_FLOOR;
}
