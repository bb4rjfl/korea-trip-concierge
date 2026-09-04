/**
 * Reading the request, not just its topic.
 *
 * The retrieval layer answered "what is this about". The evaluation showed that
 * is only half of what a sentence carries, and the missing half is where the
 * answers went wrong:
 *
 *   "something indoors and quiet, I'm exhausted from shopping"
 *       → a mall, an aquarium and a department store. Topically right. The word
 *         doing the work was *quiet*, and nothing read it.
 *   "I'm vegan and my friend eats only halal, where can we eat together"
 *       → halal only. Two constraints were stated and one survived.
 *   "my card was declined, what now"
 *       → a general explanation of Korean card acceptance, when the question
 *         was what to do in the next thirty seconds.
 *
 * So: a small layer that pulls the qualifiers out before anything is searched,
 * and hands them on as constraints. This is the query-understanding step that
 * the standard retrieval pipeline puts in front of retrieval and that we had
 * skipped — with the difference that it is deterministic rules over the four
 * languages we serve rather than a model call, because it runs on the request
 * path and a wrong reading here quietly bends every answer after it.
 */

export interface Reading {
  /** Qualities the place itself must have — the adjectives, not the noun. */
  qualities: string[];
  /** Dietary or religious requirements, all of them, not the first one found. */
  diets: string[];
  /** They are in trouble now and need a next action, not an explanation. */
  urgent: boolean;
  /** They asked about right now — hours, weather, whether it is the season. */
  rightNow: boolean;
  /** They asked whether something is allowed, not where it is. */
  permission: boolean;
  /**
   * What they have had enough of.
   *
   * "I'm exhausted from shopping" names the thing to avoid as clearly as it
   * names what they want, and answering it with a mall — even a quiet one —
   * reads as not having listened.
   */
  avoid: string[];
}

/** "tired of X", "sick of X", "X에 지쳤" — the thing they have had enough of. */
const HAD_ENOUGH: [RegExp, string][] = [
  [/(?:tired|exhausted|sick|done|enough)[^.]{0,24}\b(?:shopping|shops|malls?)\b|쇼핑[^.]{0,10}(?:지쳤|질렸|그만)/i, "shopping"],
  [/(?:tired|exhausted|sick|done|enough)[^.]{0,24}\b(?:walking|walk)\b|걷[^.]{0,8}(?:지쳤|힘들)/i, "walking"],
  [/(?:tired|exhausted|sick|done|enough)[^.]{0,24}\b(?:museums?|palaces?|temples?)\b/i, "history"],
  [/(?:tired|exhausted|sick|done|enough)[^.]{0,24}\b(?:crowds?|people|queues?|lines)\b|사람[^.]{0,8}많[^.]{0,8}지쳤/i, "crowded"],
];

/** Adjectives that decide whether an answer fits, in four languages. */
const QUALITIES: [RegExp, string][] = [
  // `\brest\b`, because "restaurant" was reading as a request for somewhere
  // restful and quietly bending every food answer towards teahouses.
  [
    /quiet|calm|peaceful|relax|unwind|\brest\b|\btired\b|exhausted|sit down|조용|한적|쉴|쉬고|편하게|지쳤|静か|落ち着|休め|疲れ|安[静靜]|休息|累/i,
    "quiet",
  ],
  [/indoor|inside|out of the (?:rain|cold|heat)|sheltered|실내|안에서|비 ?피|屋内|室内|中で|室[内內]|避雨/i, "indoor"],
  [/outdoor|outside|fresh air|야외|바깥|屋外|外で|户外|戶外/i, "outdoor"],
  [/cheap|budget|free|affordable|저렴|무료|공짜|가성비|安い|無料|便宜|免[费費]/i, "cheap"],
  [/local|authentic|not touristy|off the beaten|현지|관광객 ?없|로컬|地元|穴場|当地|當地/i, "local"],
  [/famous|must.?see|iconic|유명|필수|대표|有名|定番|著名|必去/i, "famous"],
  [/late|night|after (?:10|11|midnight)|24 ?hours?|심야|밤늦|24시간|深夜|夜遅|24[时時][间間]|通宵/i, "late"],
  [/kid|child|family|stroller|아이|어린이|가족|子供|子連れ|孩子|親子/i, "family"],
];

/** Requirements that rule a place in or out, rather than merely ranking it. */
const DIETS: [RegExp, string][] = [
  // Japanese writes it both ways; only ヴィーガン was here, so ビーガン read as nothing.
  [/\bvegan\b|비건|ヴィーガン|ビーガン|完全菜食|[纯純]素/i, "vegan"],
  [/vegetarian|채식|ベジタリアン|素食/i, "vegetarian"],
  [/halal|무슬림|할랄|ハラル|清真|穆斯林/i, "halal"],
  [/kosher|코셔|コーシャ|洁食|潔食/i, "kosher"],
  [/no pork|pork.?free|돼지고기 ?(?:안|못|빼)|豚肉(?:抜き|なし)|不吃猪肉|無豬肉/i, "no-pork"],
  [/gluten.?free|글루텐 ?프리|グルテンフリー|无麸质|無麩質/i, "gluten-free"],
];

