/**
 * The words on the cards the phone draws itself — in four languages, written
 * here rather than translated by the server, because the server is never shown
 * these cards: they say where the traveller is.
 */

import type { NearbyNeed } from "../../../../src/lib/deviceTask.js";

export type Lang = "en" | "ko" | "ja" | "zh";

export interface DeviceStrings {
  near: Record<NearbyNeed, string>;
  sights: string;
  nearestFirst: string;
  popularFirst: string;
  /** "{m} · about {min} min on foot" */
  walk: string;
  noneNear: string;
  widened: string;
  mapsFallback: string;
  kakaoMap: string;
  naverMap: string;
  googleMaps: string;
  walkThere: string;
  call: string;
  onDevice: string;
  /** Route card. */
  routeHead: string;
  walkHead: string;
  walkBody: string;
  walkToStation: string;
  rideLine: string;
  stop: string;
  stops: string;
  walkFromStation: string;
  summary: string;
  /** When the last leg is a bus or a climb from the station: time and fare to the station. */
  summaryToGateway: string;
  noTransfer: string;
  transfer: string;
  transfers: string;
  fare: string;
  sinbundang: string;
  airport: string;
  liveAt: string;
  subwayClosed: string;
  fromYourSpot: string;
  noStationNear: string;
  cantPlace: string;
  /** Trains card. */
  trainsHead: string;
  boardDown: string;
  toward: string;
  arriving: string;
  atPlatform: string;
  prevStation: string;
  stopsAway: string;
  minutes: string;
  express: string;
  lastTrain: string;
  noStationForTrains: string;
  listingsDown: string;
  noTrainsNow: string;
  /** Pharmacy hours. */
  rx: { open: string; until: string; allDay: string; closedOpens: string; closedLater: string; closed: string; openFirst: string; noneOpen: string; credit: string };
  /** Sights types. */
  kind: { attraction: string; culture: string; leisure: string };
  /** Buttons. */
  chip: {
    about: string;
    walkTo: string;
    openNow: string;
    trainsAt: string;
    routeHere: string;
    paySubway: string;
    food: string;
    pharmacy: string;
    convenience: string;
    sightsNear: string;
  };
  /** Kakao's own category words, for the label under a name. */
  categories: [RegExp, string][];
}

