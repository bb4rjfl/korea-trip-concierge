/**
 * The whole service, as a traveller uses it — graded.
 *
 * The trip sweep (sweep-trips.ts) measured one tool. This sends what visitors
 * actually type, across every kind of question and all four languages, to the
 * running service, then taps the first button the service itself offers and
 * grades that too: our own suggestions are part of what we ship.
 *
 * Each answer gets deterministic checks (failure phrases, wrong language, slow,
 * no buttons) and a strict judge that scores it the way a first-time visitor
 * who has to act on it right now would. Results are grouped by intent, language
 * and defect, so the next round of work is chosen by cause.
 *
 *   npx tsx scripts/sweep-service.ts [out-dir] [--local] [--only=intent] [--no-follow]
 */

import "../src/lib/loadEnv.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const BASE = flag("local") ? "http://127.0.0.1:8790" : (process.env.KTC_BASE ?? "https://ktc.tacita.cloud");
const OUT = args.find((a) => !a.startsWith("--")) ?? "eval/service";
const ONLY = flag("only")?.split("=")[1];
const FOLLOW = !flag("no-follow");

type Lang = "en" | "ko" | "ja" | "zh";
type Q = [lang: Lang, intent: string, say: string];

const QUESTIONS: Q[] = [
  // ── English ─────────────────────────────────────────────────────────────
  ["en", "route", "How do I get from Incheon Airport to Hongdae?"],
  ["en", "route", "Myeongdong to Gyeongbokgung by subway"],
  ["en", "route", "How do I get to Nami Island from Seoul?"],
  ["en", "route", "Busan Station to Haedong Yonggungsa"],
  ["en", "route", "Jeju Airport to Seongsan Ilchulbong"],
  ["en", "route", "Gangnam to Everland"],
  ["en", "last-train", "What time is the last train from Hongdae to Jamsil tonight?"],
  ["en", "subway-arrival", "When is the next train at Seoul Station?"],
  ["en", "subway-arrival", "Next subway at Gangnam station toward Jamsil"],
  ["en", "bus-arrival", "When does bus 143 come to Sinsa station?"],
  ["en", "food", "Best Korean BBQ in Hongdae"],
  ["en", "food", "Vegetarian restaurants in Itaewon"],
  ["en", "food", "Where can I eat halal food in Seoul?"],
  ["en", "food", "Cheap eats near Myeongdong"],
  ["en", "food", "What should I eat in Jeonju?"],
  ["en", "food", "Dessert cafes in Seongsu"],
  ["en", "food", "Black pork restaurants in Jeju"],
  ["en", "sights", "What should I see in Gyeongju in one day?"],
  ["en", "sights", "Things to do in Busan"],
  ["en", "sights", "Indoor places to go in Seoul on a rainy day"],
  ["en", "sights", "Best night views in Seoul"],
  ["en", "sights", "Museums in Seoul that kids would enjoy"],
  ["en", "open-now", "Is Gyeongbokgung open now?"],
  ["en", "open-now", "Is Lotte World open today?"],
  ["en", "open-now", "N Seoul Tower opening hours"],
  ["en", "open-now", "Is Gwangjang Market open on Sunday?"],
  ["en", "weather", "What's the weather in Busan tomorrow?"],
  ["en", "weather", "Is the air quality bad in Seoul today?"],
  ["en", "weather", "Will it rain in Jeju this weekend?"],
  ["en", "payment", "Can I use my Visa card at convenience stores?"],
  ["en", "payment", "How do I top up a T-money card?"],
  ["en", "payment", "My card was declined at a restaurant, what do I do?"],
  ["en", "payment", "How do I get a tax refund when I leave?"],
  ["en", "payment", "Where can I exchange money in Myeongdong?"],
  ["en", "korean-service", "How do I call a taxi without a Korean phone number?"],
  ["en", "korean-service", "How do I get a SIM card at Incheon Airport?"],
  ["en", "korean-service", "Can I order food delivery as a tourist?"],
  ["en", "korean-service", "Can I book KTX tickets online as a foreigner?"],
  ["en", "menu", "What is budae jjigae?"],
  ["en", "menu", "Is naengmyeon vegetarian?"],
  ["en", "menu", "I'm allergic to peanuts — how do I tell the restaurant?"],
  ["en", "emergency", "I lost my passport"],
  ["en", "emergency", "My friend is having a bad allergic reaction"],
  ["en", "emergency", "Someone stole my wallet"],
  ["en", "emergency", "English-speaking hospital in Gangnam"],
  ["en", "area", "Tell me about Seongsu-dong"],
  ["en", "area", "Is Itaewon a good area to stay?"],
  ["en", "course", "Plan a 2-day trip in Busan for a couple"],
  ["en", "course", "One day in Seoul for a foodie in their 20s"],
  ["en", "course", "Rainy day itinerary for Seoul"],
  ["en", "festival", "Any festivals in Seoul this month?"],
  ["en", "jeju", "How do I get around Jeju without a car?"],
  ["en", "jeju", "Best beaches in Jeju"],
  ["en", "essentials", "Pharmacy open late in Hongdae"],
  ["en", "essentials", "ATM that takes foreign cards in Insadong"],
  ["en", "shopping", "Where to buy K-beauty products in Myeongdong"],
  ["en", "meta", "What can you do?"],
  ["en", "open-ended", "I'm in Myeongdong, where should I go next?"],
  ["en", "safety", "Is it safe to walk around Seoul at night?"],
  ["en", "taxi-fare", "How much is a taxi from Gimpo Airport to Gangnam?"],
  ["en", "temple-stay", "Can you recommend a temple stay?"],
  // ── Korean ──────────────────────────────────────────────────────────────
  ["ko", "route", "인천공항에서 명동 가는 법"],
  ["ko", "route", "남산타워 어떻게 가?"],
  ["ko", "route", "강릉역에서 경포해변"],
  ["ko", "route", "수원화성 가는 법 서울역에서"],
  ["ko", "last-train", "홍대입구역 막차 몇 시야?"],
  ["ko", "subway-arrival", "강남역 다음 열차 언제 와?"],
  ["ko", "bus-arrival", "143번 버스 신사역에 언제 와?"],
  ["ko", "food", "홍대 맛집 추천해줘"],
  ["ko", "food", "이태원 채식 식당"],
  ["ko", "food", "전주 한옥마을 비빔밥 맛집"],
  ["ko", "sights", "부산 가볼만한 곳"],
  ["ko", "sights", "비 오는 날 서울 실내 데이트"],
  ["ko", "sights", "서울 야경 명소"],
  ["ko", "sights", "아이랑 갈만한 곳 서울"],
  ["ko", "sights", "속초 가볼만한 곳"],
  ["ko", "open-now", "경복궁 지금 열었어?"],
  ["ko", "weather", "내일 제주 날씨"],
  ["ko", "weather", "오늘 미세먼지 어때?"],
  ["ko", "payment", "외국 카드로 교통카드 충전돼?"],
  ["ko", "payment", "세금 환급 어떻게 받아?"],
  ["ko", "payment", "카드 결제가 거절됐어"],
  ["ko", "korean-service", "택시 앱 뭐 써?"],
  ["ko", "emergency", "여권 잃어버렸어요"],
  ["ko", "menu", "떡볶이 많이 매워?"],
  ["ko", "course", "경주 1박 2일 코스 짜줘"],
  ["ko", "festival", "이번 달 서울 축제 뭐 있어?"],
  ["ko", "area", "성수동 어때?"],
  ["ko", "jeju", "제주 버스 타는 법"],
  ["ko", "essentials", "명동 환전소"],
  ["ko", "essentials", "홍대 약국"],
  ["ko", "meta", "뭐 할 수 있어?"],
  // ── Japanese ────────────────────────────────────────────────────────────
  ["ja", "route", "仁川空港から明洞への行き方"],
  ["ja", "route", "弘大から景福宮まで地下鉄で"],
  ["ja", "route", "済州空港から城山日出峰"],
  ["ja", "route", "南山タワーへの行き方"],
  ["ja", "route", "水原華城への行き方"],
  ["ja", "subway-arrival", "ソウル駅の次の電車は？"],
  ["ja", "food", "明洞でおすすめの韓国料理"],
  ["ja", "food", "梨泰院のベジタリアンレストラン"],
  ["ja", "food", "全州の名物料理"],
  ["ja", "sights", "釜山の観光地"],
  ["ja", "sights", "雨の日にソウルで行ける屋内スポット"],
  ["ja", "sights", "ソウルの夜景スポット"],
  ["ja", "sights", "慶州で1日観光"],
  ["ja", "open-now", "景福宮は今開いていますか"],
  ["ja", "open-now", "ロッテワールドの営業時間"],
  ["ja", "weather", "明日の釜山の天気"],
  ["ja", "weather", "今日のPM2.5はどうですか"],
  ["ja", "payment", "コンビニで海外のカードは使えますか"],
  ["ja", "payment", "T-moneyのチャージ方法"],
  ["ja", "payment", "免税の還付方法"],
  ["ja", "payment", "カードが使えなかった"],
  ["ja", "korean-service", "タクシーの呼び方"],
  ["ja", "korean-service", "SIMカードはどこで買えますか"],
  ["ja", "emergency", "パスポートをなくしました"],
  ["ja", "menu", "プデチゲとは"],
  ["ja", "course", "済州島2日間のモデルコース"],
  ["ja", "festival", "今月ソウルのお祭り"],
  ["ja", "area", "聖水洞はどんなところ"],
  ["ja", "essentials", "明洞で両替"],
  ["ja", "essentials", "弘大の薬局"],
  ["ja", "shopping", "東大門のおすすめ"],
  ["ja", "meta", "何ができますか"],
  // ── Chinese ─────────────────────────────────────────────────────────────
  ["zh", "route", "从仁川机场到明洞怎么走"],
  ["zh", "route", "首尔站到景福宫坐地铁"],
  ["zh", "route", "济州机场到城山日出峰"],
  ["zh", "route", "去南山塔怎么走"],
  ["zh", "route", "从明洞到星空图书馆怎么走"],
  ["zh", "subway-arrival", "江南站下一班地铁"],
  ["zh", "food", "弘大有什么好吃的"],
  ["zh", "food", "明洞清真餐厅"],
  ["zh", "food", "全州有什么美食"],
  ["zh", "sights", "釜山有什么好玩的"],
  ["zh", "sights", "下雨天首尔室内去哪"],
  ["zh", "sights", "首尔夜景"],
  ["zh", "sights", "庆州一日游"],
  ["zh", "open-now", "景福宫现在开门吗"],
  ["zh", "open-now", "乐天世界营业时间"],
  ["zh", "weather", "明天济州岛天气"],
  ["zh", "weather", "今天空气质量怎么样"],
  ["zh", "payment", "便利店可以用外国信用卡吗"],
  ["zh", "payment", "T-money怎么充值"],
  ["zh", "payment", "退税怎么办"],
  ["zh", "payment", "信用卡被拒了"],
  ["zh", "korean-service", "怎么叫出租车"],
  ["zh", "korean-service", "在哪里买SIM卡"],
  ["zh", "emergency", "护照丢了怎么办"],
  ["zh", "menu", "部队锅是什么"],
  ["zh", "course", "首尔三日游行程"],
  ["zh", "festival", "这个月首尔有什么节日"],
  ["zh", "area", "圣水洞怎么样"],
  ["zh", "essentials", "明洞换钱"],
  ["zh", "essentials", "弘大药店"],
  ["zh", "shopping", "东大门购物"],
  ["zh", "meta", "你能做什么"],
];

