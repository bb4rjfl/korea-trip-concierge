import type { Lang } from "./api.js";

/** UI strings + scenario quick-start cards, per language. */

export interface Strings {
  tagline: string;
  placeholder: string;
  send: string;
  thinking: string;
  statusRouting: string;
  statusTool: string;
  statusLocalizing: string;
  networkError: string;
  offline: string;
  rateLimited: string;
  retry: string;
  newChat: string;
  scenariosTitle: string;
  attribution: string;
  photoCredit: string;
  nearMe: string;
  nearMeQuery: string;
  locationDenied: string;
  locationPrivacy: string;
  aboutTitle: string;
  aboutBody: string;
  aboutSources: string;
  close: string;
  welcome: string;
}

/** Per-tool emoji for the live status line. */
export const TOOL_EMOJI: Record<string, string> = {
  searchPlaceForeigner: "🔎",
  findForeignerFriendlyStore: "🏪",
  getTransitRoute: "🚇",
  trackBusArrival: "🚌",
  trackSubwayArrival: "🚈",
  explainPayment: "💳",
  explainKoreanService: "🧭",
  getAreaGuide: "🗺️",
  translateMenuContext: "🍜",
  getNowInfo: "🕐",
  getJejuInfo: "🍊",
  getWeatherAndAir: "🌤️",
  recommendTripCourse: "🗓️",
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    tagline: "Real-time travel help, mid-trip",
    placeholder: "Ask anything — weather, buses, menus, payments…",
    send: "Send",
    thinking: "Checking live data…",
    statusRouting: "Understanding your question…",
    statusTool: "Checking live data…",
    statusLocalizing: "Putting it in your language…",
    networkError: "Couldn't reach the server. Please try again.",
    offline: "You're offline — answers need a connection. Saved messages are still here.",
    rateLimited: "A little too fast 🙂 Give it a few seconds and try again.",
    retry: "Retry",
    newChat: "New chat",
    scenariosTitle: "Stuck mid-trip? Try one:",
    attribution: "Source: ⓒKorea Tourism Organization & public data",
    photoCredit: "Photos: ⓒKorea Tourism Organization",
    nearMe: "Near me",
    nearMeQuery: "What's near {place}?",
    locationDenied: "Location is off — you can just type a neighborhood name instead.",
    locationPrivacy: "📍 Your coordinates never leave this device — only the area name is sent.",
    aboutTitle: "About this service",
    aboutBody:
      "Korea Trip Concierge is a real-time conversational travel guide for visitors in Korea. It answers with live public data — not canned pages. No login, no tracking; your location never leaves your device.",
    aboutSources: "Data sources",
    close: "Close",
    welcome:
      "Hi! I'm your Korea trip concierge 🧳\n\nWhen something comes up mid-trip — sudden rain, a missed bus, a menu you can't read, a card that won't go through — ask me here. I check **live data** and answer in your language.",
  },
  ko: {
    tagline: "여행 중 실시간 도우미",
    placeholder: "무엇이든 물어보세요 — 날씨, 버스, 메뉴, 결제…",
    send: "전송",
    thinking: "실시간 데이터 확인 중…",
    statusRouting: "질문 이해하는 중…",
    statusTool: "실시간 데이터 확인 중…",
    statusLocalizing: "한국어로 정리하는 중…",
    networkError: "서버에 연결하지 못했어요. 다시 시도해 주세요.",
    offline: "오프라인이에요 — 답변에는 연결이 필요합니다. 지난 대화는 그대로 있어요.",
    rateLimited: "조금 빨라요 🙂 몇 초 후 다시 시도해 주세요.",
    retry: "다시 시도",
    newChat: "새 대화",
    scenariosTitle: "여행 중 막혔을 때, 눌러보세요:",
    attribution: "출처: ⓒ한국관광공사 및 공공데이터",
    photoCredit: "사진: ⓒ한국관광공사",
    nearMe: "내 주변",
    nearMeQuery: "{place} 근처에 뭐 있어?",
    locationDenied: "위치가 꺼져 있어요 — 동네 이름을 직접 입력해도 돼요.",
    locationPrivacy: "📍 좌표는 기기 밖으로 나가지 않아요 — 동네 이름만 전송돼요.",
    aboutTitle: "서비스 소개",
    aboutBody:
      "Korea Trip Concierge는 방한 여행자를 위한 실시간 대화형 여행 가이드입니다. 정적인 안내가 아니라 실시간 공공데이터로 답합니다. 로그인·추적 없음, 위치 좌표는 기기 밖으로 나가지 않습니다.",
    aboutSources: "데이터 출처",
    close: "닫기",
    welcome:
      "안녕하세요! 한국 여행 컨시어지입니다 🧳\n\n여행 중 갑자기 비가 오거나, 버스를 놓치거나, 메뉴를 못 읽거나, 카드가 안 될 때 — 여기에 물어보세요. **실시간 데이터**로 확인해 답해드립니다.",
  },
  ja: {
    tagline: "旅の途中のリアルタイム・ヘルプ",
    placeholder: "何でも聞いてください — 天気、バス、メニュー、決済…",
    send: "送信",
    thinking: "ライブデータを確認中…",
    statusRouting: "ご質問を理解しています…",
    statusTool: "ライブデータを確認中…",
    statusLocalizing: "日本語にまとめています…",
    networkError: "サーバーに接続できませんでした。もう一度お試しください。",
    offline: "オフラインです — 回答には接続が必要です。これまでの会話は残っています。",
    rateLimited: "少し早すぎます🙂 数秒後にもう一度どうぞ。",
    retry: "再試行",
    newChat: "新しい会話",
    scenariosTitle: "旅の途中で困ったら、タップ:",
    attribution: "出典: ⓒ韓国観光公社・公共データ",
    photoCredit: "写真: ⓒ韓国観光公社",
    nearMe: "現在地周辺",
    nearMeQuery: "{place}の近くに何がある？",
    locationDenied: "位置情報がオフです — エリア名を入力してもOKです。",
    locationPrivacy: "📍 座標が端末の外に出ることはありません — エリア名のみ送信されます。",
    aboutTitle: "このサービスについて",
    aboutBody:
      "Korea Trip Concierge は訪韓旅行者のためのリアルタイム対話型ガイドです。ログイン・トラッキングなし。位置座標が端末の外に出ることはありません。",
    aboutSources: "データ出典",
    close: "閉じる",
    welcome:
      "こんにちは！韓国旅行コンシェルジュです 🧳\n\n急な雨、バスの乗り遅れ、読めないメニュー、使えないカード — 旅の途中の困りごとをここで聞いてください。**ライブデータ**で確認して答えます。",
  },
  zh: {
    tagline: "旅途中的实时帮手",
    placeholder: "随便问 — 天气、公交、菜单、支付…",
    send: "发送",
    thinking: "正在查询实时数据…",
    statusRouting: "正在理解你的问题…",
    statusTool: "正在查询实时数据…",
    statusLocalizing: "正在整理成中文…",
    networkError: "无法连接服务器，请重试。",
    offline: "你处于离线状态 — 回答需要联网。之前的对话仍在。",
    rateLimited: "稍微快了一点🙂 请几秒后再试。",
    retry: "重试",
    newChat: "新对话",
    scenariosTitle: "旅途中卡住了？试试这些:",
    attribution: "来源: ⓒ韩国观光公社及公共数据",
    photoCredit: "照片: ⓒ韩国观光公社",
    nearMe: "我的附近",
    nearMeQuery: "{place}附近有什么？",
    locationDenied: "定位未开启 — 也可以直接输入街区名。",
    locationPrivacy: "📍 坐标不会离开你的设备 — 只发送街区名称。",
    aboutTitle: "关于本服务",
    aboutBody:
      "Korea Trip Concierge 是面向访韩游客的实时对话式旅行指南。无需登录、无跟踪，位置坐标不会离开你的设备。",
    aboutSources: "数据来源",
    close: "关闭",
    welcome:
      "你好！我是你的韩国旅行管家 🧳\n\n旅途中突然下雨、错过公交、看不懂菜单、刷卡被拒 — 都可以在这里问我。我会查**实时数据**用你的语言回答。",
  },
};

