/**
 * Which tool should answer this? Ground truth for the router.
 *
 * Why this is measured separately
 * -------------------------------
 * The guidance on tool design is blunt about the failure mode: if a person
 * cannot say for certain which tool applies to a request, neither can a model,
 * and a bloated or overlapping toolkit produces misrouting rather than errors.
 * We already knew we had this. `GENERIC_TOOLS` in the orchestrator exists
 * entirely to work around it — the model sends anything place-shaped to place
 * search and anything with a destination to the route planner, so a question
 * about being stranded with a dead phone became a routing request. We built an
 * arbitration step to overrule it and never measured whether the router itself
 * got better or worse.
 *
 * That is the gap this closes. The conversational harness scores answers, which
 * conflates "picked the wrong tool" with "picked the right tool and answered
 * thinly"; and its judge cannot see which tool ran. Routing is a single
 * discrete choice with a right answer, so it should be counted, not judged.
 *
 * How to read a failure here
 * --------------------------
 * A miss is not automatically a router bug. It is one of three things, and the
 * fix differs: the tool's description does not say what it is for; two tools
 * genuinely overlap and should be merged or renamed; or the question is
 * ambiguous and any of several tools would serve. The third kind is listed with
 * more than one acceptable tool rather than pretending there is one answer.
 */

export interface RouteCase {
  /** What the traveller types. */
  q: string;
  /** Any of these tools is a correct choice. */
  tools: string[];
  /** Language it is typed in. */
  lang?: "en" | "ko" | "ja" | "zh";
  /** Why this one is here, when the answer is not obvious. */
  note?: string;
}

export const ROUTE_CASES: RouteCase[] = [
  /* --- the shapes a catch-all tool swallows: the reason arbitration exists --- */
  {
    q: "my phone died and I have no cash, how do I get to my hotel",
    tools: ["explainKoreanService"],
    note: "has a destination in it, so the route planner claims it; it is not a routing question",
  },
  {
    q: "can I bring my dog into a cafe",
    tools: ["explainKoreanService"],
    note: "place-shaped, so place search claims it; it is a permission question",
  },
  {
    q: "the restaurant only has a Korean touchscreen and I cannot order",
    tools: ["explainKoreanService"],
  },
  { q: "I lost my wallet on the subway", tools: ["explainKoreanService"] },
  { q: "how do I call a taxi without speaking Korean", tools: ["explainKoreanService"] },
  { q: "every booking app wants a Korean phone number", tools: ["explainKoreanService"] },

  /* --- payment, which the model does route well; guards against regressing it --- */
  { q: "my card was declined at a restaurant, what now", tools: ["explainPayment"] },
  { q: "can I pay with my foreign card on the bus", tools: ["explainPayment"] },
  // Tipping used to be caught by the etiquette matcher and answered with a card
  // about bowing. It is a money question, so it belongs to the payment tool —
  // in every language, which is why all four are here rather than just English.
  { q: "how does tipping work here", tools: ["explainPayment"] },
  { lang: "ko", q: "한국에서 팁 줘야 하나요", tools: ["explainPayment"] },
  { lang: "ja", q: "韓国ではチップは必要ですか", tools: ["explainPayment"] },
  { lang: "zh", q: "韩国需要给小费吗", tools: ["explainPayment"] },
  // And the behavioural question must still reach the etiquette card.
  { q: "what should I not do at a temple", tools: ["explainKoreanService"] },
  { q: "is it rude to leave food on the plate", tools: ["explainKoreanService"] },
  { q: "where can I withdraw cash with a foreign card", tools: ["explainPayment", "findForeignerFriendlyStore"] },

  /* --- live data: the reason this service exists at all --- */
  { q: "when is the next subway at Hongik University station", tools: ["trackSubwayArrival"] },
  { q: "is bus 143 coming yet at Sinsa station", tools: ["trackBusArrival"] },
  { q: "how do I get from Myeongdong to Gangnam", tools: ["getTransitRoute"] },
  { q: "what's the weather like in Busan today", tools: ["getWeatherAndAir"] },
  { q: "is the fine dust bad right now", tools: ["getWeatherAndAir"] },
  { q: "is Gyeongbokgung open right now", tools: ["getNowInfo"] },

  /* --- places and plans --- */
  { q: "art galleries in Gangnam", tools: ["searchPlaceForeigner"] },
  { q: "plan me a day in Seoul for a couple", tools: ["recommendTripCourse"] },
  { q: "what is Hongdae like", tools: ["getAreaGuide"] },
  { q: "what's in this dish, I can't read the menu", tools: ["translateMenuContext"] },
  { q: "is there a pharmacy near Myeongdong", tools: ["findForeignerFriendlyStore", "explainKoreanService"] },
  // "What should I do in X" is how a traveller asks for ideas. It was matching
  // the etiquette rule's "what should I do" and being answered with manners.
  { q: "what should I do in Jeju", tools: ["getJejuInfo", "recommendTripCourse", "searchPlaceForeigner"] },
  { q: "what should I do in Busan for two days", tools: ["recommendTripCourse", "searchPlaceForeigner", "getAreaGuide"] },

  /* --- the same intents, in the other three languages --- */
  { lang: "ko", q: "명동에서 강남 어떻게 가요", tools: ["getTransitRoute"] },
  { lang: "ko", q: "홍대입구역 다음 지하철 언제 와요", tools: ["trackSubwayArrival"] },
  { lang: "ko", q: "카드가 안 되는데 어떻게 해요", tools: ["explainPayment"] },
  { lang: "ko", q: "오늘 미세먼지 어때요", tools: ["getWeatherAndAir"] },
  { lang: "ja", q: "明洞から江南までどうやって行きますか", tools: ["getTransitRoute"] },
  { lang: "ja", q: "今日のソウルの天気は", tools: ["getWeatherAndAir"] },
  { lang: "ja", q: "カードが使えなかったらどうすれば", tools: ["explainPayment"] },
  { lang: "zh", q: "从明洞到江南怎么走", tools: ["getTransitRoute"] },
  { lang: "zh", q: "今天首尔天气怎么样", tools: ["getWeatherAndAir"] },
  { lang: "zh", q: "刷卡失败了怎么办", tools: ["explainPayment"] },
];
