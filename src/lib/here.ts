/**
 * "Near me" — the question that needs the one thing the server is never told.
 *
 * Shared by the web client and the server, so the phone and the router agree on
 * what counts as asking about "here". It stays free of any import that would
 * drag server code into the client bundle.
 *
 * Why this matters
 * ----------------
 * Four ordinary questions, and none of them used the traveller's position:
 * "where is the nearest pharmacy" asked which neighbourhood; "what is around
 * me" asked which area; "is there a convenience store near me" searched for a
 * place called "me" and titled the card "Convenience store in me"; and "내 주변
 * 맛집" was not understood at all and got the welcome message.
 *
 * Coordinates cannot go to the server — that is what makes a service a
 * reportable location service (docs/27 §4). So the phone recognises the
 * question, finds the nearest station on the device, and sends the question
 * with that name in it: exactly what a traveller would have typed had they
 * known where they were.
 */

/** The four languages we answer in — declared here so the client need not import server code. */
export type Lang = "en" | "ko" | "ja" | "zh";

/**
 * A value that means "wherever I am" rather than naming anywhere — for tool
 * arguments, where the model sometimes writes the phrase in as if it were a
 * place. Anchored: it has to be the whole value.
 */
export const WHERE_I_AM =
  /^(?:(?:from\s+|near\s+|around\s+)?(?:me|my (?:area|location|place|hotel area|current location)|here|right here|nearby|near here|where i am(?: now)?|current location|my position)|내\s*(?:위치|주변|근처)|지금\s*(?:내\s*)?위치|여기(?:서)?|여기\s*(?:근처|주변)|현\s*위치|현재\s*위치|現在地|ここ(?:から)?|この(?:近く|辺)|今いる(?:場所|ところ)|近く|我(?:的)?(?:位置|所在地)|这里|這裡|附近|我附近|我现在的位置|我現在的位置)$/i;

/** First-person "near here" phrasing, anywhere in a sentence — including "from here", which is a route's missing start. */
const NEAR_ME_PHRASE =
  /\b(?:near|around|close to|by|from)\s+(?:me|here|my (?:hotel|place|location))\b|\bnearby\b|\bin my area\b|\bwhere i am\b|여기서|현재\s*위치에서|지금\s*위치에서|ここから|从这里|從這裡|내\s*(?:주변|근처|위치)|여기\s*(?:근처|주변)|지금\s*(?:있는\s*곳|위치)|현\s*위치|현재\s*위치|この(?:近く|辺)|ここ(?:の近く|から近い)|今いる(?:場所|ところ)|現在地|我(?:的)?附近|这附近|這附近|我(?:的)?位置|我现在|我現在/i;

/**
 * Sentences that open with "nearby" and name nowhere — 근처 약국, 近くのコンビニ,
 * 附近的药店. A place name in front ("명동 근처") is somewhere else, so only
 * the start of the sentence counts.
 */
const NEARBY_OPENING = /^\s*(?:근처|주변|近くの|附近的?|周边的?|周邊的?)/i;

/** "the nearest pharmacy", with no "to Myeongdong" after it. */
const SUPERLATIVE = /\b(?:nearest|closest)\b/i;
const NAMES_A_PLACE = /\b(?:to|in|near|around|at|from)\s+(?!me\b|here\b|my\b)[\p{Lu}\p{Script=Hangul}\p{Script=Han}\p{Script=Katakana}]/u;

/** "From here" — a route whose start is wherever they are. */
const FROM_HERE =
  /\bfrom (?:here|my (?:location|hotel|place))\b|여기서|현재\s*위치에서|지금\s*위치에서|ここから|从这里|從這裡/i;

/**
 * A route that starts wherever they are.
 *
 * Separate from asksNearMe because here a named place does not answer the
 * question: in "여기서 명동 어떻게 가요", Myeongdong is where they are going,
 * and "여기서" is the start that is still missing.
 */
export function asksFromHere(text: string): boolean {
  return FROM_HERE.test(text ?? "");
}

/** Is this a question about wherever the traveller is standing? */
export function asksNearMe(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (NEAR_ME_PHRASE.test(t) || NEARBY_OPENING.test(t)) return true;
  return SUPERLATIVE.test(t) && !NAMES_A_PLACE.test(t);
}

/**
 * The question, with where they are said out loud.
 *
 * Appended rather than substituted, so the traveller's own words stay intact —
 * the router reads "near me" and the place together, the same way it would read
 * a person who had typed both.
 */
const WITH_PLACE: Record<Lang, string> = {
  en: "{text} (I'm near {place})",
  ko: "{text} ({place} 근처예요)",
  ja: "{text}（今{place}の近くです）",
  zh: "{text}（我在{place}附近）",
};

export function withPlace(text: string, place: string, lang: Lang): string {
  return WITH_PLACE[lang].replace("{text}", text.trim()).replace("{place}", place);
}

/** The same, as a template the phone fills in once it knows — see Chip.locate. */
export function withPlaceTemplate(text: string, lang: Lang): string {
  return WITH_PLACE[lang].replace("{text}", text.trim());
}

/** The shapes withPlace writes, read back. */
const PLACE_SAID = [
  /\(I'm near ([^)]+)\)\s*$/i,
  /\(([^)]+?) 근처예요\)\s*$/,
  /（今(.+?)の近くです）\s*$/,
  /（我在(.+?)附近）\s*$/,
];

/**
 * The place the phone attached, if it did.
 *
 * Read from the shape of the sentence rather than looked up: most of the 653
 * stations the phone can name are not in the server's landmark table, so
 * "Mangwon Station" would otherwise look like no place at all, and a question
 * the phone had already answered would be asked again.
 */
export function placeSaid(text: string): string | undefined {
  for (const re of PLACE_SAID) {
    const m = re.exec(text ?? "");
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}
