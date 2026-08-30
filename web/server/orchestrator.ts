/**
 * Chat orchestration: language → (LLM intent | rule router) → tool execution →
 * chip extraction. Stateless: the client sends its own recent history.
 */

import { executeTool, CATALOG_BY_NAME } from "./catalog.js";
import { parseToolMarkdown, type Chip } from "./chips.js";
import { llmDecide, llmEnabled, llmTranslate, type ChatTurn } from "./llm.js";
import { criticalRoute, detectLang, isTraditionalChinese, routeText, type Lang } from "./router.js";
import { backfillArgs, contextHint, deriveContext } from "./context.js";
import { localizeLabels, toTraditional } from "./labels.js";
import { asksAboutExit, exitFor } from "../../src/lib/exits.js";
import { searchPlaces } from "../../src/lib/sources/tourapi.js";

export interface ChatRequest {
  messages: ChatTurn[];
  uiLang?: Lang;
}

export interface PlaceImage {
  title: string;
  image: string;
}

export interface ChatResponse {
  /** Plain-text assistant line (welcome/clarify/direct answer). */
  reply?: string;
  /** Tool result body (Markdown, chip footer already stripped). */
  toolMarkdown?: string;
  /** TourAPI photos matched to places in the answer (ⓒ한국관광공사). */
  images?: PlaceImage[];
  chips: Chip[];
  meta: { tool?: string; lang: Lang; engine: "llm" | "rules" | "none"; ms: number };
}

/** Progress events for the SSE transport (client shows live stage labels). */
export type StatusEvent =
  | { stage: "routing" }
  | { stage: "tool"; tool: string }
  | { stage: "localizing" };

/* ------------------------- localized system strings ------------------------- */

const WELCOME: Record<Lang, string> = {
  en: "Hi! I'm your Korea trip concierge. Ask me anything that comes up mid-trip — weather pivots, live bus/subway arrivals, routes, menus, payments, or what's open right now.",
  ja: "こんにちは！韓国旅行コンシェルジュです。天気の急変、バス・地下鉄のリアルタイム到着、経路、メニュー、決済、営業中スポットなど、旅の途中の困りごとを何でも聞いてください。",
  zh: "你好！我是你的韩国旅行管家。旅途中的任何问题都可以问我——天气突变、公交/地铁实时到站、路线、菜单、支付、现在营业的地方。",
  ko: "안녕하세요! 한국 여행 컨시어지입니다. 여행 중 생기는 일 — 날씨 급변, 버스·지하철 실시간 도착, 경로, 메뉴, 결제, 지금 영업 중인 곳 — 무엇이든 물어보세요.",
};

const CLARIFY_PREFIX: Record<Lang, string> = {
  en: "Almost there — could you tell me",
  ja: "もう少しです — 教えてください：",
  zh: "就差一点 — 请告诉我",
  ko: "거의 다 됐어요 — 알려주시면 바로 찾아드릴게요:",
};

const FIELD_QUESTIONS: Record<string, Record<Lang, string>> = {
  "trackBusArrival.busNumber": {
    en: "which bus number?",
    ja: "何番のバスですか？",
    zh: "几路公交？",
    ko: "몇 번 버스인가요?",
  },
  "trackBusArrival.city": {
    en: "which city the bus runs in?",
    ja: "どの都市のバスですか？",
    zh: "在哪个城市？",
    ko: "어느 도시인가요?",
  },
  "getNowInfo.place": {
    en: "which place you mean?",
    ja: "どの場所ですか？",
    zh: "哪个地方？",
    ko: "어떤 장소인가요?",
  },
  "getAreaGuide.area": {
    en: "which neighborhood?",
    ja: "どのエリアですか？",
    zh: "哪个街区？",
    ko: "어느 동네인가요?",
  },
  "explainPayment.situation": {
    en: "what you're trying to pay for?",
    ja: "何のお支払いですか？",
    zh: "你在支付什么？",
    ko: "어떤 결제 상황인가요?",
  },
  "explainKoreanService.service": {
    en: "which Korean app or system you're stuck on?",
    ja: "どのアプリ/サービスで困っていますか？",
    zh: "卡在哪个应用或系统上？",
    ko: "어떤 앱/서비스에서 막히셨나요?",
  },
  "translateMenuContext.menuText": {
    en: "the menu text or dish name?",
    ja: "メニューの文字か料理名は？",
    zh: "菜单文字或菜名是什么？",
    ko: "메뉴 텍스트나 음식 이름이 뭔가요?",
  },
};