const LANG_NAME: Record<Lang, string> = { en: "English", ko: "Korean", ja: "Japanese", zh: "Chinese" };

interface Chip {
  cmdEn: string;
  cmdKo?: string;
  locate?: unknown;
}
interface Reply {
  body: string;
  chips: Chip[];
  tool?: string;
  device: boolean;
  ms: number;
  error?: string;
}

async function ask(messages: { role: string; content: string }[], lang: Lang, attempt = 0): Promise<Reply> {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, uiLang: lang }),
    });
    if (res.status === 429 && attempt < 8) {
      await new Promise((r) => setTimeout(r, 5000));
      return ask(messages, lang, attempt + 1);
    }
    const text = await res.text();
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
      body: String(json.toolMarkdown ?? json.reply ?? ""),
      chips: json.chips ?? [],
      tool: json.meta?.tool,
      device: Boolean(json.device),
      ms: Date.now() - started,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { body: "", chips: [], device: false, ms: Date.now() - started, error: (err as Error).message };
  }
}

/* ------------------------------ deterministic ------------------------------ */

const FAILURE =
  /No direct route|No single subway|Couldn't locate|couldn't find|No transit route|Nothing matched|temporarily unavailable|aren't in our data|찾지 못|찾을 수 없|없습니다\.?$|見つかりませんでした|特定できませんでした|找不到|无法定位|無法定位|未找到/im;

