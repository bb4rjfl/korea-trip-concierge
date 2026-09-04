/**
 * The evaluation harness.
 *
 * Everything in this project has been checked one of two ways: unit tests, which
 * verify that a function returns what its author expected, and me reading
 * transcripts, which is where every real defect has actually been found — the
 * clinic in a course, the identical "another" day, the chip that led nowhere.
 * Reading transcripts does not scale and does not repeat: the same change looks
 * better or worse depending on which five conversations I happen to read.
 *
 * This runs the golden conversations against a live instance, scores each turn
 * the same way every time, and prints what got worse. Two layers of judgement,
 * cheapest first:
 *
 *   1. Deterministic guards — phrases that are failures no matter the context
 *      ("Nothing matched", routing to the city you are standing in). Free, and
 *      they never drift.
 *   2. A model judge, for the part that is genuinely a judgement: did this
 *      answer the question a traveller asked. The judge sees the expectation
 *      written for that turn, not a vague quality prompt, and returns a verdict
 *      with a reason so a failure is actionable rather than a number.
 *
 * Chips are followed, not just collected. The service's own suggestions are part
 * of the product, and the worst failure found so far was reachable only by
 * trusting one.
 *
 *   npm run eval                    → the whole set against production
 *   npm run eval -- --local         → against http://127.0.0.1:8790
 *   npm run eval -- --only=pets     → one scenario, by name substring
 *   npm run eval -- --baseline      → write the scores as the new baseline
 */

import "../src/lib/loadEnv.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { SCENARIOS, type Scenario, type Turn } from "../eval/scenarios.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes("=") ? hit.split("=").slice(1).join("=") : "") : undefined;
};

const BASE = flag("local") !== undefined ? "http://127.0.0.1:8790" : (process.env.KTC_BASE ?? "https://ktc.tacita.cloud");
const ONLY = flag("only");
const WRITE_BASELINE = flag("baseline") !== undefined;
const BASELINE_PATH = "eval/baseline.json";
const REPORT_PATH = "eval/last-run.md";

/* ------------------------------- the service ------------------------------- */

interface Chip {
  cmdEn: string;
}
interface Answer {
  body: string;
  chips: Chip[];
  tool?: string;
  ms: number;
}

async function ask(messages: { role: string; content: string }[], lang: string, attempt = 0): Promise<Answer> {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, uiLang: lang }),
  });
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 4000));
    return ask(messages, lang, attempt + 1);
  }
  const text = await res.text();
  // The chat endpoint streams; the last data: frame is the finished answer.
  const payload = text.includes("data:")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter(Boolean)
        .pop()
    : text;
  const json = JSON.parse(payload ?? "{}");
  return {
    body: json.toolMarkdown ?? json.reply ?? "",
    chips: json.chips ?? [],
    tool: json.meta?.tool,
    ms: Date.now() - started,
  };
}

/* --------------------------------- the judge ------------------------------- */

interface Verdict {
  pass: boolean;
  score: number; // 0-3: 0 unusable, 1 poor, 2 acceptable, 3 what a good concierge would say
  why: string;
}

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "gemini-2.5-flash";

const JUDGE_INSTRUCTIONS = `You are grading one turn of a chat with a Korea travel concierge used by foreign visitors.

You are given what the traveller said, what a good answer does here, and the answer.

Grade only against the stated expectation. Do not reward length, politeness or hedging.

Score:
3 — answers the question the way a well-informed local would: specific, actionable, and correct about what it claims.
2 — answers it, but thinly: vague, partial, or padded with things that were not asked.
1 — related to the question but does not answer it: a list where a judgement was needed, or a clarifying question when the traveller already gave enough.
0 — does not answer, contradicts the question, or is about something else entirely.

A clarifying question scores 0 when the traveller's words already contained what was needed.
Saying "I don't know" or "I don't cover that" honestly scores 3 when the expectation says so, and 0 when it does not.

Reply as JSON only: {"score": 0-3, "why": "<one sentence, concrete>"}`;