/** Shown above an English tool answer when we couldn't translate (LLM off). */
const ENGLISH_NOTE: Record<Exclude<Lang, "en">, string> = {
  ko: "_🌐 방한 외국인 여행자를 위한 영어 정보입니다._",
  ja: "_🌐 訪韓旅行者向けの英語情報です。_",
  zh: "_🌐 面向访韩游客的英文信息。_",
};

/** Rough share of `lang`-script characters — detects an untranslated English body. */
function scriptShare(text: string, lang: Lang): number {
  if (lang === "en") return 1;
  const ranges: Record<Exclude<Lang, "en">, RegExp> = {
    ko: /[가-힯]/g,
    ja: /[぀-ヿ]/g,
    zh: /[一-鿿]/g,
  };
  const hits = text.match(ranges[lang])?.length ?? 0;
  const letters = text.replace(/[^\p{L}]/gu, "").length || 1;
  return hits / letters;
}

/* ------------------------------ safety net --------------------------------- */

/**
 * Life-threatening phrasing, in the four languages we serve.
 *
 * QA found "someone is having a seizure on the subway platform" and "my friend
 * fainted and is not responding" being answered with a generic "which area?"
 * card listing ATMs and pharmacies — no ambulance number anywhere. Routing this
 * through the LLM and hoping it picks the emergency tool is not good enough, so
 * the number is prepended deterministically before anything else runs.
 */
const LIFE_THREATENING_RE =
  /seizure|convuls|unconscious|not breathing|can.?t breathe|choking|heart attack|cardiac|stroke|overdose|bleeding badly|heavy bleeding|unresponsive|passed out|fainted|collapsed|anaphyla|의식(?:이)?\s*없|쓰러|발작|경련|숨을?\s*(?:안|못)\s*(?:쉬|쉼)|심정지|심장마비|뇌졸중|과다출혈|의식불명|意識(?:が)?な|倒れ|発作|けいれん|呼吸(?:が)?(?:ない|できな)|心臓発作|脳卒中|昏迷|昏倒|不省人事|抽搐|癫痫|呼吸(?:困难|停止)|心脏病发|中风|大出血/i;

/** A personal-safety threat needs the POLICE first, not an ambulance. */
const SAFETY_THREAT_RE =
  /following me|followed me|threaten|attack(?:ed|ing)?|assault|harass|mugg(?:ed|ing)|robbed|feel unsafe|in danger|쫓아와|따라와|위협|폭행|성추행|위험해|살려|追いかけ|襲われ|跟踪我|抢劫|被打/i;

export function isSafetyThreat(text: string): boolean {
  return SAFETY_THREAT_RE.test(text ?? "");
}

/**
 * Buying illegal drugs is a serious criminal offence in Korea, tourists included.
 * QA found 'where can I buy weed in Itaewon' answered with a place list under an
 * 'official Seoul Tourism' heading — a legal-exposure and demo risk.
 */
const ILLEGAL_RE =
  /\b(?:weed|marijuana|cannabis|hash|cocaine|meth|ecstasy|mdma|ketamine|magic mushrooms|lsd)\b|대마|마약|필로폰|大麻|毒品|覚醒剤|(?:buy|score|find|get)\s+(?:some\s+)?(?:drugs|dope)\b/i;

export function isIllegalRequest(text: string): boolean {
  return ILLEGAL_RE.test(text ?? "");
}