const EN: DeviceStrings = {
  near: {
    pharmacy: "💊 Pharmacies near you",
    atm: "🏧 ATMs near you",
    currencyExchange: "💱 Currency exchange near you",
    convenience: "🏪 Convenience stores near you",
    touristInfo: "ℹ️ Tourist information near you",
    foreignCardDining: "🍽️ Places to eat near you",
    emergency: "🏥 Emergency rooms near you",
    luggage: "🧳 Lockers & luggage storage near you",
    laundry: "🧺 Laundromats near you",
    vegan: "🥗 Vegan & vegetarian near you",
    prayer: "🕌 Mosques & prayer rooms near you",
    post: "📮 Post offices near you",
    food: "🍽️ Places to eat near you",
    cafe: "☕ Cafés near you",
    shopping: "🛍️ Shopping near you",
    stay: "🏨 Places to stay near you",
    toilet: "🚻 Toilets near you",
  },
  sights: "🏛️ Worth seeing near you",
  nearestFirst: "nearest first",
  popularFirst: "most popular within a short walk",
  walk: "🚶 **{m}** · about {min} min on foot",
  noneNear: "Nothing listed within {m} of you.",
  widened: "Nothing within {near}, so this reaches out to {far}.",
  mapsFallback: "Couldn't reach the map directory just now — open this search around you in a map app:",
  kakaoMap: "Kakao Map",
  naverMap: "Naver Map",
  googleMaps: "Google Maps",
  walkThere: "Walk there",
  call: "Call",
  onDevice: "📱 _Worked out on your phone — your location is never sent to us._",
  routeHead: "🚇 **{to}** — from where you are",
  walkHead: "🚶 **Walk to {to}** — **{m}**, about {min} min",
  walkBody: "That's quicker on foot than going down to a platform.",
  walkToStation: "📍 Walk **{m}** (about {min} min) to **{station}** station",
  rideLine: "{icon} **{line}** {from} → {to} _({n} {stops})_",
  stop: "stop",
  stops: "stops",
  walkFromStation: "🚶 From {station}, **{m}** (about {min} min) to {to}",
  summary: "⏱️ about **{min} min** door to door · {transfers} · 💳 around **₩{fare}**",
  summaryToGateway: "⏱️ about **{min} min** to {station} station · {transfers} · 💳 around **₩{fare}**",
  noTransfer: "no transfers",
  transfer: "1 transfer",
  transfers: "{n} transfers",
  fare: "₩{fare}",
  sinbundang: "💡 _The Sinbundang Line adds its own surcharge at the gate._",
  airport: "✈️ _The airport line charges its own fare — about ₩4,000–4,750 on the all-stop train._",
  liveAt: "🟢 **Live at {station} now:** {board}",
  subwayClosed: "⛔ **The subway isn't running right now** (roughly 05:30–24:00). A night bus (N routes) or a taxi — Kakao T takes foreign cards.",
  fromYourSpot: "🧭 Directions from your exact spot:",
  noStationNear: "There's no subway station within a walk of you, so the map apps will do better from here — they include buses:",
  cantPlace: "I couldn't find where **{to}** is on the map. Try its Korean name, or open it in a map app:",
  trainsHead: "🚇 Next trains at **{station}** — {m}, about {min} min on foot",
  boardDown: "The live board isn't answering right now — try again in a minute.",
  toward: "toward {to}",
  arriving: "arriving",
  atPlatform: "at the platform",
  prevStation: "one stop away",
  stopsAway: "{n} stops away",
  minutes: "{n} min",
  express: "express",
  lastTrain: "last train",
  noStationForTrains: "There's no subway station within a walk of you.",
  listingsDown: "Couldn't load the sights list just now — try again in a minute.",
  noTrainsNow: "No trains are reported at this station right now.",
  rx: { open: "🟢 **Open now**", until: "until {t}", allDay: "🟢 **Open 24 hours today**", closedOpens: "🔴 Closed · opens {t}", closedLater: "🔴 Closed · next opens {t} another day", closed: "🔴 Closed", openFirst: "open ones first", noneOpen: "No pharmacy within {m} is open right now. Convenience stores sell basic painkillers and cold medicine around the clock; for anything serious, call **119**.", credit: "_Hours: National Medical Center (ⓒ국립중앙의료원) — call ahead late at night._" },
  kind: { attraction: "Sight", culture: "Culture", leisure: "Leisure" },
  chip: {
    about: "Tell me about {name}",
    walkTo: "Directions to {name}",
    openNow: "Is {name} open now?",
    trainsAt: "Next trains at {station}",
    routeHere: "Route from here",
    paySubway: "How do I pay for the subway?",
    food: "Places to eat near me",
    pharmacy: "Pharmacy near me",
    convenience: "Convenience store near me",
    sightsNear: "What's worth seeing near me?",
  },
  categories: [
    [/약국/, "Pharmacy"],
    [/편의점/, "Convenience store"],
    [/ATM|365/, "ATM"],
    [/은행/, "Bank"],
    [/환전/, "Currency exchange"],
    [/관광안내소/, "Tourist information"],
    [/응급/, "Emergency room"],
    [/보관/, "Lockers"],
    [/빨래방|세탁/, "Laundromat"],
    [/우체국/, "Post office"],
    [/화장실/, "Restroom"],
    [/이슬람/, "Mosque"],
    [/백화점/, "Department store"],
    [/대형마트|마트/, "Supermarket"],
    [/쇼핑/, "Shopping"],
    [/호텔/, "Hotel"],
    [/게스트하우스|호스텔/, "Guesthouse"],
    [/모텔|숙박/, "Stay"],
    [/육류|고기|곱창|삼겹/, "Korean BBQ"],
    [/해물|생선|회/, "Seafood"],
    [/한정식|한식|국밥|찌개|칼국수|냉면|국수/, "Korean"],
    [/일식|초밥|라멘|돈까스/, "Japanese"],
    [/중식|중국/, "Chinese"],
    [/양식|이탈리|파스타|피자|스테이크/, "Western"],
    [/분식|떡볶이|김밥/, "Street food"],
    [/치킨/, "Fried chicken"],
    [/술집|호프|주점|이자카야|바$/, "Bar"],
    [/패스트푸드|햄버거/, "Fast food"],
    [/베이커리|제과|빵/, "Bakery"],
    [/디저트/, "Dessert café"],
    [/카페|커피/, "Café"],
    [/채식|비건|샐러드/, "Vegan-friendly"],
    [/음식점/, "Restaurant"],
  ],
};

