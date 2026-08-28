/**
 * Chat orchestration: language → (LLM intent | rule router) → tool execution →
 * chip extraction. Stateless: the client sends its own recent history.
 */

import { executeTool, CATALOG_BY_NAME } from "./catalog.js";
import { parseToolMarkdown, type Chip } from "./chips.js";
import { llmDecide, llmEnabled, llmTranslate, type ChatTurn } from "./llm.js";
import { detectLang, routeText, type Lang } from "./router.js";
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
): Promise<{ body: string; chips: Chip[] }> {
  if (lang === "en") return { body, chips };

  if (lang === "ko") {
    const koChips = chips.map((c) => (c.cmdKo ? { ...c, cmdEn: c.cmdKo } : c));
    return { body: await localizeToolBody(body, lang), chips: koChips };
  }

  if (!llmEnabled() || chips.length === 0) {
    return { body: await localizeToolBody(body, lang), chips };
  }

  const chipList = chips.map((c, i) => `${i + 1}. ${c.cmdEn}`).join("\n");
  const packed = `${body}\n\n${CHIP_MARKER}\n${chipList}`;
  const translated = await llmTranslate(packed, lang);
  if (!translated || !translated.includes(CHIP_MARKER)) {
    // Fall back to translating the body alone rather than shipping a mangled mix.
    return { body: await localizeToolBody(body, lang), chips };
  }

  const [tBody, tChips] = translated.split(CHIP_MARKER);
  const labels = tChips
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  const merged = chips.map((c, i) => (labels[i] ? { ...c, cmdEn: labels[i] } : c));
  return { body: tBody.trimEnd(), chips: merged };
}

/** Localize an English tool body: LLM translation when available, else a notice line. */
async function localizeToolBody(body: string, lang: Lang): Promise<string> {
  // Translate unless the body is already overwhelmingly in the target script —
  // mixed bodies (localized content under English headers) get their headers
  // fixed too. Cached in llmTranslate, so chip round-trips don't re-pay.
  if (lang === "en" || body.length < 40 || scriptShare(body, lang) >= 0.8) return body;
  const translated = await llmTranslate(body, lang);
  if (translated) return translated;
  if (scriptShare(body, lang) >= 0.05) return body; // partially localized — usable as-is
  return `${ENGLISH_NOTE[lang as Exclude<Lang, "en">]}\n\n${body}`;
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

const ERROR_MSG: Record<Lang, string> = {
  en: "Sorry — something hiccuped on my side. Please try that once more.",
  ja: "すみません、こちらの不具合です。もう一度お試しください。",
  zh: "抱歉，我这边出了点小问题，请再试一次。",
  ko: "죄송해요, 잠시 문제가 있었어요. 한 번만 다시 시도해 주세요.",
};

/** Default suggestion chips for welcome/unrouted turns (en/ko pair like tools). */
const DEFAULT_CHIPS: Chip[] = [
  { emoji: "🌧️", cmdEn: "It's raining in Seoul — where can I go indoors?", cmdKo: "서울에 비 오는데 실내로 갈 만한 곳은?" },
  { emoji: "🚇", cmdEn: "When is the last train from Hongik University station?", cmdKo: "홍대입구역 막차 언제야?" },
  { emoji: "🕐", cmdEn: "Is Gyeongbokgung Palace open now?", cmdKo: "경복궁 지금 열었어?" },
  { emoji: "💳", cmdEn: "My card was declined at a restaurant — what now?", cmdKo: "식당에서 카드가 거절됐어 — 어떡하지?" },
];

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

  const done = (partial: Omit<ChatResponse, "meta"> & { meta?: Partial<ChatResponse["meta"]> }): ChatResponse => ({
    ...partial,
    meta: { lang, engine: "none", ms: Date.now() - start, ...(partial.meta ?? {}) },
  });

  if (!text) {
    return done({ reply: WELCOME[lang], chips: DEFAULT_CHIPS });
  }

  try {
    // 1) LLM intent (optional, silent-fail) — skips junk like unknown tool names.
    let engine: ChatResponse["meta"]["engine"] = "none";
    let toolCall: { name: string; args: Record<string, unknown> } | null = null;

    if (llmEnabled()) {
      onStatus?.({ stage: "routing" });
      const decision = await llmDecide(history, lang);
      if (decision?.kind === "text") {
        return done({ reply: decision.text, chips: DEFAULT_CHIPS, meta: { engine: "llm" } });
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
      return done({ reply: WELCOME[lang], chips: DEFAULT_CHIPS });
    }

    // 4) Execute (zod-validated); missing required args → friendly clarify.
    onStatus?.({ stage: "tool", tool: toolCall.name });
    const result = await executeTool(toolCall.name, toolCall.args);
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
    const [localized, images] = await Promise.all([
      localizeAnswer(body, chips, lang),
      enrichImages(body, toolCall.name, lang),
    ]);
    return done({
      toolMarkdown: localized.body,
      chips: localized.chips,
      ...(images.length ? { images } : {}),
      meta: { tool: toolCall.name, engine },
    });
  } catch (err) {
    console.error("[chat] pipeline error:", err);
    return done({ reply: ERROR_MSG[lang], chips: DEFAULT_CHIPS });
  }
}