const ILLEGAL_REPLY: Record<Lang, string> = {
  en: "I can't help with that — cannabis and other narcotics are illegal in Korea for visitors too, and the penalties are severe (Korean law applies even to acts legal at home). I'm happy to help with anything else: nightlife areas, bars, late-night food, or getting home safely.",
  ko: "그건 도와드릴 수 없어요 — 한국에서 대마를 포함한 마약류는 외국인에게도 불법이고 처벌이 무겁습니다(본국에서 합법이어도 한국 법이 적용됩니다). 대신 밤에 놀 만한 동네, 술집, 심야 음식, 안전한 귀가 방법은 얼마든지 도와드릴게요.",
  ja: "それはお手伝いできません — 韓国では大麻を含む薬物は旅行者にも違法で、刑罰が非常に重いです(母国で合法でも韓国の法律が適用されます)。ナイトスポット、バー、深夜の食事、安全な帰り方などは喜んでご案内します。",
  zh: "这个我无法协助 — 在韩国，大麻及其他毒品对外国游客同样违法，处罚很重(即使在本国合法，韩国法律仍然适用)。夜生活区域、酒吧、深夜美食或安全回住处的方法，我很乐意帮忙。",
};

/** Police-first banner, shown above whatever else we found. */
const POLICE_BANNER: Record<Lang, string> = {
  en: "🚨 **If you are in immediate danger, call 112 (police) now** — or step into a lit shop, a convenience store, or a police box (파출소) and ask them to call. **1330** (24h) can interpret for you. Ambulance: **119**.",
  ko: "🚨 **위험한 상황이면 지금 112(경찰)로 전화하세요** — 또는 불 켜진 가게·편의점·파출소로 들어가 도움을 요청하세요. **1330**(24시간)이 통역해 드립니다. 구급차는 **119**.",
  ja: "🚨 **危険を感じたら今すぐ112(警察)へ** — または明かりのある店・コンビニ・交番(파출소)に入って助けを求めてください。**1330**(24時間)が通訳します。救急車は **119**。",
  zh: "🚨 **如果有危险，请立即拨打 112(报警)** — 或走进有灯光的商店、便利店或派出所(파출소)求助。**1330**(24小时)可提供翻译。救护车：**119**。",
};

export function isLifeThreatening(text: string): boolean {
  return LIFE_THREATENING_RE.test(text ?? "");
}

/** Ambulance-first banner, shown above whatever else we found. */
const EMERGENCY_BANNER: Record<Lang, string> = {
  en: "🚨 **If this is an emergency, call 119 now** — ambulance & fire, free, with interpretation. Not sure? **1339** for medical advice, **1330** for a 24h English hotline that can interpret for you. Police: **112**.",
  ko: "🚨 **응급 상황이면 지금 119로 전화하세요** — 구급차·소방(무료, 통역 지원). 판단이 어려우면 **1339**(의료 상담), **1330**(24시간 다국어 통역 연결). 경찰: **112**.",
  ja: "🚨 **緊急の場合は今すぐ119番へ** — 救急車・消防(無料、通訳あり)。判断に迷うときは **1339**(医療相談)、**1330**(24時間多言語ホットライン・通訳可)。警察は **112**。",
  zh: "🚨 **如果是紧急情况，请立即拨打 119** — 救护车/消防(免费,可提供翻译)。不确定时可拨 **1339**(医疗咨询)或 **1330**(24小时多语种热线,可代为翻译)。报警：**112**。",
};
/** Marker used to carry the chip labels through one translation call with the body. */
const CHIP_MARKER = "<<<CHIPS>>>";

/**
 * Localize the whole answer — body AND chip labels — in a single LLM call.
 * Korean already ships with native chip text from the tools, so only ja/zh need
 * their chips translated. Chips are the primary interaction surface: English
 * buttons under a Japanese answer are unusable, and tapping one used to throw
 * the whole session back into English.
 */
