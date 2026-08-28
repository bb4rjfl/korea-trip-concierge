/**
 * Fuzzy / semantic name resolution — absorbs typos, case, and spacing
 * differences in station / stop / place / area names, and (when a match isn't
 * confident) surfaces a small set of "did you mean?" candidates so the user can
 * confirm rather than getting a silent wrong answer or a hard "not found".
 *
 * Pure, dependency-free. Used by station/place/stop resolution across tools.
 */

// Japanese kanji/katakana and Chinese (simplified & traditional) forms of the
// places visitors actually name, mapped to the Korean the data is keyed on.
// Without this, normalizeName() strips CJK entirely (明洞 became an empty
// string), so every Japanese or Chinese place name failed to resolve —
// geocoding, area guides, stations and stops alike.
const CJK_TO_KOREAN: [RegExp, string][] = [
  [/明洞/g, "명동"],
  [/ミョンドン/g, "명동"],
  [/弘大/g, "홍대"],
  [/ホンデ/g, "홍대"],
  [/弘益大学/g, "홍대"],
  [/弘益大學/g, "홍대"],
  [/ホンイク/g, "홍대"],
  [/江南/g, "강남"],
  [/カンナム/g, "강남"],
  [/梨泰院/g, "이태원"],
  [/イテウォン/g, "이태원"],
  [/聖水/g, "성수"],
  [/圣水/g, "성수"],
  [/ソンス/g, "성수"],
  [/北村/g, "북촌"],
  [/プクチョン/g, "북촌"],
  [/三清洞/g, "삼청동"],
  [/三淸洞/g, "삼청동"],
  [/サムチョンドン/g, "삼청동"],
  [/仁寺洞/g, "인사동"],
  [/インサドン/g, "인사동"],
  [/益善洞/g, "익선동"],
  [/イクソンドン/g, "익선동"],
  [/乙支路/g, "을지로"],
  [/ウルチロ/g, "을지로"],
  [/東大門/g, "동대문"],
  [/东大门/g, "동대문"],
  [/トンデムン/g, "동대문"],
  [/南大門/g, "남대문"],
  [/南大门/g, "남대문"],
  [/ナムデムン/g, "남대문"],
  [/汝矣島/g, "여의도"],
  [/汝矣岛/g, "여의도"],
  [/ヨイド/g, "여의도"],
  [/蚕室/g, "잠실"],
  [/蠶室/g, "잠실"],
  [/チャムシル/g, "잠실"],
  [/カロスキル/g, "가로수길"],
  [/林荫道/g, "가로수길"],
  [/林蔭道/g, "가로수길"],
  [/街路樹通り/g, "가로수길"],
  [/延南洞/g, "연남동"],
  [/ヨンナムドン/g, "연남동"],
  [/西村/g, "서촌"],
  [/ソチョン/g, "서촌"],
  [/狎鴎亭/g, "압구정"],
  [/狎鸥亭/g, "압구정"],
  [/アックジョン/g, "압구정"],
  [/新沙/g, "신사"],
  [/シンサ/g, "신사"],
  [/建大/g, "건대"],
  [/建国大学/g, "건대"],
  [/コンデ/g, "건대"],
  [/鍾路/g, "종로"],
  [/钟路/g, "종로"],
  [/チョンノ/g, "종로"],
  [/光化門/g, "광화문"],
  [/光化门/g, "광화문"],
  [/クァンファムン/g, "광화문"],
  [/景福宮/g, "경복궁"],
  [/景福宫/g, "경복궁"],
  [/キョンボックン/g, "경복궁"],
  [/昌徳宮/g, "창덕궁"],
  [/昌德宫/g, "창덕궁"],
  [/チャンドックン/g, "창덕궁"],
  [/徳寿宮/g, "덕수궁"],
  [/德寿宫/g, "덕수궁"],
  [/トクスグン/g, "덕수궁"],
  [/昌慶宮/g, "창경궁"],
  [/昌庆宫/g, "창경궁"],
  [/南山/g, "남산"],
  [/ナムサン/g, "남산"],
  [/南山タワー/g, "남산타워"],
  [/首爾塔/g, "남산타워"],
  [/首尔塔/g, "남산타워"],
  [/Nソウルタワー/g, "남산타워"],
  [/漢江/g, "한강"],
  [/汉江/g, "한강"],
  [/ハンガン/g, "한강"],
  [/ソウルの森/g, "서울숲"],
  [/首尔林/g, "서울숲"],
  [/清渓川/g, "청계천"],
  [/清溪川/g, "청계천"],
  [/チョンゲチョン/g, "청계천"],
  [/広蔵市場/g, "광장시장"],
  [/廣藏市場/g, "광장시장"],
  [/广藏市场/g, "광장시장"],
  [/クァンジャン市場/g, "광장시장"],
  [/COEX/g, "코엑스"],
  [/コエックス/g, "코엑스"],
  [/ソウル駅/g, "서울역"],
  [/首爾站/g, "서울역"],
  [/首尔站/g, "서울역"],
  [/首尔火车站/g, "서울역"],
  [/仁川空港/g, "인천공항"],
  [/仁川機場/g, "인천공항"],
  [/仁川机场/g, "인천공항"],
  [/インチョン空港/g, "인천공항"],
  [/金浦空港/g, "김포공항"],
  [/金浦機場/g, "김포공항"],
  [/金浦机场/g, "김포공항"],
  [/ロッテワールド/g, "롯데월드"],
  [/乐天世界/g, "롯데월드"],
  [/樂天世界/g, "롯데월드"],
  [/明洞聖堂/g, "명동성당"],
  [/明洞大教堂/g, "명동성당"],
  [/釜山/g, "부산"],
  [/プサン/g, "부산"],
  [/済州/g, "제주"],
  [/濟州/g, "제주"],
  [/济州/g, "제주"],
  [/チェジュ/g, "제주"],
  [/慶州/g, "경주"],
  [/庆州/g, "경주"],
  [/キョンジュ/g, "경주"],
  [/仁川/g, "인천"],
  [/インチョン/g, "인천"],
  [/ソウル/g, "서울"],
  [/首爾/g, "서울"],
  [/首尔/g, "서울"],
];

/** Rewrite CJK place forms to Korean, and drop CJK station suffixes. */
export function cjkToKorean(s: string): string {
  let out = s ?? "";
  if (!/[぀-ヿ㐀-鿿]/.test(out)) return out;
  for (const [re, ko] of CJK_TO_KOREAN) out = out.replace(re, ko);
  return out.replace(/[駅站]/g, "");
}
// Words/suffixes that carry no discriminating signal — dropped before comparing
// so "Incheon Airport Terminal 1" ≈ "Incheon Airport T1" ≈ "incheon airport".
const NOISE = /\b(station|stn|line|the|of|palace|temple|market|airport|terminal|intl|international|express|bus|terminal1|t1|t2)\b/g;

/** Canonical comparison form: lowercase, NFC, strip noise words + non-alnum. */
export function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFC")
    .replace(/[぀-ヿ㐀-鿿]+/g, (m) => cjkToKorean(m))
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