function scriptShare(text: string, re: RegExp): number {
  const letters = text.replace(/\(.*?\)|https?:\S+|[\s\d\p{P}\p{S}]/gu, "");
  if (!letters.length) return 0;
  return (letters.match(re) ?? []).length / letters.length;
}

function languageProblem(body: string, lang: Lang): string | undefined {
  const hangul = scriptShare(body, /[가-힣]/g);
  const kana = scriptShare(body, /[぀-ヿ]/g);
  const han = scriptShare(body, /[一-鿿]/g);
  const latin = scriptShare(body, /[A-Za-z]/g);
  if (lang === "en" && hangul > 0.25) return `English answer is ${Math.round(hangul * 100)}% Hangul`;
  if (lang === "ko" && hangul < 0.3) return `Korean answer is only ${Math.round(hangul * 100)}% Hangul`;
  if (lang === "ja" && kana + han < 0.3) return `Japanese answer is mostly not Japanese (latin ${Math.round(latin * 100)}%)`;
  if (lang === "zh" && (han < 0.3 || kana > 0.05)) return `Chinese answer is mostly not Chinese (han ${Math.round(han * 100)}%)`;
  return undefined;
}

function checks(r: Reply, lang: Lang): string[] {
  const out: string[] = [];
  if (r.error) out.push(r.error);
  if (!r.body.trim() && !r.device) out.push("empty answer");
  if (FAILURE.test(r.body)) out.push("failure phrase");
  if (r.ms > 9000) out.push(`slow ${Math.round(r.ms / 1000)}s`);
  if (!r.device && r.body.trim()) {
    const lp = languageProblem(r.body, lang);
    if (lp) out.push(lp);
  }
  if (!r.device && r.chips.length === 0) out.push("no follow-up buttons");
  return out;
}

