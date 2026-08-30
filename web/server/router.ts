/**
 * Rule-based intent router — the deterministic fallback (and chip-echo handler)
 * behind the optional LLM layer. Maps free text in en/ja/zh/ko to one of the 13
 * tools + args. Slot values are passed RAW: the tools already fuzzy-match areas,
 * stations, dishes, cities (src/lib/fuzzy.ts et al.) and answer gracefully with
 * did-you-mean when a value is off — the router's job is routing, not resolving.
 *
 * Ordering matters: earlier rules are more specific. Chip texts (footer.ts) are
 * our own phrasings, so the patterns below are tuned to always catch them.
 */

export type Lang = "en" | "ja" | "zh" | "ko";

export interface RouteHit {
  tool: string;
  args: Record<string, unknown>;
}

/** Script-based language detection; null = no strong signal (latin). */
export function detectLang(text: string): Lang | null {
  if (/[가-힯]/.test(text)) return "ko";
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[一-鿿]/.test(text)) return "zh";
  return null;
}

/* ---------------------------------- cities ---------------------------------- */

const CITY_NAMES: Record<string, string[]> = {
  Seoul: ["seoul", "서울", "ソウル", "首尔", "首爾", "汉城"],
  Busan: ["busan", "pusan", "부산", "釜山", "プサン"],
  Jeju: ["jeju", "제주", "済州", "济州", "濟州", "チェジュ"],
  Incheon: ["incheon", "인천", "仁川", "インチョン"],
  Daegu: ["daegu", "대구", "大邱"],
  Daejeon: ["daejeon", "대전", "大田"],
  Gwangju: ["gwangju", "광주", "光州"],
  Gyeongju: ["gyeongju", "경주", "慶州", "庆州", "キョンジュ"],
  Suwon: ["suwon", "수원", "水原"],
  Jeonju: ["jeonju", "전주", "全州"],
  Gangneung: ["gangneung", "강릉", "江陵"],
  Sokcho: ["sokcho", "속초", "束草"],
  Yeosu: ["yeosu", "여수", "麗水", "丽水"],
  Ulsan: ["ulsan", "울산", "蔚山"],
  Chuncheon: ["chuncheon", "춘천", "春川"],
};

export function findCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [canonical, aliases] of Object.entries(CITY_NAMES)) {
    for (const a of aliases) {
      if (a.length <= 2 && /[a-z]/.test(a)) continue; // avoid latin false hits
      if (lower.includes(a)) return canonical;
    }
  }
  return null;
}

/* ------------------------------ small extractors ----------------------------- */

const TRAILING_PUNCT = /[\s?？!！。.、,，]+$/u;
const clean = (s: string | undefined): string => (s ?? "").replace(TRAILING_PUNCT, "").trim();

/** First match group that is non-empty across a list of regexes. */
function firstMatch(text: string, patterns: RegExp[], group = 1): string | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) {
      const g = clean(m[group]);
      if (g) return g;
    }
  }
  return null;
}

/** from → to extraction across the 4 languages. */
export function extractFromTo(text: string): { from?: string; to?: string } | null {
  let m =
    /from\s+(.+?)\s+to\s+(.+?)(?:\?|$)/i.exec(text) ??
    /(?:how (?:do|can) i get|how to get|best way|way)\s+to\s+(.+?)\s+from\s+(.+?)(?:\?|$)/i.exec(text);
  if (m) {
    // second pattern is to..from — swap
    const swapped = /how|way/i.test(m[0]) && /\sto\s.+\sfrom\s/i.test(m[0]);
    return swapped ? { from: clean(m[2]), to: clean(m[1]) } : { from: clean(m[1]), to: clean(m[2]) };
  }
  m = /(.+?)(?:에서|서부터|부터)\s*(.+?)(?:까지|으로|로)?\s*(?:가는|갈|어떻게|경로|길|가)/.exec(text);
  if (m) return { from: clean(m[1]), to: clean(m[2]) };
  m = /(.+?)から(.+?)(?:まで|へ|に)/.exec(text);
  if (m) return { from: clean(m[1]), to: clean(m[2]) };
  m = /从(.+?)到(.+?)(?:怎么|要|的|$)/.exec(text);
  if (m) return { from: clean(m[1]), to: clean(m[2]) };
  // one-sided: "how do I get to X?" / "X 가는 법" / "X까지 가는" / "X への行き方" / "怎么去X"
  const to = firstMatch(text, [
    /(?:how (?:do|can) i get|how to get|best way|fastest way|way|directions?|route)\s+to\s+(.+?)(?:\?|$)/i,
    /(.+?)(?:까지|로|으로)?\s*가는\s*(?:법|길|방법)/,
    /(.+?)(?:へ|に)の?行き方/,
    /怎么去(.+?)(?:\?|？|$)/,
    /(.+?)怎么去/,
  ]);
  if (to) return { to };
  return null;
}

