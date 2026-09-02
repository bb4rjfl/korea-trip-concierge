/**
 * What we know about the traveller, read from what they actually said.
 *
 * The course builder knew a persona, a duration and a city. It did not know that
 * someone had written "we're on a budget", "my mother walks slowly", "not another
 * market" — so it kept proposing the same shape of day at the same price with the
 * same amount of walking. A recommender that ignores the three sentences the
 * traveller just typed is a catalogue.
 *
 * Everything here is read deterministically from the conversation in the four
 * languages we serve. Nothing is inferred about the person beyond what they wrote
 * about their own trip, and none of it is stored — the client resends its own
 * transcript and we read it fresh each turn.
 */

export interface TravelProfile {
  /** Cheap-first: free sights, markets and street food over department stores. */
  budget?: "low";
  /** How much to fit in a day. */
  pace?: "relaxed" | "packed";
  /** Limited walking — no hills, no long trails, no stair-heavy villages. */
  mobility?: "easy";
  /** Travelling with young children. */
  withKids?: boolean;
  /** Diet that rules places in or out. */
  dietary: string[];
  /** Themes or places they said no to. */
  dislikes: string[];
  /** Themes or places they liked. */
  likes: string[];
}

const RULES: { key: keyof TravelProfile | "dislike" | "like"; value?: string; re: RegExp }[] = [
  {
    key: "budget",
    value: "low",
    re: /\bbudget\b|\bcheap(ly|er)?\b|save money|not expensive|inexpensive|afford|free (?:things|stuff|to do)|저렴|싸게|가성비|아끼|무료로|돈 ?없|安い|節約|安く|便宜|省[钱錢]|免[费費]/i,
  },
  {
    key: "pace",
    value: "relaxed",
    re: /\bslow(ly)?\b|relaxed|take it easy|not too much|no rush|leisurely|unhurried|천천히|여유(?:롭게|있게)?|무리 ?없|쉬엄쉬엄|ゆっくり|のんびり|慢慢|[轻輕][松鬆]|悠[闲閒]/i,
  },
  {
    key: "pace",
    value: "packed",
    re: /as much as possible|see everything|pack(ed)? (?:in|the day)|maximi[sz]e|busy day|많이 ?보|빡세게|알차게|たくさん(?:回|見)|[尽盡]量多|多逛/i,
  },
  {
    key: "mobility",
    value: "easy",
    re: /can'?t walk|hard to walk|bad (?:knee|back|leg|hip)|(?:knee|back|leg|hip|feet|foot|ankle)s? (?:is|are|'?s) (?:bad|sore|hurting|killing)|(?:knee|back|leg|hip|ankle)s? (?:hurt|ache)|sore feet|tired legs|not much walking|less walking|wheelchair|stroller|pram|elderly|grandmother|grandfather|my mother walks|walks slowly|많이 ?(?:못|안) ?(?:걷|걸으|걸어)|잘 ?못 ?(?:걷|걸으|걸어)|오래 ?(?:못|안) ?(?:걷|걸으|걸어)|걷기 ?(?:힘들|어려)|다리(?:가)? ?아프|무릎|유모차|휠체어|어르신|노약자|歩けな|歩くのが|車椅子|ベビーカー|走不[动動]|[轮輪]椅|婴儿车|嬰兒車/i,
  },
  {
    key: "withKids",
    value: "true",
    // "with our 5 year old" is how people actually say it, and it matched none
    // of the words below — so the day stayed a grown-up's day and put a
    // five-year-old on Inwangsan after dark.
    re: /\bkids?\b|children|toddler|baby|infant|my son|my daughter|little one|\b\d{1,2}[- ]?(?:year|yr)s?[- ]?old\b|kindergarten|preschool|아이(?:들)?|어린이|애들|유아|\d{1,2}살|살짜리|子供|子ども|\d{1,2}歳の子|孩子|小孩|\d{1,2}岁/i,
  },
];

const DIET: [RegExp, string][] = [
  [/vegetarian|비건은 ?아니|채식|ベジタリアン|素食/i, "vegetarian"],
  [/\bvegan\b|비건|ヴィーガン|[纯純]素/i, "vegan"],
  [/halal|무슬림|할랄|ハラル|清真|穆斯林/i, "halal"],
  [/no pork|pork.?free|돼지고기 ?(?:안|못)|豚肉(?:は)?(?:食べ|だめ)|不吃猪肉/i, "no-pork"],
];

/** "not another market", "별로였어", "싫어" — what they are steering away from. */
const NEGATIVE =
  /\bnot (?:another|more)\b|no more|don'?t (?:like|want)|hate|boring|rather not|instead of|별로|싫어|말고|재미없|다른 ?거|つまらない|嫌|以外|不喜[欢歡]|无聊|無聊|不要/i;
