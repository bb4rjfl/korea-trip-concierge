/**
 * Fuzzy / semantic name resolution — absorbs typos, case, and spacing
 * differences in station / stop / place / area names, and (when a match isn't
 * confident) surfaces a small set of "did you mean?" candidates so the user can
 * confirm rather than getting a silent wrong answer or a hard "not found".
 *
 * Pure, dependency-free. Used by station/place/stop resolution across tools.
 */

// Words/suffixes that carry no discriminating signal — dropped before comparing
// so "Incheon Airport Terminal 1" ≈ "Incheon Airport T1" ≈ "incheon airport".
const NOISE = /\b(station|stn|line|the|of|palace|temple|market|airport|terminal|intl|international|express|bus|terminal1|t1|t2)\b/g;

/** Canonical comparison form: lowercase, NFC, strip noise words + non-alnum. */
export function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/터미널\s*1/g, "t1")
    .replace(/터미널\s*2/g, "t2")
    .replace(NOISE, " ")
    .replace(/역$/u, "")
    .replace(/[^a-z0-9가-힣]/g, "")
    .trim();
}

/** Levenshtein edit distance (iterative, O(n·m) with a single row). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity in [0,1] between two raw names (normalized internally). */
export function similarity(a: string, b: string): number {
  const A = normalizeName(a);
  const B = normalizeName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  // One fully containing the other (e.g. "incheonairport" ⊂ "incheonairportt1").
  // Require the contained side to be ≥2 chars: a single-letter overlap is noise
  // (e.g. a katakana alias normalizing to a lone "n" must not match any word
  // containing "n").
  if (Math.min(A.length, B.length) >= 2 && (A.includes(B) || B.includes(A))) return 0.9;
  const dist = levenshtein(A, B);
  return 1 - dist / Math.max(A.length, B.length);
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/** Rank items by the best similarity of `input` to any of an item's keys. */
export function rankCandidates<T>(input: string, items: T[], keysOf: (item: T) => string[]): Ranked<T>[] {
  return items
    .map((item) => ({
      item,
      score: Math.max(0, ...keysOf(item).map((k) => similarity(input, k))),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type Resolution<T> =
  | { kind: "exact"; item: T }
  | { kind: "suggest"; items: T[] }
  | { kind: "none" };

export interface ResolveOpts {
  exact?: number; // ≥ this score (and clear lead) → accept outright
  suggest?: number; // ≥ this score → offer as a candidate
  maxSuggest?: number; // how many candidates to surface
}

/**
 * Resolve `input` against `items`:
 *  - exact: a confident, clearly-leading match → use it.
 *  - suggest: one or more plausible matches but not confident → ask the user.
 *  - none: nothing close enough.
 */
export function resolveName<T>(
  input: string,
  items: T[],
  keysOf: (item: T) => string[],
  opts: ResolveOpts = {},
): Resolution<T> {
  const exact = opts.exact ?? 0.9;
  const suggest = opts.suggest ?? 0.5;
  const maxSuggest = opts.maxSuggest ?? 3;

  const ranked = rankCandidates(input, items, keysOf);
  if (!ranked.length || ranked[0].score < suggest) return { kind: "none" };

  const top = ranked[0];
  const lead = ranked.length < 2 ? 1 : top.score - ranked[1].score;
  // Confident: high score AND either alone or clearly ahead of the runner-up.
  if (top.score >= exact && (ranked.length < 2 || lead > 0.12 || ranked[1].score < suggest)) {
    return { kind: "exact", item: top.item };
  }
  return { kind: "suggest", items: ranked.slice(0, maxSuggest).map((r) => r.item) };
}