/* --------------------------------- intents ---------------------------------- */

type Rule = (text: string, lang: Lang) => RouteHit | null;

const reBusWord = /\b(?:bus(?:es)?)\b|버스|バス|公交|公車|巴士/i;
const reBusNumber =
  /(?:bus|버스|バス|公交|公車|巴士)\s*#?\s*(\d{1,4}(?:-\d+)?[a-zA-Z]?)|#?\b(\d{1,4}(?:-\d+)?)\s*(?:번(?:\s*버스)?|番(?:バス)?|路|号线?公交)/iu;

const ruleBus: Rule = (text) => {
  if (!reBusWord.test(text) && !/\d+\s*번/.test(text)) return null;
  const m = reBusNumber.exec(text);
  const busNumber = m ? (m[1] ?? m[2]) : null;
  if (!busNumber) return null; // "bus" without a route number → let other rules / search handle
  const city = findCity(text) ?? "Seoul";
  const stop = firstMatch(text, [
    /\b(?:at|near|to)\s+(?!the\b)(.+?)(?:\s+(?:station|stop|정류장))?\s*(?:\?|$)/i,
    /버스\s*(?:타고\s*)?(.+?)\s*(?:도착|언제|몇\s*분|와|옴|오나)/,
    /(.+?)\s*정류장/,
    /で?(.+?)(?:駅|バス停)に/,
    /到(.+?)站/,
  ]);
  const args: Record<string, unknown> = { busNumber, city };
  if (stop && !reBusWord.test(stop)) args.dropOffStop = stop;
  return { tool: "trackBusArrival", args };
};

const reSubway = /subway|metro|\btrain\b|지하철|전철|호선|막차|첫차|地下鉄|終電|地铁|末班车|전동차|\bline\s*\d|환승/i;

const ruleSubway: Rule = (text) => {
  if (!reSubway.test(text)) return null;
  const args: Record<string, unknown> = {};
  const line = firstMatch(text, [/\bline\s*([0-9]+|[a-z가-힣]+)\b/i, /([0-9]+|[가-힣]+)\s*호선/, /([0-9]+)号线/]);
  if (line) args.line = line;
  const pair = extractFromTo(text);
  if (pair?.from) args.station = pair.from;
  if (pair?.to) args.to = pair.to;
  if (!args.station) {
    const st = firstMatch(text, [
      /\b(?:at|from|near)\s+(.+?)(?:\s+station)?\s*(?:\?|$)/i,
      /(.+?)\s*역(?:에서|의|은|는)?\s/,
      /(.+?)역/,
      /(.+?)駅/,
      /(.+?)站/,
    ]);
    if (st && !reSubway.test(st)) args.station = st;
  }
  return { tool: "trackSubwayArrival", args };
};

const reRouteWord =
  /how (?:do|can) i get|how to get|get to|way to|directions?|route|itinerary from|가는 법|가는 길|어떻게 가|경로|길찾기|行き方|乗り換え|怎么去|路线|路線/i;

const ruleRoute: Rule = (text) => {
  const pair = extractFromTo(text);
  if (!pair) return null;
  if (!reRouteWord.test(text) && !(pair.from && pair.to)) return null;
  const args: Record<string, unknown> = {};
  if (pair.from) args.from = pair.from;
  if (pair.to) args.to = pair.to;
  return { tool: "getTransitRoute", args };
};

const reWeather = /weather|air quality|fine ?dust|pm2\.?5|rain(?:ing|y)?|umbrella|typhoon|heat ?wave|forecast|날씨|미세먼지|비\s*(?:와|오|올)|우산|폭염|한파|태풍|天気|雨|空気|天气|下雨|空气|雾霾|气温/i;

