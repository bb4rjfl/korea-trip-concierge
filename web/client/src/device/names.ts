/**
 * A Korean shop name, as a visitor can say it — worked out on the phone.
 *
 * Kakao's directory names places in Korean only: "푸른온누리약국", "GS25
 * 양재삼익점". Romanised whole, those read as "Pureunonnuriyakguk" — sayable to
 * no one. The server used to merge in English names from another directory, but
 * that search ran around the traveller's position, and the position no longer
 * leaves the phone. So the phone does what it can with the name itself:
 *
 *  - chains by their own English names (GS25, Olive Young, KB Kookmin Bank…),
 *  - the word saying what kind of place it is, translated (…약국 → … Pharmacy),
 *  - "…점" as a branch and "…역" as a station,
 *  - and the rest romanised, so it can be said out loud.
 *
 * The Korean stays alongside, because it is what is written over the door.
 */

import { romanizeHangul } from "../../../../src/lib/romanize.js";

/** Chains, as their own signs spell them in English. Longest first where one contains another. */
const CHAINS: [RegExp, string][] = [
  [/온누리약국/, "Onnuri Pharmacy"],
  [/GS25|지에스25/, "GS25"],
  [/CU(?![a-z])|씨유/, "CU"],
  [/세븐일레븐|7-?ELEVEN/i, "7-Eleven"],
  [/이마트24|emart24/i, "emart24"],
  [/미니스톱/, "Ministop"],
  [/올리브영/, "Olive Young"],
  [/다이소/, "Daiso"],
  [/스타벅스/, "Starbucks"],
  [/투썸플레이스/, "A Twosome Place"],
  [/이디야/, "Ediya Coffee"],
  [/메가(?:MGC)?커피/, "Mega Coffee"],
  [/컴포즈커피/, "Compose Coffee"],
  [/빽다방/, "Paik's Coffee"],
  [/할리스/, "Hollys Coffee"],
  [/폴바셋/, "Paul Bassett"],
  [/커피빈/, "The Coffee Bean"],
  [/파스쿠찌/, "Pascucci"],
  [/공차/, "Gong Cha"],
  [/배스킨라빈스/, "Baskin Robbins"],
  [/던킨/, "Dunkin'"],
  [/파리바게뜨/, "Paris Baguette"],
  [/뚜레쥬르/, "Tous les Jours"],
  [/맥도날드/, "McDonald's"],
  [/버거킹/, "Burger King"],
  [/롯데리아/, "Lotteria"],
  [/맘스터치/, "Mom's Touch"],
  [/서브웨이/, "Subway"],
  [/도미노피자/, "Domino's Pizza"],
  [/피자헛/, "Pizza Hut"],
  [/교촌치킨/, "Kyochon Chicken"],
  [/BBQ|비비큐/, "BBQ Chicken"],
  [/KB국민은행|국민은행/, "KB Kookmin Bank"],
  [/신한은행/, "Shinhan Bank"],
  [/우리은행/, "Woori Bank"],
  [/하나은행/, "Hana Bank"],
  [/IBK기업은행|기업은행/, "IBK Bank"],
  [/NH농협은행|농협은행|농협/, "NH NongHyup Bank"],
  [/SC제일은행/, "SC First Bank"],
  [/씨티은행/, "Citibank"],
  [/Sh수협은행|수협은행/, "Suhyup Bank"],
  [/우체국/, "Post Office"],
  [/새마을금고/, "MG Credit Union"],
  [/신협/, "Shinhyup Credit Union"],
  [/롯데백화점/, "Lotte Department Store"],
  [/신세계백화점/, "Shinsegae Department Store"],
  [/현대백화점/, "Hyundai Department Store"],
  [/이마트(?!24)/, "E-Mart"],
  [/홈플러스/, "Homeplus"],
  [/롯데마트/, "Lotte Mart"],
];

/** The word at the end of a name that says what kind of place it is. Longest first. */
const KIND_WORDS: [string, string][] = [
  ["관광안내소", "Tourist Information"],
  ["개방화장실", "Public Restroom"],
  ["물품보관함", "Lockers"],
  ["코인빨래방", "Coin Laundry"],
  ["게스트하우스", "Guesthouse"],
  ["한의원", "Korean Medicine Clinic"],
  ["응급실", "Emergency Room"],
  ["빨래방", "Laundromat"],
  ["화장실", "Restroom"],
  ["환전소", "Currency Exchange"],
  ["백화점", "Department Store"],
  ["병원", "Hospital"],
  ["의원", "Clinic"],
  ["치과", "Dental Clinic"],
  ["약국", "Pharmacy"],
  ["은행", "Bank"],
  ["식당", "Restaurant"],
  ["카페", "Café"],
  ["커피", "Coffee"],
  ["호텔", "Hotel"],
  ["모텔", "Motel"],
  ["호스텔", "Hostel"],
];