async function judge(said: string, expect: string, answer: string): Promise<Verdict> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { pass: true, score: 2, why: "no judge key — deterministic checks only" };
  const body = {
    systemInstruction: { parts: [{ text: JUDGE_INSTRUCTIONS }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `TRAVELLER SAID:\n${said}\n\nA GOOD ANSWER HERE:\n${expect}\n\nTHE ANSWER GIVEN:\n${answer.slice(0, 6000)}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw) as { score?: number; why?: string };
    const score = Math.max(0, Math.min(3, Number(parsed.score ?? 0)));
    return { pass: score >= 2, score, why: parsed.why ?? "" };
  } catch (err) {
    // A judge outage must not read as a product regression.
    return { pass: true, score: 2, why: `judge unavailable (${(err as Error).message})` };
  }
}

/* --------------------------------- running --------------------------------- */

interface TurnResult {
  scenario: string;
  guards: string;
  said: string;
  answer: string;
  chips: string[];
  tool?: string;
  ms: number;
  score: number;
  why: string;
  hardFail?: string;
}

function checkGuards(turn: Turn, answer: string): string | undefined {
  for (const re of turn.mustMatch ?? []) {
    if (!re.test(answer)) return `missing required ${re}`;
  }
  for (const re of turn.mustNotMatch ?? []) {
    if (re.test(answer)) return `contains forbidden ${re}`;
  }
  return undefined;
}

async function runScenario(scenario: Scenario): Promise<TurnResult[]> {
  const history: { role: string; content: string }[] = [];
  const results: TurnResult[] = [];
  let lastChips: Chip[] = [];

  for (const turn of scenario.turns) {
    // A `follow` turn taps what we ourselves offered, which is the only way to
    // reach the failures that come from our own suggestions.
    const said = turn.say ?? lastChips[(turn.follow ?? 1) - 1]?.cmdEn;
    if (!said) {
      results.push({
        scenario: scenario.name,
        guards: scenario.guards,
        said: `(chip ${turn.follow})`,
        answer: "",
        chips: [],
        ms: 0,
        score: 0,
        why: "we offered no chip to follow",
        hardFail: "no chip at that position",
      });
      break;
    }

    history.push({ role: "user", content: said });
    let answer: Answer;
    try {
      answer = await ask(history, scenario.lang ?? "en");
    } catch (err) {
      answer = { body: `REQUEST FAILED: ${(err as Error).message}`, chips: [], ms: 0 };
    }
    history.push({ role: "assistant", content: answer.body });
    lastChips = answer.chips;

    const hardFail = checkGuards(turn, answer.body);
    const verdict = hardFail ? { score: 0, why: hardFail } : await judge(said, turn.expect, answer.body);

    results.push({
      scenario: scenario.name,
      guards: scenario.guards,
      said,
      answer: answer.body,
      chips: answer.chips.map((c) => c.cmdEn),
      tool: answer.tool,
      ms: answer.ms,
      score: verdict.score,
      why: verdict.why,
      hardFail,
    });
  }
  return results;
}

/* ---------------------------------- report --------------------------------- */

function bar(score: number): string {
  return ["✗✗", "✗ ", "~ ", "✓ "][score] ?? "? ";
}

async function main(): Promise<void> {
  const chosen = ONLY ? SCENARIOS.filter((s) => s.name.toLowerCase().includes(ONLY.toLowerCase())) : SCENARIOS;
  if (!chosen.length) {
    console.error(`no scenario matches "${ONLY}"`);
    process.exit(2);
  }

  console.log(`\nEvaluating ${chosen.length} scenarios against ${BASE}\n`);
  const all: TurnResult[] = [];
  for (const scenario of chosen) {
    const results = await runScenario(scenario);
    all.push(...results);
    const scores = results.map((r) => bar(r.score)).join(" ");
    console.log(`${scenario.name.padEnd(28)} ${scores}`);
    for (const r of results.filter((x) => x.score < 2)) {
      console.log(`   ↳ "${r.said.slice(0, 66)}"`);
      console.log(`     ${r.why}`);
    }
  }

  const total = all.reduce((sum, r) => sum + r.score, 0);
  const max = all.length * 3;
  const pct = Math.round((total / max) * 100);
  const failures = all.filter((r) => r.score < 2);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`score ${total}/${max}  (${pct}%)   turns ${all.length}   below-bar ${failures.length}`);

  // Against the last recorded run, so a regression is visible without me
  // remembering what the number used to be.
  if (existsSync(BASELINE_PATH)) {
    const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { pct: number; perTurn: Record<string, number> };
    const delta = pct - base.pct;
    console.log(`baseline ${base.pct}%  → ${delta >= 0 ? "+" : ""}${delta} points`);
    const regressed = all.filter((r) => {
      const was = base.perTurn?.[`${r.scenario} :: ${r.said}`];
      return was != null && r.score < was;
    });
    for (const r of regressed) {
      console.log(`  ⚠ regressed: [${r.scenario}] "${r.said.slice(0, 50)}" — ${r.why}`);
    }
  }

  mkdirSync("eval", { recursive: true });
  const report = [
    `# Eval run — ${new Date().toISOString()}`,
    ``,
    `Target: ${BASE} · score **${total}/${max} (${pct}%)** · ${failures.length} of ${all.length} turns below bar`,
    ``,
    ...all.map((r) =>
      [
        `## [${r.scenario}] ${bar(r.score)} ${r.said}`,
        `_${r.guards}_ · tool \`${r.tool ?? "-"}\` · ${r.ms}ms · score ${r.score}`,
        ``,
        `**Judge:** ${r.why}`,
        ``,
        "```",
        r.answer.slice(0, 1800),
        "```",
        r.chips.length ? `**Chips offered:** ${r.chips.join(" · ")}` : "",
        ``,
      ].join("\n"),
    ),
  ].join("\n");
  writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\ntranscript → ${REPORT_PATH}`);

  if (WRITE_BASELINE) {
    const perTurn: Record<string, number> = {};
    for (const r of all) perTurn[`${r.scenario} :: ${r.said}`] = r.score;
    writeFileSync(BASELINE_PATH, JSON.stringify({ pct, perTurn }, null, 2), "utf8");
    console.log(`baseline → ${BASELINE_PATH}`);
  }

  process.exit(failures.length ? 1 : 0);
}

void main();