/* --------------------------------- judge ---------------------------------- */

const DEFECTS = [
  "none",
  "no_answer",
  "wrong_info",
  "wrong_place",
  "generic",
  "irrelevant_suggestion",
  "unneeded_question",
  "wrong_language",
  "garbled_text",
  "too_long",
  "unsafe",
  "dead_end_button",
] as const;

const RUBRIC = `You grade one answer from a travel-help chat that foreign visitors use on their phones in Korea.
Judge as a demanding first-time visitor who has to act on the answer right now. Be strict; do not reward length or politeness.

Score:
3 excellent — answers exactly what was asked, specifically (names, lines, exits, bus numbers, hours, prices, what to do next), correct as far as you can tell, easy to act on, in the visitor's language.
2 good — useful, but with a noticeable gap: a missing key detail, somewhat generic, or some clutter.
1 poor — related but does not really help: generic advice where specifics were needed, wrong focus, an unnecessary clarifying question, a list where a recommendation was asked for, or awkward text (machine romanization, mixed languages, leftover formatting).
0 failed — does not answer, says it could not find anything, wrong place or city, self-contradictory, clearly false, or unsafe.

An honest "I can't do that" that gives a genuinely useful alternative scores at least 2.
For emergencies, putting the emergency number and immediate steps first is required for a 3.

Name the single biggest defect as exactly one of: ${DEFECTS.join(", ")}.
Reply as JSON only: {"score": 0-3, "defect": "...", "why": "<one concrete sentence>"}`;

