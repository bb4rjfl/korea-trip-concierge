/**
 * Ranking ground truth: sentences a visitor types, and the document that
 * answers each one.
 *
 * Why this is separate from the conversation harness
 * --------------------------------------------------
 * `scripts/eval.ts` scores whole answers with a judge, which is the right way
 * to ask "was that a good reply" and the wrong way to ask "did retrieval put
 * the right document first". Twenty conversational turns, live public APIs and
 * a stochastic judge move several points between identical runs — enough to
 * hide a real ranking change completely, and enough to invent one. Measuring a
 * reranker there would be measuring noise.
 *
 * So this measures the one thing a reranker can change: position. Same corpus,
 * same query, deterministic scoring, and the only difference between the two
 * runs is whether reranking is on. `npm run eval:rank`.
 *
 * How ground truth was written
 * ----------------------------
 * Each `answers` entry is a document title, matched case-insensitively as a
 * substring, and several are listed where several genuinely answer — a night
 * view is Seoul Sky or Namsan, and picking one would score the other as wrong.
 * The questions came first and the labels came from what actually answers them,
 * not from what retrieval happened to return; a question our corpus cannot
 * answer at all belongs in the gaps list at the bottom, not here, because
 * scoring it would measure the corpus rather than the ranking.
 */

export interface RankCase {
  /** What someone types. */
  q: string;
  /** Titles that would be a correct first result. Substring, case-insensitive. */
  answers: string[];
  /** Restrict the search the way the calling site does, where it does. */
  kinds?: ("spot" | "landmark" | "area" | "dish" | "service" | "payment" | "card")[];
  /** Why this one is here, when it is not obvious. */
  note?: string;
  /** What language this is typed in. English unless said otherwise. */
  lang?: "en" | "ko" | "ja" | "zh";
}

export const RANK_CASES: RankCase[] = [
  /* --- getting past a Korean system: the guides --- */
  { q: "can I bring my dog into a cafe", answers: ["Travelling with a pet"] },
  {
    q: "my phone died and I have no cash, how do I get to my hotel",
    answers: ["Stranded"],
    note: "the shape the model routes to the route planner and the corpus has to win",
  },
  { q: "how do I order food delivery without a Korean phone number", answers: ["Food delivery"] },
  { q: "how do I get a T-money card", answers: ["Public transit"] },
  { q: "my card keeps getting declined at the convenience store", answers: ["Convenience store"] },
  { q: "how does tipping work here", answers: ["Tipping"] },
  {
    q: "I need a pharmacy open late at night",
    answers: ["Emergency & medical help"],
    note: "three sightseeing spots outrank the guide that answers it",
  },
  { q: "the restaurant only has a Korean touchscreen and I cannot order", answers: ["kiosk"] },
  { q: "I lost my wallet on the subway", answers: ["Lost or stolen"] },
  { q: "can I claim the tax back on what I bought", answers: ["tax refund", "VAT"] },
  { q: "I need to book a restaurant table but every app wants a Korean number", answers: ["Booking a table"] },
  { q: "how do I buy tickets for a concert as a foreigner", answers: ["Concert & event tickets"] },
  { q: "is there a way to send money home from here", answers: ["Banking & money transfers"] },
  { q: "I want to buy a prepaid SIM at the airport", answers: ["SIM"] },
  { q: "how do I call a taxi without speaking Korean", answers: ["Taxi apps"] },

  /* --- places, where the question names a quality rather than a place --- */
  {
    q: "somewhere with a night view",
    answers: ["Seoul Sky", "N Seoul Tower", "Gwangalli", "Banpo Bridge"],
  },
  { q: "where do people go to see the sunrise", answers: ["Seongsan Ilchulbong"] },
  {
    q: "somewhere I can wear a hanbok and take photos",
    answers: ["Gyeongbokgung", "Bukchon Hanok Village", "Namsangol Hanok Village"],
  },
  {
    q: "a quiet gallery, not a museum",
    answers: ["Gallery Hyundai", "Kukje Gallery", "Songeun Art Space"],
    note: "the word museum pulls museums up; the question rules them out",
  },
  { q: "I want to see a traditional wedding or ceremony", answers: ["Hanok Village"] },
  {
    q: "I'm vegan and my friend eats only halal, where can we eat together",
    answers: ["Itaewon"],
    note: "names no neighbourhood and has exactly one answer",
  },
  {
    q: "I have four hours before my flight from Incheon",
    answers: ["Getting around Incheon", "Incheon"],
  },
  // Named, not "Temple": every temple in the corpus has Temple in its title,
  // so the loose label scored a seaside landmark as a correct answer to a
  // question about staying overnight. These two run templestay.
  { q: "a temple I can stay overnight in", answers: ["Bongeunsa", "Jogyesa"] },
  { q: "an old street with hanok houses and tea", answers: ["Bukchon", "Insadong", "Samcheong"] },
  { q: "a beach within reach of Busan", answers: ["Haeundae", "Gwangalli", "Songjeong"] },
  { q: "a mountain I can climb with a cable car", answers: ["Namsan", "Seoraksan", "N Seoul Tower"] },

  /* --- food --- */
  // Dish titles are the English name, not the romanised Korean one — labelling
  // these "Naengmyeon" and "Jeyuk" scored two correct answers as misses and
  // was measuring the labels rather than the ranking.
  {
    q: "a cold noodle dish for a hot day",
    answers: ["Cold soy-milk noodles", "Cold buckwheat noodles", "Busan cold wheat noodles", "Chilled buckwheat"],
    kinds: ["dish"],
  },
  { q: "something spicy with pork", answers: ["Spicy stir-fried pork", "Pork-bone stew"], kinds: ["dish"] },
  { q: "a soup that is supposed to cure a hangover", answers: ["Hangover soup"], kinds: ["dish"] },

  /* --- situation cards --- */
  { q: "it has been raining for a week, what do people do", answers: ["Monsoon"] },
  { q: "how cold does it get in January", answers: ["winter"] },
  { q: "how do I get around Jeju without driving", answers: ["Getting around Jeju"] },
];

/**
 * Questions a traveller would reasonably ask that our corpus cannot answer.
 *
 * Not scored — a reranker cannot promote a document that does not exist, and
 * counting these would turn a ranking measurement into a content measurement.
 * They are recorded because they are the honest next thing to fix:
 *
 *   "is there anywhere I can leave my suitcase for a few hours"  → no luggage-storage document
 *   "where can I try making kimchi"                              → dishes, no cooking-class document
 *   "I want to buy skincare that is not tested on animals"       → no cruelty-free shopping document
 *   "I want to watch a baseball game"                            → ticketing only, no stadium document
 */
export const KNOWN_GAPS = [
  "is there anywhere I can leave my suitcase for a few hours",
  "where can I try making kimchi",
  "I want to buy skincare that is not tested on animals",
  "I want to watch a baseball game",
];

/**
 * Questions that have no single right answer, and so cannot be scored here.
 *
 * "What can I eat if I cannot have peanuts" is answered correctly by most of
 * the corpus, which makes any label arbitrary: it is a question about the
 * allergen filter, not about which document ranks first. Scoring it would have
 * added a number that moved for reasons unrelated to ranking.
 */
export const NOT_A_RANKING_QUESTION = ["what can I eat if I cannot have peanuts"];