const KO: DeviceStrings = {
  near: {
    pharmacy: "💊 내 주변 약국",
    atm: "🏧 내 주변 ATM",
    currencyExchange: "💱 내 주변 환전소",
    convenience: "🏪 내 주변 편의점",
    touristInfo: "ℹ️ 내 주변 관광안내소",
    foreignCardDining: "🍽️ 내 주변 식당",
    emergency: "🏥 가까운 응급실",
    luggage: "🧳 내 주변 물품보관함",
    laundry: "🧺 내 주변 빨래방",
    vegan: "🥗 내 주변 비건·채식",
    prayer: "🕌 가까운 이슬람 사원·기도실",
    post: "📮 내 주변 우체국",
    food: "🍽️ 내 주변 맛집",
    cafe: "☕ 내 주변 카페",
    shopping: "🛍️ 내 주변 쇼핑",
    stay: "🏨 내 주변 숙소",
    toilet: "🚻 내 주변 화장실",
  },
  sights: "🏛️ 내 주변 볼거리",
  nearestFirst: "가까운 순",
  popularFirst: "걸어갈 만한 거리 안 인기순",
  walk: "🚶 **{m}** · 걸어서 약 {min}분",
  noneNear: "{m} 안에 검색된 곳이 없어요.",
  widened: "{near} 안에는 없어서 {far}까지 넓혀 찾았어요.",
  mapsFallback: "지금 지도 검색에 연결되지 않아요 — 지도 앱에서 내 주변으로 바로 열어 보세요:",
  kakaoMap: "카카오맵",
  naverMap: "네이버 지도",
  googleMaps: "구글 지도",
  walkThere: "도보 길찾기",
  call: "전화",
  onDevice: "📱 _휴대폰에서 직접 찾았어요 — 위치는 저희 서버로 전송되지 않아요._",
  routeHead: "🚇 **{to}** — 현재 위치에서",
  walkHead: "🚶 **{to}까지 걸어가세요** — **{m}**, 약 {min}분",
  walkBody: "지하철 타러 내려가는 것보다 걷는 게 더 빨라요.",
  walkToStation: "📍 **{station}**역까지 **{m}** 걸어가세요 (약 {min}분)",
  rideLine: "{icon} **{line}** {from} → {to} _({n}{stops})_",
  stop: "개 역",
  stops: "개 역",
  walkFromStation: "🚶 {station}역에서 {to}까지 **{m}** (약 {min}분)",
  summary: "⏱️ 도착까지 약 **{min}분** · {transfers} · 💳 약 **{fare}원**",
  summaryToGateway: "⏱️ {station}역까지 약 **{min}분** · {transfers} · 💳 약 **{fare}원**",
  noTransfer: "환승 없음",
  transfer: "환승 1회",
  transfers: "환승 {n}회",
  fare: "{fare}원",
  sinbundang: "💡 _신분당선은 개찰구에서 별도 운임이 추가돼요._",
  airport: "✈️ _공항철도는 별도 운임이에요 — 일반열차 기준 약 4,000~4,750원._",
  liveAt: "🟢 **{station} 지금 도착 정보:** {board}",
  subwayClosed: "⛔ **지금은 지하철이 운행하지 않아요** (대략 05:30–24:00). 심야버스(N번)나 택시를 이용하세요.",
  fromYourSpot: "🧭 지금 계신 곳에서 길찾기:",
  noStationNear: "걸어갈 만한 거리에 지하철역이 없어요. 버스까지 알려주는 지도 앱이 더 정확해요:",
  cantPlace: "**{to}**의 위치를 찾지 못했어요. 지도 앱에서 열어 보세요:",
  trainsHead: "🚇 **{station}**역 다음 열차 — {m}, 걸어서 약 {min}분",
  boardDown: "지금 실시간 도착 정보가 응답하지 않아요 — 잠시 후 다시 시도해 주세요.",
  toward: "{to}행",
  arriving: "곧 도착",
  atPlatform: "도착",
  prevStation: "전역",
  stopsAway: "{n}역 전",
  minutes: "{n}분",
  express: "급행",
  lastTrain: "막차",
  noStationForTrains: "걸어갈 만한 거리에 지하철역이 없어요.",
  listingsDown: "지금 볼거리 목록을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요.",
  noTrainsNow: "지금 이 역에 도착 예정인 열차 정보가 없어요.",
  rx: { open: "🟢 **영업 중**", until: "{t}까지", allDay: "🟢 **오늘 24시간 영업**", closedOpens: "🔴 영업 종료 · {t} 오픈", closedLater: "🔴 영업 종료 · 다음 영업일 {t} 오픈", closed: "🔴 영업 종료", openFirst: "영업 중인 곳 먼저", noneOpen: "{m} 안에 지금 문을 연 약국이 없어요. 편의점에서 기본 진통제·감기약은 24시간 살 수 있고, 위급하면 **119**에 전화하세요.", credit: "_영업시간: 국립중앙의료원 약국 정보 (ⓒ국립중앙의료원) — 늦은 밤엔 전화로 확인하세요._" },
  kind: { attraction: "관광지", culture: "문화시설", leisure: "레포츠" },
  chip: {
    about: "{name} 알려줘",
    walkTo: "{name} 가는 길",
    openNow: "{name} 지금 영업해?",
    trainsAt: "{station}역 다음 열차",
    routeHere: "여기서 가는 길",
    paySubway: "지하철 요금은 어떻게 내?",
    food: "내 주변 맛집",
    pharmacy: "내 주변 약국",
    convenience: "내 주변 편의점",
    sightsNear: "내 주변 볼거리",
  },
  categories: [],
};

