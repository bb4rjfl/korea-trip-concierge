/**
 * Does reranking actually put better documents first?
 *
 *   npm run eval:rank
 *
 * Runs every case in eval/retrieval-set.ts twice against the same corpus — once
 * with reranking off, once on — and reports where the answering document
 * landed each time. Nothing else differs between the two passes, so a change in
 * the numbers is the reranker and not the weather, the judge or a public API
 * having a bad afternoon.
 *
 * Reported:
 *   top-1   how often the answering document was first — what a visitor sees
 *   MRR     1/rank, averaged: credit for being close, not just for winning
 *   moved   the cases that changed, named, so a gain can be read rather than
 *           trusted. A reranker that improves the mean while breaking three
 *           specific questions is not an improvement, and only the list shows it.
 */

import { buildCorpus } from "../src/lib/corpus.js";
import { search, corpusEmbedded, type SearchOptions } from "../src/lib/retrieval.js";
import { RANK_CASES, KNOWN_GAPS, type RankCase } from "../eval/retrieval-set.js";
import { MULTILINGUAL_CASES } from "../eval/retrieval-set-multilingual.js";

const DEPTH = 8;

// --lang runs the same questions in Korean, Japanese and Chinese instead.
const CASES: RankCase[] = process.argv.includes("--lang") ? [...RANK_CASES, ...MULTILINGUAL_CASES] : RANK_CASES;

/** 1-based position of the first answering document, or 0 for "not in the list". */
async function rankOf(q: string, answers: string[], opts: SearchOptions): Promise<number> {
  const hits = await search(q, { ...opts, limit: DEPTH });
  const at = hits.findIndex((h) => answers.some((a) => h.doc.title.toLowerCase().includes(a.toLowerCase())));
  return at < 0 ? 0 : at + 1;
}

function summary(ranks: number[]): { top1: number; mrr: number; found: number } {
  const top1 = ranks.filter((r) => r === 1).length / ranks.length;
  const mrr = ranks.reduce((a, r) => a + (r ? 1 / r : 0), 0) / ranks.length;
  const found = ranks.filter((r) => r > 0).length / ranks.length;
  return { top1, mrr, found };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is required — without it there is nothing to compare.");
    process.exit(2);
  }
  buildCorpus();
  process.stdout.write("embedding the corpus");
  for (let i = 0; i < 120 && !corpusEmbedded(); i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (i % 4 === 0) process.stdout.write(".");
  }
  console.log(corpusEmbedded() ? " ready\n" : " NOT READY — measuring lexical only\n");

  const before: number[] = [];
  const after: number[] = [];
  const moved: string[] = [];
  let msBase = 0;
  let msRerank = 0;

  for (const c of CASES) {
    const t0 = Date.now();
    const b = await rankOf(c.q, c.answers, { kinds: c.kinds });
    msBase += Date.now() - t0;
    const started = Date.now();
    const a = await rankOf(c.q, c.answers, { kinds: c.kinds, rerank: true });
    msRerank += Date.now() - started;
    before.push(b);
    after.push(a);
    const at = (r: number) => (r ? `#${r}` : "absent");
    const mark = a === b ? " " : a === 0 || (b !== 0 && a > b) ? "↓" : "↑";
    console.log(`${mark} ${at(b).padEnd(7)}→ ${at(a).padEnd(7)} ${c.q}`);
    if (a !== b) moved.push(`${mark} ${c.q}  (${at(b)} → ${at(a)})`);
  }

  const B = summary(before);
  const A = summary(after);
  const line = (name: string, b: number, a: number) => {
    const d = a - b;
    console.log(`  ${name.padEnd(8)} ${pct(b)} → ${pct(a)}   ${d === 0 ? "no change" : `${d > 0 ? "+" : ""}${pct(d)}`}`);
  };

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${CASES.length} cases, top ${DEPTH}, reranking off → on`);
  line("top-1", B.top1, A.top1);
  line("MRR", B.mrr, A.mrr);
  line("found", B.found, A.found);
  const n = CASES.length;
  console.log(`  latency  ${Math.round(msBase / n)}ms search → ${Math.round(msRerank / n)}ms with rerank  (+${Math.round((msRerank - msBase) / n)}ms)`);

  // Per language, because the average is exactly where this hides. A service
  // that answers 94% in English and 50% in Japanese reads as "82% overall",
  // and 82% is a number nobody would investigate.
  const langs = [...new Set(CASES.map((c) => c.lang ?? "en"))];
  if (langs.length > 1) {
    console.log("\nby language (the corpus is written in English)");
    for (const lang of langs) {
      const idx = CASES.map((c, i) => [c, i] as const).filter(([c]) => (c.lang ?? "en") === lang);
      const b = summary(idx.map(([, i]) => before[i]));
      const a = summary(idx.map(([, i]) => after[i]));
      console.log(
        `  ${lang}  n=${String(idx.length).padStart(2)}  top-1 ${pct(b.top1)}→${pct(a.top1)}` +
          `   MRR ${pct(b.mrr)}→${pct(a.mrr)}   found ${pct(b.found)}→${pct(a.found)}`,
      );
      const missed = idx.filter(([, i]) => after[i] === 0).map(([c]) => c.q);
      if (missed.length) console.log(`       unreachable: ${missed.join(" · ")}`);
    }
  }

  const gained = moved.filter((m) => m.startsWith("↑"));
  const lost = moved.filter((m) => m.startsWith("↓"));
  if (gained.length) console.log(`\nbetter (${gained.length})\n${gained.map((m) => `  ${m}`).join("\n")}`);
  if (lost.length) console.log(`\nworse (${lost.length})\n${lost.map((m) => `  ${m}`).join("\n")}`);
  if (!moved.length) console.log("\nnothing moved — the reranker is not earning its round trip here.");
  console.log(`\n${KNOWN_GAPS.length} known corpus gaps excluded — see eval/retrieval-set.ts`);
}

await main();