const POSITIVE = /\b(?:love|loved|like|liked|great|perfect|nice)\b|좋아|좋았|마음에 들|괜찮|いい|良かった|好き|喜[欢歡]|不[错錯]/i;

/** Themes a sentence is talking about, so a dislike can be acted on. */
const THEME_WORDS: [RegExp, string][] = [
  [/market|시장|市場|市场/i, "market"],
  [/museum|gallery|박물관|미술관|美術館|博物[馆館]/i, "experience"],
  [/palace|temple|history|historic|고궁|궁|절|사찰|역사|歴史|寺|[历歷]史/i, "history"],
  [/caf[eé]|coffee|카페|커피|カフェ|咖啡/i, "cafe"],
  [/shop|mall|shopping|쇼핑|백화점|買い物|[购購]物/i, "shopping"],
  [/park|hike|hiking|mountain|nature|공원|산|자연|등산|公園|自然|公园/i, "nature"],
  [/bar|club|night|나이트|술집|밤|夜|酒吧/i, "nightlife"],
  [/food|eat|restaurant|맛집|음식|食べ|料理|美食/i, "food"],
];

function themesIn(text: string): string[] {
  return THEME_WORDS.filter(([re]) => re.test(text)).map(([, t]) => t);
}

/**
 * Polarity belongs to a sentence, not to a conversation.
 *
 * The web layer hands us the recent turns joined with " · ", and reading that as
 * one utterance put every theme mentioned anywhere under the one "not another"
 * in it: a foodie who said "a day for a foodie" and then "not another market"
 * came back with "skipping market, food" and a day with nothing to eat.
 */
function splitClauses(raw: string): string[] {
  return (raw ?? "")
    .split(/\s+·\s+|[.!?;\n]+|(?:,\s*)?(?:\band\b|\bbut\b|그리고|하지만|근데)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read the profile out of the conversation.
 *
 * Only user turns are read: the assistant's own cards mention markets and cafés
 * constantly, and counting those as preferences would have the service talking
 * itself into a loop.
 */
export function readProfile(userTurns: string[]): TravelProfile {
  const p: TravelProfile = { dietary: [], dislikes: [], likes: [] };
  for (const raw of userTurns.flatMap(splitClauses)) {
    const t = (raw ?? "").trim();
    if (!t) continue;

    for (const rule of RULES) {
      if (!rule.re.test(t)) continue;
      if (rule.key === "withKids") p.withKids = true;
      else if (rule.key === "budget") p.budget = "low";
      else if (rule.key === "pace") p.pace = rule.value as "relaxed" | "packed";
      else if (rule.key === "mobility") p.mobility = "easy";
    }
    for (const [re, tag] of DIET) if (re.test(t) && !p.dietary.includes(tag)) p.dietary.push(tag);

    // A sentence that says no puts its themes on the dislike list; one that says
    // yes puts them on the like list. A sentence doing neither is just a request.
    const themes = themesIn(t);
    if (themes.length && NEGATIVE.test(t)) {
      for (const th of themes) if (!p.dislikes.includes(th)) p.dislikes.push(th);
    } else if (themes.length && POSITIVE.test(t)) {
      for (const th of themes) if (!p.likes.includes(th)) p.likes.push(th);
    }
  }
  // Liking something explicitly outranks having dismissed it earlier.
  p.dislikes = p.dislikes.filter((d) => !p.likes.includes(d));
  return p;
}

/** True when we learned nothing — the caller can skip the "planned for" line. */
export function isEmptyProfile(p: TravelProfile): boolean {
  return (
    !p.budget && !p.pace && !p.mobility && !p.withKids && !p.dietary.length && !p.dislikes.length && !p.likes.length
  );
}

const LABELS: Record<string, string> = {
  budget: "on a budget",
  relaxed: "unhurried",
  packed: "a full day",
  easy: "less walking",
  kids: "with children",
};

/** One line telling the traveller what we took from what they said. */
export function profileNote(p: TravelProfile): string {
  const bits: string[] = [];
  if (p.pace) bits.push(LABELS[p.pace]);
  if (p.budget) bits.push(LABELS.budget);
  if (p.mobility) bits.push(LABELS.easy);
  if (p.withKids) bits.push(LABELS.kids);
  if (p.dietary.length) bits.push(p.dietary.join(" / "));
  if (p.dislikes.length) bits.push(`skipping ${p.dislikes.join(", ")}`);
  return bits.length ? `_Planned for: ${bits.join(" · ")}._` : "";
}