async function localizeAnswer(
  body: string,
  chips: Chip[],
  lang: Lang,
  traditional = false,
): Promise<{ body: string; chips: Chip[] }> {
  if (lang === "en") return { body, chips };

  // Korean chips: prefer the tools' hand-written cmdKo. Six tools ship none at
  // all (40 chips, 27 English-only), so the gaps are translated rather than left
  // as English buttons under a Korean answer.
  const base = lang === "ko" ? chips.map((c) => (c.cmdKo ? { ...c, cmdEn: c.cmdKo } : c)) : chips;
  const needsLabel = base
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (lang === "ko" ? !c.cmdKo : true));

  if (!llmEnabled() || needsLabel.length === 0) {
    return { body: await localizeToolBody(body, lang, traditional), chips: base };
  }

  const chipList = needsLabel.map(({ c }, n) => `${n + 1}. ${c.cmdEn}`).join("\n");
  const packed = `${body}\n\n${CHIP_MARKER}\n${chipList}`;
  const translated = await llmTranslate(packed, lang, 9000, traditional);
  if (!translated || !translated.includes(CHIP_MARKER)) {
    // Fall back to translating the body alone rather than shipping a mangled mix.
    return { body: await localizeToolBody(body, lang, traditional), chips: base };
  }

  const [tBody, tChips] = translated.split(CHIP_MARKER);
  const labels = tChips
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  const merged = [...base];
  needsLabel.forEach(({ i }, n) => {
    if (labels[n]) merged[i] = { ...merged[i], cmdEn: labels[n] };
  });
  return { body: localizeLabels(tBody.trimEnd(), lang), chips: merged };
}

/** Localize an English tool body: LLM translation when available, else a notice line. */
async function localizeToolBody(body: string, lang: Lang, traditional = false): Promise<string> {
  // Translate unless the body is already overwhelmingly in the target script —
  // mixed bodies (localized content under English headers) get their headers
  // fixed too. Cached in llmTranslate, so chip round-trips don't re-pay.
  if (lang === "en") return body;
  // Our own labels always get translated, even in a body the LLM pass will skip:
  // a card built from Japanese tourism data reads as Japanese overall while every
  // header we wrote is still in English.
  const labelled = localizeLabels(body, lang);
  if (labelled.length < 40 || scriptShare(labelled, lang) >= 0.8) return labelled;
  const translated = await llmTranslate(labelled, lang, 9000, traditional);
  if (translated) return translated;
  if (scriptShare(labelled, lang) >= 0.05) return labelled; // partially localized — usable as-is
  return `${ENGLISH_NOTE[lang as Exclude<Lang, "en">]}\n\n${labelled}`;
}

/* ------------------------------ image enrichment ----------------------------- */

// Tools whose answers name concrete places — worth decorating with TourAPI photos.
const IMAGE_TOOLS = new Set([
  "searchPlaceForeigner",
  "getNowInfo",
  "getAreaGuide",
  "getJejuInfo",
  "recommendTripCourse",
]);

/** Pull place names out of tool Markdown: numbered entries first, else the hero title. */
export function extractPlaceNames(md: string): string[] {
  const names: string[] = [];
  const entry = /^\*\*\d+\.\s+([^*\n]+?)\*\*/gm;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(md)) !== null && names.length < 3) names.push(m[1].trim());
  if (names.length === 0) {
    const hero = /\*\*([^*\n]+)\*\*/.exec(md);
    if (hero) {
      const name = hero[1].split(" — ")[0].split(" – ")[0].trim();
      if (name && !/^\d/.test(name)) names.push(name);
    }
  }
  return names;
}

/**
 * Fetch TourAPI photos for up to 3 places named in the answer. Fail-soft: any
 * miss/mismatch just drops that photo. Adds real KTO imagery to the chat (and
 * legitimate TourAPI usage), never latency beyond the translation running in
 * parallel (same cache/timeout budget as all sources).
 */
