/**
 * Multi-turn flow runner for QA sweeps.
 *
 * A "flow" is how a real visitor actually uses the service: ask something, read
 * the answer, then TAP one of the suggested chips (or type a follow-up) — with
 * the conversation carried forward. Chip taps are what most users do, so they
 * must be exercised, not just isolated one-shot questions.
 *
 * Usage:  node qa/run-flow.mjs '<json flow>'
 *   flow = { id, lang, persona?, turns: [ "free text" | {chip: 1} | {chip: "match"} ] }
 *
 * Prints a compact transcript: per turn the tool chosen, engine, latency, the
 * answer (trimmed) and the chips offered. Exit code is always 0 — judging the
 * output is the reader's job.
 */
const BASE = process.env.QA_BASE ?? "https://180-210-78-148.sslip.io";
const flow = JSON.parse(process.argv[2]);
const messages = [];
let lastChips = [];

const trim = (s, n) => (s.length > n ? s.slice(0, n) + " …[cut]" : s);

for (const [i, turn] of flow.turns.entries()) {
  let text;
  if (typeof turn === "string") {
    text = turn;
  } else if (turn.chip !== undefined) {
    // Simulate a tap: pick by 1-based index or by substring match.
    const chip =
      typeof turn.chip === "number"
        ? lastChips[turn.chip - 1]
        : lastChips.find((c) => (c.cmdEn + " " + (c.cmdKo ?? "")).toLowerCase().includes(String(turn.chip).toLowerCase()));
    if (!chip) {
      console.log(`T${i + 1} [TAP FAILED] no chip matching ${JSON.stringify(turn.chip)} — offered: ${lastChips.map((c) => c.cmdEn).join(" | ") || "(none)"}`);
      break;
    }
    text = flow.lang === "ko" && chip.cmdKo ? chip.cmdKo : chip.cmdEn;
    console.log(`T${i + 1} 👆 TAP: ${text}`);
  }
  if (typeof turn === "string") console.log(`T${i + 1} 🗣️  ${text}`);

  messages.push({ role: "user", content: text });
  const t0 = Date.now();
  let j;
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-12), uiLang: flow.lang }),
    });
    if (res.status === 429) { console.log("   ⛔ RATE LIMITED — slow down"); break; }
    j = await res.json();
  } catch (e) {
    console.log(`   ❌ REQUEST FAILED: ${e.message}`);
    break;
  }
  const body = j.toolMarkdown ?? j.reply ?? "";
  lastChips = j.chips ?? [];
  messages.push({ role: "assistant", content: body });
  console.log(`   ↳ tool=${j.meta?.tool ?? "-"} engine=${j.meta?.engine} ${Date.now() - t0}ms images=${(j.images ?? []).length}`);
  console.log(`   ${trim(body.replace(/\n/g, "\n   "), 900)}`);
  console.log(`   💬 chips: ${lastChips.map((c, n) => `[${n + 1}] ${c.cmdEn}`).join("  ") || "(none)"}`);
  console.log("");
  await new Promise((r) => setTimeout(r, Number(process.env.QA_DELAY_MS ?? 400)));
}
