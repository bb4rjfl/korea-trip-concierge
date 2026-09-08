/**
 * The same questions, in the languages we actually serve.
 *
 * Why this file exists
 * --------------------
 * This service answers in English, Korean, Japanese and Chinese, and until now
 * retrieval had only ever been measured in English. That is the wrong way round
 * for a service whose entire premise is people who cannot read Korean: three of
 * our four audiences were being served by a retrieval layer nobody had scored.
 *
 * The published position is that it does not hold: embedding models advertised
 * as multilingual degrade on non-English queries because their training corpora
 * are 80–90% English, and the failure is quiet — a Japanese query returns
 * *something*, ranked worse, and nothing in the logs says so. The advice is also
 * that translating the query before embedding is the wrong fix, because modern
 * models align across languages and a translation step adds latency and its own
 * errors. Both claims are testable against our own corpus, so this tests them.
 *
 * How the cases were written
 * --------------------------
 * Each is the same information need as its English twin, phrased the way a
 * person actually types it in that language — not a machine translation of the
 * English string. "막차 끊겼는데 폰도 죽었어" is what someone writes; "내 전화기가
 *죽었고 현금이 없다" is what a translator produces. The expected document is the
 * same one, because the answer does not change with the language of the asking.
 *
 * The corpus itself is English. That is the point of the measurement: if a
 * Korean query cannot reach an English document about being stranded, we have a
 * problem that no amount of English testing would ever have shown us.
 */

import type { RankCase } from "./retrieval-set.js";

export const MULTILINGUAL_CASES: RankCase[] = [
  /* ------------------------------- Korean -------------------------------- */
  { lang: "ko", q: "카페에 강아지 데려가도 돼요?", answers: ["Travelling with a pet"] },
  { lang: "ko", q: "폰 배터리 나갔고 현금도 없는데 호텔 어떻게 가지", answers: ["Stranded"] },
  { lang: "ko", q: "한국 번호 없이 배달 시킬 수 있나요", answers: ["Food delivery"] },
  { lang: "ko", q: "티머니 카드 어디서 사요", answers: ["Public transit"] },
  { lang: "ko", q: "편의점에서 카드가 자꾸 안 돼요", answers: ["Convenience store"] },
  { lang: "ko", q: "한국은 팁 줘야 하나요", answers: ["Tipping"] },
  { lang: "ko", q: "밤늦게 문 여는 약국 있어요?", answers: ["Emergency & medical help"] },
  { lang: "ko", q: "키오스크가 한국어뿐이라 주문을 못 하겠어요", answers: ["kiosk"] },
  { lang: "ko", q: "지하철에서 지갑을 잃어버렸어요", answers: ["Lost or stolen"] },
  { lang: "ko", q: "면세 환급 받을 수 있나요", answers: ["tax refund", "VAT"] },
  { lang: "ko", q: "야경 보기 좋은 곳", answers: ["Seoul Sky", "N Seoul Tower", "Gwangalli", "Banpo Bridge"] },
  { lang: "ko", q: "한복 입고 사진 찍을 만한 곳", answers: ["Gyeongbokgung", "Bukchon Hanok Village", "Namsangol"] },
  { lang: "ko", q: "일출 보러 어디 가요", answers: ["Seongsan Ilchulbong"] },
  { lang: "ko", q: "조용한 갤러리, 박물관 말고", answers: ["Gallery Hyundai", "Kukje Gallery", "Songeun Art Space"] },
  { lang: "ko", q: "제주도 렌터카 없이 다닐 수 있어요?", answers: ["Getting around Jeju"] },

  /* ------------------------------ Japanese ------------------------------- */
  { lang: "ja", q: "カフェに犬を連れて入れますか", answers: ["Travelling with a pet"] },
  { lang: "ja", q: "スマホの電池が切れて現金もない、ホテルまでどうやって帰る", answers: ["Stranded"] },
  { lang: "ja", q: "韓国の電話番号がなくても出前を頼めますか", answers: ["Food delivery"] },
  { lang: "ja", q: "T-moneyカードはどこで買えますか", answers: ["Public transit"] },
  { lang: "ja", q: "コンビニでカードが使えません", answers: ["Convenience store"] },
  { lang: "ja", q: "韓国ではチップは必要ですか", answers: ["Tipping"] },
  { lang: "ja", q: "夜遅くまで開いている薬局はありますか", answers: ["Emergency & medical help"] },
  { lang: "ja", q: "キオスクが韓国語だけで注文できない", answers: ["kiosk"] },
  { lang: "ja", q: "地下鉄で財布をなくしました", answers: ["Lost or stolen"] },
  { lang: "ja", q: "免税の払い戻しはできますか", answers: ["tax refund", "VAT"] },
  { lang: "ja", q: "夜景がきれいな場所", answers: ["Seoul Sky", "N Seoul Tower", "Gwangalli", "Banpo Bridge"] },
  { lang: "ja", q: "韓服を着て写真を撮れる場所", answers: ["Gyeongbokgung", "Bukchon Hanok Village", "Namsangol"] },
  { lang: "ja", q: "日の出を見るならどこ", answers: ["Seongsan Ilchulbong"] },
  { lang: "ja", q: "静かなギャラリー、美術館ではなく", answers: ["Gallery Hyundai", "Kukje Gallery", "Songeun Art Space"] },
  { lang: "ja", q: "済州島はレンタカーなしで回れますか", answers: ["Getting around Jeju"] },

  /* ------------------------------- Chinese ------------------------------- */
  { lang: "zh", q: "咖啡厅可以带狗进去吗", answers: ["Travelling with a pet"] },
  { lang: "zh", q: "手机没电了也没现金，怎么回酒店", answers: ["Stranded"] },
  { lang: "zh", q: "没有韩国手机号可以点外卖吗", answers: ["Food delivery"] },
  { lang: "zh", q: "T-money卡在哪里买", answers: ["Public transit"] },
  { lang: "zh", q: "便利店刷卡一直失败", answers: ["Convenience store"] },
  { lang: "zh", q: "韩国需要给小费吗", answers: ["Tipping"] },
  { lang: "zh", q: "有没有深夜营业的药店", answers: ["Emergency & medical help"] },
  { lang: "zh", q: "点餐机只有韩文，我不会点", answers: ["kiosk"] },
  { lang: "zh", q: "我在地铁上把钱包弄丢了", answers: ["Lost or stolen"] },
  { lang: "zh", q: "可以退税吗", answers: ["tax refund", "VAT"] },
  { lang: "zh", q: "看夜景的好地方", answers: ["Seoul Sky", "N Seoul Tower", "Gwangalli", "Banpo Bridge"] },
  { lang: "zh", q: "可以穿韩服拍照的地方", answers: ["Gyeongbokgung", "Bukchon Hanok Village", "Namsangol"] },
  { lang: "zh", q: "去哪里看日出", answers: ["Seongsan Ilchulbong"] },
  { lang: "zh", q: "安静的画廊，不要博物馆", answers: ["Gallery Hyundai", "Kukje Gallery", "Songeun Art Space"] },
  { lang: "zh", q: "济州岛不租车能玩吗", answers: ["Getting around Jeju"] },
];