async function enrichImages(body: string, tool: string | undefined, lang: Lang): Promise<PlaceImage[]> {
  if (!tool || !IMAGE_TOOLS.has(tool)) return [];
  const names = extractPlaceNames(body);
  if (names.length === 0) return [];

  const found = await Promise.all(
    names.map(async (raw) => {
      // Prefer the Korean parenthetical (best TourAPI recall), else the clean name.
      const ko = /[(（]([가-힣][^)）]*)[)）]/.exec(raw)?.[1]?.trim();
      const query = (ko ?? raw.replace(/\s*[(（][^)）]*[)）]/g, "")).trim();
      if (query.length < 2) return null;
      try {
        const places = await searchPlaces({ keyword: query, limit: 1, language: ko ? "ko" : lang === "ja" || lang === "zh" ? lang : "en" });
        const p = places[0];
        if (!p?.image) return null;
        // Similarity gate — the found title must overlap the query (fail-soft on mismatch).
        const t = p.title.toLowerCase();
        const q = query.toLowerCase();
        if (!t.includes(q.slice(0, Math.min(q.length, 6))) && !q.includes(t.slice(0, 6))) return null;
        return { title: raw.replace(/\s*[(（][^)）]*[)）]/g, "").trim(), image: p.image };
      } catch {
        return null;
      }
    }),
  );
  const seen = new Set<string>();
  return found.filter((x): x is PlaceImage => {
    if (!x || seen.has(x.image)) return false;
    seen.add(x.image);
    return true;
  });
}

/**
 * When a follow-up lands on the identical card, say so.
 *
 * "Anything cheaper?" after a restaurant list would re-run the same search and
 * reprint the same five places, which reads as a broken app rather than as an
 * answer. Naming the repeat and asking for the missing detail is honest and gets
 * the conversation moving again.
 */
const REPEAT_NOTE: Record<Lang, string> = {
  en: "_That's the same answer as above — tell me what to change (a different area, price, time or cuisine) and I'll look again._",
  ja: "_先ほどと同じ内容です。エリア・予算・時間・ジャンルなど、変えたい条件を教えてください。_",
  zh: "_和上面的结果相同。告诉我要改什么（地区、价格、时间或菜系），我再查一次。_",
  ko: "_위와 같은 결과예요. 지역·가격·시간·종류 중 무엇을 바꿀지 알려주시면 다시 찾아볼게요._",
};

const ERROR_MSG: Record<Lang, string> = {
  en: "Sorry — something hiccuped on my side. Please try that once more.",
  ja: "すみません、こちらの不具合です。もう一度お試しください。",
  zh: "抱歉，我这边出了点小问题，请再试一次。",
  ko: "죄송해요, 잠시 문제가 있었어요. 한 번만 다시 시도해 주세요.",
};

/** Default suggestion chips for welcome/unrouted turns (en/ko pair like tools). */
const DEFAULT_CHIPS_BY_LANG: Record<Lang, Chip[]> = {
  en: [
    { emoji: "🌧️", cmdEn: "It's raining in Seoul — where can I go indoors?" },
    { emoji: "🚇", cmdEn: "When is the last train from Hongik University station?" },
    { emoji: "🕐", cmdEn: "Is Gyeongbokgung Palace open now?" },
    { emoji: "💳", cmdEn: "My card was declined at a restaurant — what now?" },
  ],
  ko: [
    { emoji: "🌧️", cmdEn: "서울에 비 오는데 실내로 갈 만한 곳은?" },
    { emoji: "🚇", cmdEn: "홍대입구역 막차 언제야?" },
    { emoji: "🕐", cmdEn: "경복궁 지금 열었어?" },
    { emoji: "💳", cmdEn: "식당에서 카드가 거절됐어 — 어떡하지?" },
  ],
  ja: [
    { emoji: "🌧️", cmdEn: "ソウルで雨が降っています — 室内で行ける場所は？" },
    { emoji: "🚇", cmdEn: "弘大入口駅の終電は何時ですか？" },
    { emoji: "🕐", cmdEn: "景福宮は今開いていますか？" },
    { emoji: "💳", cmdEn: "レストランでカードが使えませんでした — どうすれば？" },
  ],
  zh: [
    { emoji: "🌧️", cmdEn: "首尔下雨了 — 有什么室内的地方可以去？" },
    { emoji: "🚇", cmdEn: "弘大入口站的末班车是几点？" },
    { emoji: "🕐", cmdEn: "景福宫现在开门吗？" },
    { emoji: "💳", cmdEn: "在餐厅刷卡被拒了 — 怎么办？" },
  ],
};