/**
 * "What do I do now", as opposed to "how does this work".
 *
 * The distinction matters because the same knowledge answers both and the
 * shape has to differ: someone whose card was just declined at a till does not
 * want an essay on Korean card acceptance, they want the next thing to try.
 */
const URGENT =
  /what (?:do|should) i do (?:now|next)?|right now|what now|stuck|stranded|died|dead battery|no (?:cash|money|phone|battery|signal)|locked out|missed the last|declined|rejected|not working|won'?t work|help\b|지금 ?어떻게|어떡해|큰일|막차 ?놓|배터리 ?없|현금 ?없|안 ?돼|どうすれば|困って|どうしよう|終電|怎[么麼][办辦]|没[电電]了|没[现現]金|不能用/i;

/** They asked about the present moment, which a general card does not answer. */
const RIGHT_NOW =
  /right now|at the moment|today|tonight|currently|open now|is it .* season|this week|지금|오늘|현재|이번 ?주|今|本日|今夜|今週|[现現]在|今天|今晚|本周|本週/i;

/** "Am I allowed to", not "where is". */
const PERMISSION =
  /can i (?:bring|take|wear|use|enter|smoke|drink)|am i allowed|is it (?:ok|okay|allowed|permitted|possible) to|do they allow|are .* allowed|해도 ?되|가능한가요|들어가도|반입|허용|入れ(?:ます|る)|持ち込|大丈夫ですか|可以[带帶]|允[许許]|能不能/i;

export function understand(text: string): Reading {
  const t = text ?? "";
  return {
    qualities: QUALITIES.filter(([re]) => re.test(t)).map(([, q]) => q),
    diets: DIETS.filter(([re]) => re.test(t)).map(([, d]) => d),
    urgent: URGENT.test(t),
    rightNow: RIGHT_NOW.test(t),
    permission: PERMISSION.test(t),
    avoid: HAD_ENOUGH.filter(([re]) => re.test(t)).map(([, a]) => a),
  };
}

export function isEmptyReading(r: Reading): boolean {
  return (
    !r.qualities.length && !r.diets.length && !r.avoid.length && !r.urgent && !r.rightNow && !r.permission
  );
}

/** Words that mark a document as the thing they said they had had enough of. */
const AVOID_MARKERS: Record<string, RegExp> = {
  shopping: /shopping|mall|department store|백화점|쇼핑|outlet|retail/i,
  walking: /trail|hike|uphill|\bwalk\b|stairs|둘레길|등산/i,
  history: /palace|museum|temple|shrine|heritage|궁|박물관|사찰/i,
  crowded: /busiest|packed|crowded|most.?visited|번화|붐비/i,
};

/** Would this document be the thing they just said they were done with? */
export function shouldAvoid(reading: Reading, text: string): boolean {
  return reading.avoid.some((a) => AVOID_MARKERS[a]?.test(text));
}

/**
 * Words that make a document a better answer for these qualities.
 *
 * Appended to the search text rather than used as a hard filter: a quiet place
 * rarely describes itself as quiet, but it does describe itself as a garden, a
 * library, a teahouse. Naming those pulls them up without excluding anything.
 */
const EXPANSION: Record<string, string> = {
  quiet: "calm peaceful garden library teahouse temple park bookshop museum lounge sit rest",
  indoor: "indoor inside covered hall museum library aquarium mall arcade sheltered",
  outdoor: "outdoor park riverside walk trail garden square rooftop",
  cheap: "free no admission cheap market street affordable public park",
  local: "neighbourhood local residents alley traditional market ordinary",
  famous: "landmark famous iconic must-see palace tower",
  late: "24 hours late night open until midnight jjimjilbang",
  family: "family children kids playground aquarium zoo hands-on",
};

/** The dietary terms a document would use, so a requirement can find them. */
const DIET_EXPANSION: Record<string, string> = {
  vegan: "vegan plant-based no animal products temple food",
  vegetarian: "vegetarian meat-free temple food",
  halal: "halal muslim-friendly mosque masjid Itaewon certified",
  kosher: "kosher jewish",
  "no-pork": "pork-free no pork halal seafood chicken beef",
  "gluten-free": "gluten-free rice-based no wheat",
};

/**
 * Rewrite the search phrase so the qualifiers actually reach the index.
 *
 * Query expansion rather than query replacement: the traveller's own words stay
 * in, because they carry the topic, and the expansion adds the vocabulary a
 * matching document would plausibly use.
 */
export function expandQuery(text: string, reading: Reading = understand(text)): string {
  const extra = [
    ...reading.qualities.map((q) => EXPANSION[q] ?? q),
    ...reading.diets.map((d) => DIET_EXPANSION[d] ?? d),
  ];
  return extra.length ? `${text} ${extra.join(" ")}` : text;
}

/**
 * A line naming what we understood, for the answer to lead with.
 *
 * Shown for the same reason the course card says what it planned for: a wrong
 * reading is only correctable if the traveller can see it.
 */
export function readingNote(reading: Reading): string {
  const bits = [...reading.diets, ...reading.qualities];
  const note = bits.length ? `Looking for: ${bits.join(" · ")}` : "";
  const skip = reading.avoid.length ? `no more ${reading.avoid.join(", ")}` : "";
  const both = [note, skip].filter(Boolean).join(" · ");
  return both ? `_${both}._` : "";
}
