/**
 * Does the right tool run?
 *
 *   npm run eval:route            → against production
 *   npm run eval:route -- --local → against http://127.0.0.1:8790
 *
 * Routing is a single discrete choice with a right answer, so it is counted
 * rather than judged. The conversational harness cannot do this: it scores the
 * answer, which mixes "picked the wrong tool" with "picked the right tool and
 * answered thinly", and its judge is never told which tool ran.
 *
 * It goes through the real endpoint rather than calling the router directly,
 * because the decision is not one function — a critical-safety route, then the
 * model, then the rule router, then the corpus arbitration that can overrule
 * all three. Reproducing that chain here would measure a copy of it, and the
 * copy would drift.
 *
 * A miss is one of three things, and they want different fixes: a tool whose
 * description does not say what it is for, two tools that genuinely overlap,
 * or a question where several tools would serve. The third is written into the
 * ground truth as several acceptable tools rather than pretended away.
 */

import { ROUTE_CASES } from "../eval/routing-set.js";

const BASE = process.argv.includes("--local") ? "http://127.0.0.1:8790" : (process.env.KTC_BASE ?? "https://ktc.tacita.cloud");

interface ChatResponse {
  meta?: { tool?: string; engine?: string };
}

async function toolFor(q: string, lang: string): Promise<{ tool?: string; engine?: string }> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: q }], uiLang: lang }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 4000));
    return toolFor(q, lang);
  }
  const text = await res.text();
  // The endpoint streams when asked to; asked plainly it returns one object.
  const payload = text.includes("data:")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter(Boolean)
        .pop()
    : text;
  const json = JSON.parse(payload ?? "{}") as ChatResponse;
  return { tool: json.meta?.tool, engine: json.meta?.engine };
}

async function main(): Promise<void> {
  console.log(`\nRouting ${ROUTE_CASES.length} questions against ${BASE}\n`);
  const misses: string[] = [];
  const byEngine = new Map<string, number>();
  let hit = 0;

  for (const c of ROUTE_CASES) {
    const lang = c.lang ?? "en";
    let got: { tool?: string; engine?: string };
    try {
      got = await toolFor(c.q, lang);
    } catch (err) {
      got = { tool: `ERROR: ${(err as Error).message}` };
    }
    const ok = Boolean(got.tool && c.tools.includes(got.tool));
    if (ok) hit++;
    byEngine.set(got.engine ?? "none", (byEngine.get(got.engine ?? "none") ?? 0) + 1);
    console.log(`${ok ? "✓" : "✗"} [${lang}] ${c.q}`);
    if (!ok) {
      const line = `  wanted ${c.tools.join(" | ")}, ran ${got.tool ?? "(nothing)"}`;
      console.log(line);
      if (c.note) console.log(`  ↳ ${c.note}`);
      misses.push(`${c.q}\n   ${line.trim()}`);
    }
  }

  const pct = Math.round((hit / ROUTE_CASES.length) * 100);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`routed correctly ${hit}/${ROUTE_CASES.length}  (${pct}%)`);
  console.log(`decided by: ${[...byEngine].map(([e, n]) => `${e} ${n}`).join(" · ")}`);
  if (misses.length) console.log(`\nmisrouted\n${misses.map((m) => `  ${m}`).join("\n")}`);
  // A tool nobody can pick is worse than a tool that does not exist, so this
  // fails the run rather than printing a number somebody has to notice.
  if (pct < 85) process.exit(1);
}

await main();