const HANGUL = /[가-힣]/;

/**
 * A Korean word, sayable: "명동역" → "Myeongdong Stn.", "1층" → "1F", "5번" →
 * "#5", and — for a word that is a neighbourhood on its own — "양재동" →
 * "Yangjae-dong". Anything else romanised whole.
 */
function sayable(ko: string, neighbourhood = true): string {
  const s = ko.trim();
  if (!s) return "";
  if (!HANGUL.test(s)) return s;
  const floor = /^(지하\s*)?(\d+)층$/.exec(s);
  if (floor) return `${floor[1] ? "B" : ""}${floor[2]}F`;
  const number = /^(\d+)번$/.exec(s);
  if (number) return `#${number[1]}`;
  const station = /^(.+?)역$/.exec(s);
  if (station && station[1].length >= 2) return `${cap(romanizeHangul(station[1]))} Stn.`;
  // Short words only: "망원동" is a neighbourhood; "밀리오레호텔명동" is a hotel.
  const dong = neighbourhood ? /^([가-힣]{2,3})(동|구|로|길)$/.exec(s) : null;
  if (dong) return `${cap(romanizeHangul(dong[1]))}-${romanizeHangul(dong[2]).toLowerCase()}`;
  return cap(romanizeHangul(s));
}

/** Capitals at the start of each word, not after a hyphen: "Mangwon-dong". */
const cap = (s: string): string => s.replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** "양재삼익점" → "Yangjaesamik", "양재동지점" → "Yangjae-dong", "명동역점" → "Myeongdong Stn.", "본점" → "Main". */
function branch(ko: string): string {
  // "양재본점" is the Yangjae main branch, not somewhere called Yangjaebon.
  const main = /본점$/.test(ko);
  const s = ko.replace(main ? /본점$/ : /지?점$/, "").trim();
  if (!s) return main ? "Main" : "";
  if (main) return `${sayable(s, false)} (main)`;
  // A branch named for a neighbourhood ends in 동 and is one ("양재동지점");
  // a branch named for a building merely happens to ("…호텔명동점").
  return sayable(s, /^[가-힣]{1,3}동$/.test(s));
}

/** "365" on a bank or post office is its 24-hour ATM corner, and "코너" the corner itself. */
function atmCorner(word: string): string | undefined {
  if (/^365(?:코너)?$/.test(word)) return "24h ATM";
  if (word === "코너") return "";
  return undefined;
}

export interface SaidName {
  /** What to say — "Pureun Onnuri Pharmacy", "GS25 Yangjaesamik". */
  said: string;
  /** What is on the sign, when that is not the same thing. */
  sign?: string;
}

/**
 * A place's name in a form a visitor can say, and the Korean it is signed in.
 * A Korean reader gets Kakao's name exactly as it is.
 */
export function sayName(name: string, lang: "en" | "ko" | "ja" | "zh"): SaidName {
  const ko = (name ?? "").replace(/\s+/g, " ").trim();
  if (lang === "ko" || !HANGUL.test(ko)) return { said: ko };

  // "우체국365코너" and "IBK기업은행365" run the number into the name.
  const words = ko
    .replace(/(\D)(365)(?=코너|\s|$)/g, "$1 $2")
    // "자연빌딩1층" → "자연빌딩 1층", leaving "지하1층" whole.
    .replace(/(?<=[^\d\s])(?<!지하)((?:지하)?\d+층)$/, " $1")
    .split(" ");
  const out: string[] = [];
  for (const word of words) {
    const atm = atmCorner(word);
    if (atm !== undefined) {
      if (atm && !out.includes(atm)) out.push(atm);
      continue;
    }
    const chain = CHAINS.find(([re]) => re.test(word));
    if (chain) {
      const [before, after] = word.split(chain[0]);
      if (before) out.push(sayable(before));
      out.push(chain[1]);
      if (after) out.push(atmCorner(after) ?? (/점$/.test(after) ? branch(after) : sayable(after)));
      continue;
    }
    if (/점$/.test(word) && word.length > 1 && out.length) {
      out.push(branch(word));
      continue;
    }
    const whole = KIND_WORDS.find(([k]) => word === k);
    if (whole) {
      out.push(whole[1]);
      continue;
    }
    const kind = KIND_WORDS.find(([k]) => word.endsWith(k));
    if (kind) {
      out.push(sayable(word.slice(0, -kind[0].length)), kind[1]);
      continue;
    }
    // "ATM" and the like are already sayable.
    out.push(sayable(word));
  }
  const said = out.filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
  return said && said !== ko ? { said, sign: ko } : { said: ko };
}