const ruleWeather: Rule = (text) => {
  if (!reWeather.test(text)) return null;
  const args: Record<string, unknown> = {};
  const city = findCity(text);
  if (city) args.city = city;
  return { tool: "getWeatherAndAir", args };
};

const reNowOpen =
  /is\s+(.+?)\s+(?:open|closed|crowded|worth going)|open (?:now|today|right now)|opening hours|business hours|(.+?)\s*(?:지금|오늘)\s*(?:영업|문\s*열|열|여|가도|갈 만|붐비)|営業(?:中|時間)|今.*開いて|现在开(?:门|着)|营业时间|(?:지금|오늘)\s*(?:열|영업)/i;

const ruleNowInfo: Rule = (text, lang) => {
  const m = reNowOpen.exec(text);
  if (!m) return null;
  let place = clean(m[1] ?? m[2]);
  if (!place) {
    place =
      firstMatch(text, [
        /(?:opening|business) hours (?:of|for|at)\s+(.+?)(?:\?|$)/i,
        /(.+?)(?:의)?\s*(?:영업\s*시간|영업시간)/,
        /(.+?)の営業時間/,
        /(.+?)(?:的)?营业时间/,
        /(.+?)(?:은|는|이|가)\s*(?:지금|오늘)/,
        /(.+?)は今/,
        /(.+?)现在/,
      ]) ?? "";
  }
  if (!place) return null;
  return { tool: "getNowInfo", args: { place, language: lang } };
};