const JA: DeviceStrings = {
  near: {
    pharmacy: "💊 近くの薬局",
    atm: "🏧 近くのATM",
    currencyExchange: "💱 近くの両替所",
    convenience: "🏪 近くのコンビニ",
    touristInfo: "ℹ️ 近くの観光案内所",
    foreignCardDining: "🍽️ 近くの飲食店",
    emergency: "🏥 近くの救急外来",
    luggage: "🧳 近くのコインロッカー・荷物預かり",
    laundry: "🧺 近くのコインランドリー",
    vegan: "🥗 近くのヴィーガン・ベジタリアン",
    prayer: "🕌 近くのモスク・礼拝室",
    post: "📮 近くの郵便局",
    food: "🍽️ 近くのグルメ",
    cafe: "☕ 近くのカフェ",
    shopping: "🛍️ 近くのショッピング",
    stay: "🏨 近くの宿泊施設",
    toilet: "🚻 近くのトイレ",
  },
  sights: "🏛️ 近くの見どころ",
  nearestFirst: "近い順",
  popularFirst: "歩ける範囲で人気順",
  walk: "🚶 **{m}** · 徒歩約{min}分",
  noneNear: "{m}以内に見つかりませんでした。",
  widened: "{near}以内になかったので、{far}まで広げて探しました。",
  mapsFallback: "地図検索に接続できません — 地図アプリで現在地周辺をそのまま開けます：",
  kakaoMap: "カカオマップ",
  naverMap: "NAVER地図",
  googleMaps: "Googleマップ",
  walkThere: "徒歩ルート",
  call: "電話",
  onDevice: "📱 _スマホの中で調べました — 位置情報が当サービスのサーバーに送られることはありません。_",
  routeHead: "🚇 **{to}** — 現在地から",
  walkHead: "🚶 **{to}まで歩きましょう** — **{m}**、約{min}分",
  walkBody: "ホームまで下りるより歩いた方が早いです。",
  walkToStation: "📍 **{station}駅**まで**{m}**歩きます（約{min}分）",
  rideLine: "{icon} **{line}** {from} → {to} _（{n}{stops}）_",
  stop: "駅",
  stops: "駅",
  walkFromStation: "🚶 {station}駅から{to}まで**{m}**（約{min}分）",
  summary: "⏱️ 到着まで約**{min}分** · {transfers} · 💳 約**₩{fare}**",
  summaryToGateway: "⏱️ {station}駅まで約**{min}分** · {transfers} · 💳 約**₩{fare}**",
  noTransfer: "乗り換えなし",
  transfer: "乗り換え1回",
  transfers: "乗り換え{n}回",
  fare: "₩{fare}",
  sinbundang: "💡 _新盆唐線は改札で別途料金が加算されます。_",
  airport: "✈️ _空港鉄道は別料金です — 各駅停車で約₩4,000〜4,750。_",
  liveAt: "🟢 **{station}のリアルタイム到着:** {board}",
  subwayClosed: "⛔ **現在、地下鉄は運行していません**（おおむね05:30〜24:00）。深夜バス（N系統）かタクシーを。",
  fromYourSpot: "🧭 現在地からのルート：",
  noStationNear: "歩ける範囲に地下鉄駅がありません。バスも案内する地図アプリの方が確実です：",
  cantPlace: "**{to}**の場所が見つかりませんでした。地図アプリで開いてみてください：",
  trainsHead: "🚇 **{station}駅**の次の電車 — {m}、徒歩約{min}分",
  boardDown: "リアルタイム到着情報が応答していません — 少し後でもう一度お試しください。",
  toward: "{to}行き",
  arriving: "まもなく到着",
  atPlatform: "到着",
  prevStation: "前の駅",
  stopsAway: "{n}駅前",
  minutes: "{n}分",
  express: "急行",
  lastTrain: "終電",
  noStationForTrains: "歩ける範囲に地下鉄駅がありません。",
  listingsDown: "見どころリストを読み込めませんでした — 少し後でもう一度お試しください。",
  noTrainsNow: "現在この駅の到着予定情報はありません。",
  rx: { open: "🟢 **営業中**", until: "{t}まで", allDay: "🟢 **本日24時間営業**", closedOpens: "🔴 営業時間外 · {t}開店", closedLater: "🔴 営業時間外 · 次の営業日{t}開店", closed: "🔴 営業時間外", openFirst: "営業中を先に", noneOpen: "{m}以内に今開いている薬局はありません。コンビニでは基本的な鎮痛剤や風邪薬を24時間買えます。緊急時は**119**へ。", credit: "_営業時間：国立中央医療院 薬局情報（ⓒ국립중앙의료원）— 深夜は電話で確認を。_" },
  kind: { attraction: "観光地", culture: "文化施設", leisure: "レジャー" },
  chip: {
    about: "{name}について教えて",
    walkTo: "{name}への行き方",
    openNow: "{name}は今開いてる？",
    trainsAt: "{station}駅の次の電車",
    routeHere: "ここからの行き方",
    paySubway: "地下鉄の運賃の払い方は？",
    food: "近くのグルメ",
    pharmacy: "近くの薬局",
    convenience: "近くのコンビニ",
    sightsNear: "近くの見どころは？",
  },
  categories: [
    [/약국/, "薬局"],
    [/편의점/, "コンビニ"],
    [/ATM|365/, "ATM"],
    [/은행/, "銀行"],
    [/환전/, "両替所"],
    [/관광안내소/, "観光案内所"],
    [/응급/, "救急外来"],
    [/보관/, "コインロッカー"],
    [/빨래방|세탁/, "コインランドリー"],
    [/우체국/, "郵便局"],
    [/화장실/, "トイレ"],
    [/이슬람/, "モスク"],
    [/백화점/, "百貨店"],
    [/대형마트|마트/, "スーパー"],
    [/쇼핑/, "ショッピング"],
    [/호텔/, "ホテル"],
    [/게스트하우스|호스텔/, "ゲストハウス"],
    [/모텔|숙박/, "宿泊"],
    [/육류|고기|곱창|삼겹/, "焼肉"],
    [/해물|생선|회/, "海鮮"],
    [/한정식|한식|국밥|찌개|칼국수|냉면|국수/, "韓国料理"],
    [/일식|초밥|라멘|돈까스/, "和食"],
    [/중식|중국/, "中華"],
    [/양식|이탈리|파스타|피자|스테이크/, "洋食"],
    [/분식|떡볶이|김밥/, "粉食・軽食"],
    [/치킨/, "チキン"],
    [/술집|호프|주점|이자카야|바$/, "居酒屋・バー"],
    [/패스트푸드|햄버거/, "ファストフード"],
    [/베이커리|제과|빵/, "ベーカリー"],
    [/디저트/, "デザートカフェ"],
    [/카페|커피/, "カフェ"],
    [/채식|비건|샐러드/, "ベジ対応"],
    [/음식점/, "飲食店"],
  ],
};