interface Verdict {
  score: number;
  defect: string;
  why: string;
}

async function judge(lang: Lang, intent: string, said: string, answer: string, context?: string): Promise<Verdict> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { score: -1, defect: "none", why: "no judge key" };
  const prompt = [
    `VISITOR'S LANGUAGE: ${LANG_NAME[lang]}`,
    `KIND OF QUESTION: ${intent}`,
    context ? `CONTEXT: ${context}` : "",
    `VISITOR SAID:\n${said}`,
    `ANSWER GIVEN:\n${answer.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.EVAL_JUDGE_MODEL ?? "gemini-2.5-flash"}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: RUBRIC }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
          }),
        },
      );
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error("empty judge reply");
      const v = JSON.parse(raw) as Partial<Verdict>;
      return {
        score: Math.max(0, Math.min(3, Number(v.score ?? 0))),
        defect: DEFECTS.includes(v.defect as (typeof DEFECTS)[number]) ? String(v.defect) : "none",
        why: String(v.why ?? ""),
      };
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return { score: -1, defect: "none", why: "judge unavailable" };
}

/* --------------------------------- running --------------------------------- */

interface Row {
  lang: Lang;
  intent: string;
  kind: "asked" | "tapped";
  said: string;
  tool?: string;
  ms: number;
  device: boolean;
  flags: string[];
  score: number;
  defect: string;
  why: string;
  answer: string;
  chips: string[];
}

const rows: Row[] = [];
const chosen = ONLY ? QUESTIONS.filter((q) => q[1] === ONLY) : QUESTIONS;
let next = 0;

async function one([lang, intent, say]: Q): Promise<void> {
  const first = await ask([{ role: "user", content: say }], lang);
  const flags = checks(first, lang);
  const v = first.device
    ? { score: -1, defect: "none", why: "answered on the device (phone task) — not gradable here" }
    : await judge(lang, intent, say, first.body);
  rows.push({ lang, intent, kind: "asked", said: say, tool: first.tool, ms: first.ms, device: first.device, flags, ...v, answer: first.body, chips: first.chips.map((c) => c.cmdEn) });

  if (!FOLLOW) return;
  const chip = first.chips.find((c) => !c.locate);
  if (!chip) return;
  const tap = lang === "ko" && chip.cmdKo ? chip.cmdKo : chip.cmdEn;
  const second = await ask(
    [
      { role: "user", content: say },
      { role: "assistant", content: first.body },
      { role: "user", content: tap },
    ],
    lang,
  );
  const flags2 = checks(second, lang);
  const v2 = second.device
    ? { score: -1, defect: "none", why: "device task" }
    : await judge(lang, intent, tap, second.body, `The visitor tapped a suggestion button the service offered after answering "${say}". A button that leads nowhere useful is a dead_end_button.`);
  rows.push({ lang, intent, kind: "tapped", said: tap, tool: second.tool, ms: second.ms, device: second.device, flags: flags2, ...v2, answer: second.body, chips: second.chips.map((c) => c.cmdEn) });
}

async function worker(): Promise<void> {
  while (next < chosen.length) {
    const q = chosen[next++];
    await one(q);
    process.stdout.write(".");
  }
}

// --judge=rows.json grades a saved run again without asking the service: the
// judge can be unavailable (its own quota) while the answers are already in hand.
const JUDGE_FROM = flag("judge")?.split("=")[1];
if (JUDGE_FROM) {
  const saved = JSON.parse(readFileSync(JUDGE_FROM, "utf8")) as Row[];
  let i = 0;
  await Promise.all(
    [0, 1, 2, 3].map(async () => {
      while (i < saved.length) {
        const r = saved[i++];
        if (r.score >= 0 || r.device) continue;
        const context =
          r.kind === "tapped"
            ? "The visitor tapped a suggestion button the service offered after its previous answer. A button that leads nowhere useful is a dead_end_button."
            : undefined;
        Object.assign(r, await judge(r.lang, r.intent, r.said, r.answer, context));
        process.stdout.write(".");
      }
    }),
  );
  rows.push(...saved);
} else {
  await Promise.all([worker(), worker(), worker()]);
}
console.log("\n");

/* --------------------------------- report ---------------------------------- */

const graded = rows.filter((r) => r.score >= 0);
const pct = (rs: Row[]) => (rs.length ? Math.round((rs.reduce((s, r) => s + r.score, 0) / (rs.length * 3)) * 100) : 0);
const dist = (rs: Row[]) => [3, 2, 1, 0].map((s) => `${s}:${rs.filter((r) => r.score === s).length}`).join(" ");
const group = (key: (r: Row) => string) => {
  const m = new Map<string, Row[]>();
  for (const r of graded) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()].sort((a, b) => pct(a[1]) - pct(b[1]));
};

const lines: string[] = [];
lines.push(`Service sweep against ${BASE} — ${new Date().toISOString()}`);
lines.push(`answers ${rows.length} (graded ${graded.length}, device ${rows.filter((r) => r.device).length})`);
lines.push(`QUALITY ${pct(graded)}%   [${dist(graded)}]   asked ${pct(graded.filter((r) => r.kind === "asked"))}% · tapped ${pct(graded.filter((r) => r.kind === "tapped"))}%`);
lines.push(`excellent (3): ${Math.round((graded.filter((r) => r.score === 3).length / Math.max(1, graded.length)) * 100)}%   failed (0-1): ${graded.filter((r) => r.score <= 1).length}`);
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
lines.push(`latency p50 ${ms[Math.floor(ms.length / 2)]}ms · p90 ${ms[Math.floor(ms.length * 0.9)]}ms · max ${ms[ms.length - 1]}ms`);
lines.push("\nBY LANGUAGE");
for (const [k, rs] of group((r) => r.lang)) lines.push(`  ${k.padEnd(4)} ${String(pct(rs)).padStart(3)}%  [${dist(rs)}]`);
lines.push("\nBY INTENT (worst first)");
for (const [k, rs] of group((r) => r.intent)) lines.push(`  ${k.padEnd(16)} ${String(pct(rs)).padStart(3)}%  [${dist(rs)}]`);
lines.push("\nBY DEFECT");
for (const [k, rs] of group((r) => r.defect).sort((a, b) => b[1].length - a[1].length)) lines.push(`  ${k.padEnd(22)} ${rs.length}`);
const flagCounts = new Map<string, number>();
for (const r of rows) for (const f of r.flags) flagCounts.set(f.replace(/\d+/g, "#"), (flagCounts.get(f.replace(/\d+/g, "#")) ?? 0) + 1);
lines.push("\nDETERMINISTIC FLAGS");
for (const [k, n] of [...flagCounts].sort((a, b) => b[1] - a[1])) lines.push(`  ${k.padEnd(50)} ${n}`);
lines.push("\nWORST ANSWERS");
for (const r of graded.filter((x) => x.score <= 1).sort((a, b) => a.score - b.score)) {
  lines.push(`  [${r.score}] ${r.lang} ${r.intent} ${r.kind === "tapped" ? "👆" : "💬"} "${r.said.slice(0, 60)}" (${r.tool ?? "-"}, ${r.defect}) — ${r.why}`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/summary.txt`, lines.join("\n"), "utf8");
writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2), "utf8");
writeFileSync(
  `${OUT}/transcript.md`,
  rows
    .map((r) =>
      [
        `## [${r.score}] ${r.lang} · ${r.intent} · ${r.kind} — ${r.said}`,
        `tool \`${r.tool ?? "-"}\` · ${r.ms}ms · defect ${r.defect} · flags ${r.flags.join(", ") || "-"}`,
        `**Judge:** ${r.why}`,
        "```",
        r.answer.slice(0, 2500),
        "```",
        r.chips.length ? `buttons: ${r.chips.join(" · ")}` : "",
      ].join("\n"),
    )
    .join("\n\n"),
  "utf8",
);
console.log(lines.join("\n"));
process.exit(0);