const reMenu =
  /menu|vegetarian|vegan|halal|allerg|gluten|what(?:'s| is) (?:in )?(this|that)? ?dish|메뉴|채식|비건|할랄|알레르기|알러지|글루텐|먹어도 되|재료|들어가|ベジタリアン|ヴィーガン|ハラール?|アレルギー|メニュー|素食|清真|过敏|菜单|成分/i;

const ALLERGEN_WORDS: Record<string, string[]> = {
  peanut: ["peanut", "땅콩", "ピーナッツ", "花生"],
  shellfish: ["shellfish", "shrimp", "crab", "조개", "새우", "게", "甲殻類", "エビ", "贝", "虾"],
  gluten: ["gluten", "wheat", "글루텐", "밀가루", "グルテン", "麸质", "小麦"],
  egg: ["egg", "계란", "달걀", "卵", "鸡蛋"],
  dairy: ["dairy", "milk", "cheese", "유제품", "우유", "乳", "牛奶", "奶"],
  nuts: ["nut", "견과", "ナッツ", "坚果"],
  pork: ["pork", "돼지", "豚", "猪肉"],
  fish: ["fish", "생선", "魚", "鱼"],
};

const ruleMenu: Rule = (text) => {
  if (!reMenu.test(text)) return null;
  const quoted = firstMatch(text, [/["'“”‘’「」『』](.+?)["'“”‘’「」『』]/u]);
  const menuText = quoted ?? text;
  const allergyConcerns = Object.entries(ALLERGEN_WORDS)
    .filter(([, words]) => words.some((w) => text.toLowerCase().includes(w)))
    .map(([canon]) => canon);
  const args: Record<string, unknown> = { menuText };
  if (allergyConcerns.length) args.allergyConcerns = allergyConcerns;
  return { tool: "translateMenuContext", args };
};

const rePayment =
  /card (?:was |got )?(?:declined|rejected|refused)|declined|t-?money|payment|pay(?:ing)? (?:with|by|for)|cash only|foreign card|credit card|카드.*(?:거절|안 ?되|안 ?돼|막혀)|결제|티머니|현금|계산|支払い?|決済|カード.*(?:使え|拒否)|刷卡|支付|付款|银联|信用卡/i;

const ruleAtmSpecific = /\batm\b|현금인출|현금 인출|출금|ATM|お金.*おろ|取钱|取款/i;

const rulePayment: Rule = (text, lang) => {
  if (!rePayment.test(text)) return null;
  if (ruleAtmSpecific.test(text)) return null; // ATM 위치 니즈는 store 룰로
  const args: Record<string, unknown> = { situation: text };
  const card = firstMatch(text, [/\b(visa|master(?:card)?|amex|american express|unionpay|jcb|discover)\b/i]);
  if (card) args.cardType = card;
  void lang;
  return { tool: "explainPayment", args };
};

const KOREAN_SERVICE_KEYWORDS: [RegExp, string][] = [
  [/taxi|kakao\s*t|택시|タクシー|出租车|打车/i, "taxi app"],
  [/deliver|배달|출前|出前|デリバリー|外卖/i, "food delivery"],
  [/reservation|reserve|booking|book a|예약|予約|预约|订位/i, "restaurant reservation"],
  [/sign\s?-?up|register|verification|본인인증|인증|가입|認証|登録|实名|注册/i, "sign-up / identity verification"],
  [/e?-?sim|유심|심카드|シム|Sim卡|电话卡/i, "eSIM / SIM card"],
  [/tax refund|세금 환급|택스 리펀|免税|税金還付|退税/i, "tax refund"],
  [/k-?eta|arrival card|입국 (?:카드|신고)|入国|入境卡/i, "K-ETA / arrival card"],
  [/emergency|hospital|pharmacy emergency|응급|병원|救急|急诊|医院/i, "medical emergency"],
  [/kiosk|키오스크|券売機|自助点餐|自助机/i, "kiosk"],
  [/ticket(?:ing)?|콘서트 티켓|티켓팅|チケット|抢票|购票/i, "ticketing"],
  [/bank|remit|transfer money|송금|은행 계좌|口座|汇款|银行/i, "banking / remittance"],
  [/temple ?stay|템플스테이/i, "temple stay"],
];

const ruleKoreanService: Rule = (text) => {
  for (const [re, service] of KOREAN_SERVICE_KEYWORDS) {
    if (re.test(text)) return { tool: "explainKoreanService", args: { service, detail: text } };
  }
  return null;
};

const STORE_NEEDS: [RegExp, string][] = [
  [/currency exchange|exchange (?:money|rate)|money change|환전|両替|换钱|换汇/i, "currencyExchange"],
  [/\batm\b|cash machine|withdraw|현금인출|출금|ATM|お金をおろ|取款|取钱/i, "atm"],
  [/pharmac|drug ?store|약국|薬局|药店|药房/i, "pharmacy"],
  [/convenience|편의점|コンビニ|便利店/i, "convenience"],
  [/tourist (?:info|information)|관광안내|観光案内|游客中心|旅游咨询/i, "touristInfo"],
  [/foreign card (?:dining|restaurant)|해외카드.*(?:식당|되는)/i, "foreignCardDining"],
];

const ruleStore: Rule = (text) => {
  for (const [re, need] of STORE_NEEDS) {
    if (re.test(text)) {
      const args: Record<string, unknown> = { need };
      const area = firstMatch(text, [
        /\b(?:in|near|around|at)\s+(.+?)(?:\?|$)/i,
        /(.+?)(?:에서|근처|주변|역 근처)/,
        /(.+?)(?:の近く|周辺|あたり)/,
        /(.+?)(?:附近|周边)/,
      ]);
      if (area) args.area = area;
      return { tool: "findForeignerFriendlyStore", args };
    }
  }
  return null;
};

const reCourse =
  /itinerar|course|trip plan|plan (?:my|a|the)? ?(?:trip|day)|day plan|schedule for|(?:여행)?\s*코스|일정\s*(?:짜|추천|만들)|당일치기 코스|旅程|プラン|コース(?:を|推薦)?|行程|路线规划/i;

const DURATION_WORDS: [RegExp, string][] = [
  [/half[- ]?day|반나절|半日|半天/i, "half-day"],
  [/\b1[- ]?day|one[- ]?day|하루|당일|1日|一日|一天|日帰り/i, "1-day"],
  [/\b2[- ]?days?|two[- ]?days?|1박\s*2일|이틀|2日間?|两天|二日/i, "2-day"],
  [/\b3[- ]?days?|three[- ]?days?|2박\s*3일|사흘|3日間?|三天|三日/i, "3-day"],
];

const PERSONA_WORDS: [RegExp, string][] = [
  [/couple|커플|연인|カップル|情侣/i, "couple"],
  [/famil|가족|아이|kids?|家族|子連れ|家庭|亲子/i, "family"],
  [/k-?pop|케이팝|アイドル|追星/i, "K-pop fan"],
  [/food(?:ie)?|맛집|먹방|グルメ|美食/i, "foodie"],
  [/histor|역사|歴史|历史/i, "history lover"],
  [/20s woman|20대 여성|20代女性/i, "20s woman"],
  [/solo|혼자|나홀로|一人|独自/i, "solo"],
  [/first[- ]?tim|처음|初めて|第一次/i, "first-timer"],
];

const ruleCourse: Rule = (text) => {
  if (!reCourse.test(text)) return null;
  const args: Record<string, unknown> = {};
  for (const [re, v] of DURATION_WORDS) if (re.test(text)) { args.duration = v; break; }
  const personas = PERSONA_WORDS.filter(([re]) => re.test(text)).map(([, v]) => v);
  if (personas.length) args.persona = personas.join(", ");
  const city = findCity(text);
  if (city) args.location = city;
  return { tool: "recommendTripCourse", args };
};

const reJejuInfo = /jeju|제주|済州|济州|濟州/i;

const ruleJeju: Rule = (text) => {
  if (!reJejuInfo.test(text)) return null;
  const category = firstMatch(text, [
    /(beach|hike|hiking|oreum|waterfall|museum|cafe|food|restaurant|attraction|festival|market)/i,
    /(해변|바다|오름|한라산|폭포|박물관|카페|맛집|음식|관광지|축제|시장)/,
    /(ビーチ|海|カフェ|グルメ|観光|祭り)/,
    /(海滩|咖啡|美食|景点|节日)/,
  ]);
  const args: Record<string, unknown> = {};
  if (category) args.category = category;
  return { tool: "getJejuInfo", args };
};

const reAreaGuide =
  /(?:tell me about|about|what to do (?:in|around)|things to do (?:in|around)|guide (?:to|for)|explore)\s+(.+?)(?:\?|$)|(.+?)\s*(?:동네|지역)?\s*(?:가이드|어때|뭐 ?하|볼거리|놀거리)|(.+?)(?:はどんな(?:場所|所)|で何が|ガイド)|(.+?)(?:怎么样|攻略|有什么好)/i;

const AREA_INTERESTS: [RegExp, string][] = [
  [/food|eat|restaurant|맛집|먹|グルメ|美食/i, "food"],
  [/night|bar|club|술|밤|ナイト|夜生活|酒吧/i, "nightlife"],
  [/shop|쇼핑|買い物|购物/i, "shopping"],
  [/cafe|카페|カフェ|咖啡/i, "cafe"],
  [/culture|museum|문화|박물관|文化|博物館/i, "culture"],
];

const ruleAreaGuide: Rule = (text) => {
  const m = reAreaGuide.exec(text);
  if (!m) return null;
  const area = clean(m[1] ?? m[2] ?? m[3] ?? m[4]);
  if (!area || area.length > 40) return null;
  const args: Record<string, unknown> = { area };
  for (const [re, v] of AREA_INTERESTS) if (re.test(text)) { args.interest = v; break; }
  return { tool: "getAreaGuide", args };
};

const rePlaceSearch =
  /find|where (?:can|do|is|are)|what'?s near|nearby|recommend|suggest|looking for|any good|best|cafe|coffee|restaurant|food|eat|bar|museum|palace|park|market|shopping|hotel|맛집|카페|식당|추천|어디|찾|박물관|궁|시장|쇼핑|먹을|먹으면|먹을까|음식|밥집|맛있|근처|주변|カフェ|レストラン|おすすめ|どこ|美術館|食べ|グルメ|近く|咖啡|餐厅|推荐|哪里|博物馆|好吃|吃什么|附近/i;

const rulePlaceSearch: Rule = (text, lang) => {
  if (!rePlaceSearch.test(text)) return null;
  const args: Record<string, unknown> = { query: text, language: lang };
  const area = firstMatch(text, [
    /\b(?:in|near|around|at)\s+(.+?)(?:\?|$)/i,
    /(.+?)(?:에서|근처|주변)/,
    /(.+?)(?:の近く|周辺|辺り)/,
    /(.+?)(?:附近|周边)/,
  ]);
  if (area) args.area = area;
  return { tool: "searchPlaceForeigner", args };
};

/**
 * Intents the LLM was observed to misroute in QA, where the wrong answer is
 * actively harmful: "when is the last train" came back as *next* arrivals (once
 * listing trains that had already departed), and a lost passport or stolen
 * wallet came back as a list of emergency rooms. These are decided before the
 * model gets a say.
 */
const LAST_TRAIN =
  /last\s*(?:train|subway|metro)|final\s*(?:train|subway|metro)|(?:subway|metro|trains?)\s+(?:stop|close|finish|end)\s*(?:running)?|what time (?:does|do) the (?:subway|metro|trains?)|막차|끝차|終電|最終電車|末班车|末班車/i;
const LOST_STOLEN =
  /(?:lost|stole|stolen|theft|pickpocket)\b|left (?:my|it|the) [a-z]+ (?:on|in)\b|분실|잃어버|도난|소매치기|置き忘|なくし|盗まれ|丢了|丢失|被偷/i;

// Any medical need — not just the life-threatening wording the banner catches.
// QA found 'chest pain and dizzy', 'sharp abdominal pain and a fever', 'I think
// I broke my ankle' and 'high fever' all answered with a menu of ATMs and
// currency exchange, with no emergency number anywhere.
const MEDICAL_NEED =
  /(?:chest|stomach|abdomen|abdominal|head|back|tooth)\s*(?:pain|ache|hurts?)|(?:pain|hurts?|hurting|injur|broke(?:n)?\s+(?:my|his|her|a)|sprain|fracture|bleed|fever|vomit|nausea|dizzy|faint|allergic reaction|asthma|infection)|(?:see|need|find)\s+(?:a\s+)?(?:doctor|hospital|emergency room|er|clinic|dentist)|not breathing|can\'?t breathe|trouble breathing|unconscious|unresponsive|collapsed|seizure|choking|ambulance|응급|아파요|아픈데|아프고|다쳤|열이\s*나|숨(?:이|을)?\s*(?:안|못)|토하|어지러|골절|출혈|痛い|熱が|怪我|救急|病院|疼|发烧|受伤|急诊|医院/i;

// A personal-safety threat needs the POLICE first, not an ambulance.
const SAFETY_THREAT =
  /(?:following me|followed me|threaten|attack|assault|harass|mugg|robbed|unsafe|in danger|help me)\b|쫓아와|따라와|위협|폭행|성추행|위험해|살려|追いかけ|襲われ|跟踪我|抢劫|被打/i;

// Words that name a body part or a symptom — never a neighbourhood.
const BODY_OR_SYMPTOM =
  /\b(?:my|his|her|the|a|an)\b|abdomen|abdominal|chest|stomach|head|back|leg|arm|ankle|knee|throat|tooth|eye|ear|pain|fever|blood|breath|side|body|가슴|배|머리|다리|팔|목|이빨/i;

export function criticalRoute(text: string): RouteHit | null {
  const t = text ?? "";
  if (LAST_TRAIN.test(t)) {
    const station = firstMatch(t, [
      /(?:from|at)\s+(.+?)(?:\s+station)?\s*(?:\?|$)/i,
      /(.+?)\s*역(?:에서|의|은|는)?/,
    ]);
    return { tool: "trackSubwayArrival", args: { station: station ?? "", to: "last train" } };
  }
  if (LOST_STOLEN.test(t)) {
    return { tool: "explainKoreanService", args: { service: t.slice(0, 200) } };
  }
  // Medical need or a safety threat → the emergency card, which leads with the
  // hotlines. Checked after lost-property so "I lost my wallet" is not medical.
  if (MEDICAL_NEED.test(t) || SAFETY_THREAT.test(t)) {
    const raw = firstMatch(t, [/\b(?:in|near|around|at)\s+([A-Za-z가-힣 ]{2,20})/i]);
    // "sharp pain in my lower right abdomen" must not be read as a neighbourhood.
    const area = raw && !BODY_OR_SYMPTOM.test(raw) ? raw : undefined;
    return { tool: "findForeignerFriendlyStore", args: { need: "emergency", ...(area ? { area } : {}) } };
  }
  return null;
}
/** Ordered rule chain — first hit wins. */
const RULES: Rule[] = [
  ruleBus,
  ruleSubway,
  ruleRoute,
  ruleWeather,
  ruleNowInfo,
  ruleMenu,
  rulePayment,
  ruleKoreanService,
  ruleStore,
  ruleCourse,
  ruleJeju,
  ruleAreaGuide,
  rulePlaceSearch,
];

export function routeText(text: string, lang: Lang): RouteHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const rule of RULES) {
    const hit = rule(trimmed, lang);
    if (hit) return hit;
  }
  return null;
}