const ZH: DeviceStrings = {
  near: {
    pharmacy: "💊 附近的药店",
    atm: "🏧 附近的ATM",
    currencyExchange: "💱 附近的换钱所",
    convenience: "🏪 附近的便利店",
    touristInfo: "ℹ️ 附近的旅游咨询处",
    foreignCardDining: "🍽️ 附近的餐厅",
    emergency: "🏥 附近的急诊室",
    luggage: "🧳 附近的储物柜·行李寄存",
    laundry: "🧺 附近的自助洗衣店",
    vegan: "🥗 附近的素食餐厅",
    prayer: "🕌 附近的清真寺·祈祷室",
    post: "📮 附近的邮局",
    food: "🍽️ 附近的美食",
    cafe: "☕ 附近的咖啡馆",
    shopping: "🛍️ 附近的购物",
    stay: "🏨 附近的住宿",
    toilet: "🚻 附近的洗手间",
  },
  sights: "🏛️ 附近值得一看的地方",
  nearestFirst: "由近到远",
  popularFirst: "步行范围内按热度",
  walk: "🚶 **{m}** · 步行约{min}分钟",
  noneNear: "{m}内没有找到。",
  widened: "{near}内没有，已扩大到{far}。",
  mapsFallback: "暂时连不上地图搜索 — 可以在地图应用里直接打开你周边的搜索：",
  kakaoMap: "Kakao地图",
  naverMap: "Naver地图",
  googleMaps: "谷歌地图",
  walkThere: "步行路线",
  call: "电话",
  onDevice: "📱 _在你的手机上查找 — 你的位置不会发送到我们的服务器。_",
  routeHead: "🚇 **{to}** — 从你现在的位置",
  walkHead: "🚶 **步行去{to}** — **{m}**，约{min}分钟",
  walkBody: "比下到站台坐地铁更快。",
  walkToStation: "📍 步行**{m}**到**{station}站**（约{min}分钟）",
  rideLine: "{icon} **{line}** {from} → {to} _（{n}{stops}）_",
  stop: "站",
  stops: "站",
  walkFromStation: "🚶 从{station}站到{to}步行**{m}**（约{min}分钟）",
  summary: "⏱️ 全程约**{min}分钟** · {transfers} · 💳 约**₩{fare}**",
  summaryToGateway: "⏱️ 到{station}站约**{min}分钟** · {transfers} · 💳 约**₩{fare}**",
  noTransfer: "无需换乘",
  transfer: "换乘1次",
  transfers: "换乘{n}次",
  fare: "₩{fare}",
  sinbundang: "💡 _新盆唐线在闸机会另收附加费。_",
  airport: "✈️ _机场铁路单独计费 — 普通列车约₩4,000–4,750。_",
  liveAt: "🟢 **{station}实时到站：** {board}",
  subwayClosed: "⛔ **地铁现在不运营**（大约05:30–24:00）。可以坐夜间公交（N线）或打车。",
  fromYourSpot: "🧭 从你所在位置导航：",
  noStationNear: "步行范围内没有地铁站。能查公交的地图应用会更准确：",
  cantPlace: "没有找到**{to}**的位置。可以在地图应用里打开：",
  trainsHead: "🚇 **{station}站**下一班车 — {m}，步行约{min}分钟",
  boardDown: "实时到站信息暂时没有响应 — 请稍后再试。",
  toward: "开往{to}",
  arriving: "即将到站",
  atPlatform: "已到站",
  prevStation: "前一站",
  stopsAway: "还有{n}站",
  minutes: "{n}分钟",
  express: "快车",
  lastTrain: "末班车",
  noStationForTrains: "步行范围内没有地铁站。",
  listingsDown: "暂时无法加载景点列表 — 请稍后再试。",
  noTrainsNow: "这个车站目前没有到站信息。",
  rx: { open: "🟢 **营业中**", until: "营业至{t}", allDay: "🟢 **今天24小时营业**", closedOpens: "🔴 已打烊 · {t}开门", closedLater: "🔴 已打烊 · 下一营业日{t}开门", closed: "🔴 已打烊", openFirst: "营业中的优先", noneOpen: "{m}内目前没有营业中的药店。便利店24小时出售基本止痛药和感冒药；情况紧急请拨打**119**。", credit: "_营业时间：国立中央医疗院药店信息（ⓒ국립중앙의료원）— 深夜请先打电话确认。_" },
  kind: { attraction: "景点", culture: "文化设施", leisure: "休闲" },
  chip: {
    about: "介绍一下{name}",
    walkTo: "去{name}怎么走",
    openNow: "{name}现在营业吗？",
    trainsAt: "{station}站下一班车",
    routeHere: "从这里怎么走",
    paySubway: "地铁怎么付钱？",
    food: "附近的美食",
    pharmacy: "附近的药店",
    convenience: "附近的便利店",
    sightsNear: "附近有什么值得看的？",
  },
  categories: [
    [/약국/, "药店"],
    [/편의점/, "便利店"],
    [/ATM|365/, "ATM"],
    [/은행/, "银行"],
    [/환전/, "换钱所"],
    [/관광안내소/, "旅游咨询处"],
    [/응급/, "急诊室"],
    [/보관/, "储物柜"],
    [/빨래방|세탁/, "自助洗衣"],
    [/우체국/, "邮局"],
    [/화장실/, "洗手间"],
    [/이슬람/, "清真寺"],
    [/백화점/, "百货商店"],
    [/대형마트|마트/, "超市"],
    [/쇼핑/, "购物"],
    [/호텔/, "酒店"],
    [/게스트하우스|호스텔/, "青旅"],
    [/모텔|숙박/, "住宿"],
    [/육류|고기|곱창|삼겹/, "韩式烤肉"],
    [/해물|생선|회/, "海鲜"],
    [/한정식|한식|국밥|찌개|칼국수|냉면|국수/, "韩餐"],
    [/일식|초밥|라멘|돈까스/, "日料"],
    [/중식|중국/, "中餐"],
    [/양식|이탈리|파스타|피자|스테이크/, "西餐"],
    [/분식|떡볶이|김밥/, "小吃"],
    [/치킨/, "炸鸡"],
    [/술집|호프|주점|이자카야|바$/, "酒吧"],
    [/패스트푸드|햄버거/, "快餐"],
    [/베이커리|제과|빵/, "面包店"],
    [/디저트/, "甜品店"],
    [/카페|커피/, "咖啡馆"],
    [/채식|비건|샐러드/, "素食友好"],
    [/음식점/, "餐厅"],
  ],
};

export const DEVICE_STRINGS: Record<Lang, DeviceStrings> = { en: EN, ko: KO, ja: JA, zh: ZH };

/** Fill "{name}"-style holes. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** "140 m", "1.2 km" — the way a map app says it. */
export function distance(m: number, lang: Lang): string {
  if (m < 1000) return lang === "ko" ? `${Math.max(10, Math.round(m / 10) * 10)}m` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = (m / 1000).toFixed(m < 10_000 ? 1 : 0);
  return lang === "ko" ? `${km}km` : `${km} km`;
}

/**
 * Minutes on foot for a straight-line distance. A visitor with a bag walks
 * about 75 m a minute, and streets are about a quarter longer than the straight
 * line between two points — quoting the straight line promised walks that
 * took longer than we said.
 */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round((m * 1.25) / 75));
}

/** The label Kakao's category path reads as, in the reader's language (Korean readers get Kakao's own). */
export function categoryLabel(categoryName: string, lang: Lang): string | undefined {
  const last = categoryName.split(">").map((s) => s.trim()).filter(Boolean);
  if (lang === "ko") return last[last.length - 1];
  const hay = last.slice(-2).join(" ");
  return DEVICE_STRINGS[lang].categories.find(([re]) => re.test(hay))?.[1];
}