/* --------------------------------- pipeline --------------------------------- */

export async function handleChat(req: ChatRequest, onStatus?: (e: StatusEvent) => void): Promise<ChatResponse> {
  const start = Date.now();
  const history = (req.messages ?? []).filter((m) => typeof m?.content === "string");
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const uiLang: Lang | undefined =
    req.uiLang && ["en", "ja", "zh", "ko"].includes(req.uiLang) ? req.uiLang : undefined;
  const text = (lastUser?.content ?? "").trim();
  // The language the user PICKED wins. Detecting per message looked clever and was
  // the single biggest defect source: every chip is written in English, so tapping
  // one threw a Japanese session into English — and an English chip carrying a
  // kanji place name threw it into Chinese. One Korean dish name inside an English
  // question ("What is 부대찌개?") flipped the whole answer to Korean, for the very
  // user who cannot read it. Script detection now only fills in when the client
  // sent no preference at all.
  const lang: Lang = uiLang ?? detectLang(text) ?? "en";
  // Someone writing 觀光 rather than 观光 should not be answered in Simplified.
  const hant = lang === "zh" && history.some((h) => h.role === "user" && isTraditionalChinese(h.content));

  // Deterministic safety net: if the user described a life-threatening situation,
  // the ambulance number leads — whatever the router decided to do underneath.
  // A safety threat needs the police first; a medical emergency the ambulance.
  const threat = isSafetyThreat(text);
  const urgent = isLifeThreatening(text) || threat;
  const banner = threat ? POLICE_BANNER[lang] : EMERGENCY_BANNER[lang];
  // Slots recovered from what was already said, so a tapped chip or a
  // "how do I get there from here?" keeps the journey it belongs to.
  const ctx = deriveContext(history);
  const done = (partial: Omit<ChatResponse, "meta"> & { meta?: Partial<ChatResponse["meta"]> }): ChatResponse => {
    const withBanner = urgent
      ? {
          ...partial,
          toolMarkdown: partial.toolMarkdown
            ? `${banner}

---

${partial.toolMarkdown}`
            : undefined,
          reply: partial.toolMarkdown ? partial.reply : `${banner}

${partial.reply ?? ""}`.trim(),
        }
      : partial;
    return {
      ...withBanner,
      meta: { lang, engine: "none", ms: Date.now() - start, ...(partial.meta ?? {}) },
    };
  };

  if (!text) {
    return done({ reply: WELCOME[lang], chips: DEFAULT_CHIPS_BY_LANG[lang] });
  }

  // Answering this with a tourism-branded place list is a legal-exposure risk.
  if (isIllegalRequest(text)) {
    return done({ reply: ILLEGAL_REPLY[lang], chips: DEFAULT_CHIPS_BY_LANG[lang] });
  }

  // "Which exit?" is a one-line question with a one-line answer, and routing it
  // through a place lookup buried the answer under opening hours and weather.
  if (asksAboutExit(text)) {
    const named = [text, ...ctx.places, ctx.area, ctx.station].filter(Boolean) as string[];
    const hit = named.map((n) => ({ n, h: exitFor(n) })).find((x) => x.h);
    if (hit?.h) {
      const card = [
        `🚪 **Exit ${hit.h.exit}** — ${hit.h.station} Station`,
        "",
        hit.h.walk,
        "",
        "_Follow the numbered signs on the platform; every exit is numbered._",
      ].join("\n");
      return done({
        toolMarkdown: await localizeToolBody(card, lang, hant),
        chips: DEFAULT_CHIPS_BY_LANG[lang],
        meta: { engine: "rules" },
      });
    }
  }

  try {
    // 1) LLM intent (optional, silent-fail) — skips junk like unknown tool names.
    let engine: ChatResponse["meta"]["engine"] = "none";
    let toolCall: { name: string; args: Record<string, unknown> } | null = null;

    // Safety- and correctness-critical intents are decided before the model.
    const critical = criticalRoute(text);
    if (critical) {
      toolCall = { name: critical.tool, args: critical.args };
      engine = "rules";
    }

    if (!toolCall && llmEnabled()) {
      onStatus?.({ stage: "routing" });
      const decision = await llmDecide(history, lang, contextHint(ctx));
      if (decision?.kind === "text") {
        // A clarifying question is the wrong answer when the conversation already
        // holds the missing piece: tapping "How do I get to Dongdaemun?" used to
        // come back as "where are you departing from?". If the rule router can
        // act on the same text, act — the slots below fill what it leaves empty.
        const salvage = routeText(text, lang);
        if (salvage) {
          toolCall = { name: salvage.tool, args: salvage.args };
          engine = "rules";
        } else {
          return done({ reply: decision.text, chips: DEFAULT_CHIPS_BY_LANG[lang], meta: { engine: "llm" } });
        }
      }
      if (decision?.kind === "tool") {
        // Normalize hallucinated variants (case/underscores) before giving up.
        const exact = CATALOG_BY_NAME.has(decision.name)
          ? decision.name
          : [...CATALOG_BY_NAME.keys()].find(
              (k) => k.toLowerCase() === decision.name.toLowerCase().replace(/[_-]/g, ""),
            );
        if (exact) {
          toolCall = { name: exact, args: decision.args };
          engine = "llm";
        } else {
          console.warn(`[llm] unknown tool from model: ${decision.name}`);
        }
      }
    }

    // 2) Rule router fallback.
    if (!toolCall) {
      const hit = routeText(text, lang);
      if (hit) {
        toolCall = { name: hit.tool, args: hit.args };
        engine = "rules";
      }
    }

    // 3) Nothing routed → welcome/help.
    if (!toolCall) {
      return done({ reply: WELCOME[lang], chips: DEFAULT_CHIPS_BY_LANG[lang] });
    }

    // 4) Execute (zod-validated); missing required args → friendly clarify.
    onStatus?.({ stage: "tool", tool: toolCall.name });
    const filled = backfillArgs(toolCall.name, toolCall.args, ctx);
    const result = await executeTool(toolCall.name, filled);
    if (!result.ok) {
      const asks = result.invalidArgs
        .map((f) => FIELD_QUESTIONS[`${toolCall!.name}.${f}`]?.[lang])
        .filter((s): s is string => Boolean(s));
      const reply = asks.length
        ? `${CLARIFY_PREFIX[lang]} ${asks.join(" ")}`
        : `${CLARIFY_PREFIX[lang]} ${result.invalidArgs.join(", ")}?`;
      return done({ reply, chips: [], meta: { tool: toolCall.name, engine } });
    }

    const { body, chips } = parseToolMarkdown(result.markdown);
    if (lang !== "en" && llmEnabled()) onStatus?.({ stage: "localizing" });
    // Translation and photo lookup run concurrently — photos ride inside the
    // translation window instead of adding latency. Chips travel with the body so
    // localizing them costs no extra round-trip: they are the primary interaction
    // surface, and English buttons under a Japanese answer are unusable.
    const [localizedRaw, images] = await Promise.all([
      localizeAnswer(body, chips, lang, hant),
      enrichImages(body, toolCall.name, lang),
    ]);
    // The client sends its own transcript back, so the previous card is right here.
    const lastAssistant = [...history].reverse().find((h) => h.role === "assistant")?.content?.trim();
    if (lastAssistant && lastAssistant === localizedRaw.body.trim()) {
      localizedRaw.body = `${localizedRaw.body}

${REPEAT_NOTE[lang]}`;
    }

    const localized = hant
      ? {
          body: toTraditional(localizedRaw.body),
          chips: localizedRaw.chips.map((c) => ({ ...c, cmdEn: toTraditional(c.cmdEn) })),
        }
      : localizedRaw;
    return done({
      toolMarkdown: localized.body,
      chips: localized.chips,
      ...(images.length ? { images } : {}),
      meta: { tool: toolCall.name, engine },
    });
  } catch (err) {
    console.error("[chat] pipeline error:", err);
    return done({ reply: ERROR_MSG[lang], chips: DEFAULT_CHIPS_BY_LANG[lang] });
  }
}