export interface Scenario {
  emoji: string;
  label: string;
  send: string;
}

export const SCENARIOS: Record<Lang, Scenario[]> = {
  en: [
    { emoji: "🌧️", label: "Rain plan B", send: "It's raining in Seoul — where can I go indoors?" },
    { emoji: "🚌", label: "Live bus", send: "Where is bus 143 in Seoul right now?" },
    { emoji: "🚇", label: "Next subway", send: "When is the next train at Hongik University station?" },
    { emoji: "🕐", label: "Open now?", send: "Is Gyeongbokgung Palace open right now?" },
    { emoji: "💳", label: "Card declined", send: "My card was declined at a restaurant — what should I do?" },
    { emoji: "🗺️", label: "1-day course", send: "Plan a 1-day Seoul course for a foodie couple" },
  ],
  ko: [
    { emoji: "🌧️", label: "비 올 때 플랜B", send: "서울에 비 오는데 실내로 갈 만한 곳 있어?" },
    { emoji: "🚌", label: "버스 실시간", send: "143번 버스 신사역 도착 언제야?" },
    { emoji: "🚇", label: "지하철 도착", send: "홍대입구역 지하철 언제 와?" },
    { emoji: "🕐", label: "지금 영업?", send: "경복궁 지금 열었어?" },
    { emoji: "💳", label: "카드 거절", send: "식당에서 카드가 거절됐어, 어떡하지?" },
    { emoji: "🗺️", label: "당일 코스", send: "먹방 커플용 서울 당일 코스 짜줘" },
  ],
  ja: [
    { emoji: "🌧️", label: "雨のプランB", send: "ソウルで雨が降ってきた。室内で行ける場所は？" },
    { emoji: "🚌", label: "バス位置", send: "143番バスは今どこ？" },
    { emoji: "🚇", label: "地下鉄到着", send: "弘大入口駅の地下鉄はいつ来る？" },
    { emoji: "🕐", label: "今営業中？", send: "景福宮は今開いてる？" },
    { emoji: "💳", label: "カード拒否", send: "レストランでカードが拒否された。どうすれば？" },
    { emoji: "🗺️", label: "日帰りコース", send: "グルメカップル向けのソウル日帰りコースを作って" },
  ],
  zh: [
    { emoji: "🌧️", label: "下雨备案", send: "首尔下雨了，有什么室内景点推荐？" },
    { emoji: "🚌", label: "公交实时", send: "143路公交现在在哪里？" },
    { emoji: "🚇", label: "地铁到站", send: "弘大入口站地铁什么时候来？" },
    { emoji: "🕐", label: "现在营业?", send: "景福宫现在开门吗？" },
    { emoji: "💳", label: "刷卡被拒", send: "在餐厅刷卡被拒了，怎么办？" },
    { emoji: "🗺️", label: "一日行程", send: "帮我规划情侣一日首尔美食行程" },
  ],
};

export const SOURCE_CREDITS: string[] = [
  "ⓒ한국관광공사 (Korea Tourism Organization) — TourAPI multilingual tourism info",
  "기상청 (KMA) — weather & alerts · 에어코리아 — air quality",
  "서울특별시 — Seoul bus & subway real-time arrivals",
  "국토교통부 TAGO — nationwide bus arrivals",
  "ODsay — public transit routing",
  "Visit Seoul (서울관광재단) · VisitJeju (제주관광공사)",
  "Naver Local · Foursquare — place search",
];

export function detectDefaultLang(): Lang {
  const saved = localStorage.getItem("ktc.lang");
  if (saved === "en" || saved === "ja" || saved === "zh" || saved === "ko") return saved;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("zh")) return "zh";
  return "en";
}
