/**
 * Which exit to take — the question every visitor asks at the bottom of the
 * escalator, and the one a route planner never answers.
 *
 * Seoul stations have up to fifteen exits spread over a city block, so "you have
 * arrived" is not the same as "you can see it". This is deliberately curated
 * rather than fetched: exit numbering is stable for years, the list only needs to
 * cover the places visitors actually go, and a wrong exit from a fuzzy API match
 * costs someone a ten-minute walk in the rain.
 *
 * Each entry is the exit the station's own signage points to.
 */

import { normalizeName } from "./fuzzy.js";

export interface ExitHint {
  /** Korean station name, as printed on the platform. */
  station: string;
  /** Exit number(s), as printed on the sign. */
  exit: string;
  /** Where you come out and how far it is on foot. */
  walk: string;
}

const EXITS: { match: RegExp; hint: ExitHint }[] = [
  {
    match: /gyeongbokgung|경복궁|景福宮|景福宫/i,
    hint: { station: "경복궁", exit: "5", walk: "Comes out inside the palace's ticket plaza — about 2 min." },
  },
  {
    match: /tongin|통인시장|seochon|서촌/i,
    hint: { station: "경복궁", exit: "2", walk: "Turn right and walk 5 min into the Seochon lanes." },
  },
  {
    match: /changdeokgung|창덕궁|昌徳宮|昌德宫/i,
    hint: { station: "안국", exit: "3", walk: "Straight ahead about 5 min to the main gate." },
  },
  {
    match: /bukchon|북촌|北村/i,
    hint: { station: "안국", exit: "2", walk: "Uphill about 8 min to the hanok lanes — wear flat shoes." },
  },
  {
    match: /insadong|인사동|仁寺洞/i,
    hint: { station: "안국", exit: "6", walk: "Insadong-gil starts about 3 min ahead." },
  },
  {
    match: /ikseon|익선동/i,
    hint: { station: "종로3가", exit: "4", walk: "The alley entrance is 2 min away, across from the police box." },
  },
  {
    match: /gwangjang|광장시장|広蔵市場|广藏市场/i,
    hint: { station: "종로5가", exit: "8", walk: "The market's north gate is right there — under 2 min." },
  },
  {
    match: /myeong.?dong|명동|明洞|ミョンドン/i,
    hint: { station: "명동", exit: "6", walk: "Opens onto the main shopping street; the night food stalls start here." },
  },
  {
    match: /myeongdong cathedral|명동성당/i,
    hint: { station: "명동", exit: "8", walk: "Uphill 5 min to the cathedral." },
  },
  {
    match: /namsan|남산|n seoul tower|남산타워|南山/i,
    hint: { station: "명동", exit: "3", walk: "5 min uphill to the Namsan cable car station." },
  },
  {
    match: /namdaemun|남대문|南大門|南大门/i,
    hint: { station: "회현", exit: "5", walk: "Comes out at the market's edge — under 2 min." },
  },
  {
    match: /ddp|동대문디자인|dongdaemun design/i,
    hint: { station: "동대문역사문화공원", exit: "1", walk: "The plaza is directly outside." },
  },
  {
    match: /dongdaemun market|동대문시장|dongdaemun shopping/i,
    hint: { station: "동대문", exit: "8", walk: "Turn right for the night-market malls, about 3 min." },
  },
  {
    match: /hongdae|홍대|弘大|ホンデ/i,
    hint: { station: "홍대입구", exit: "9", walk: "The main street with the buskers is 3 min ahead." },
  },
  {
    match: /yeonnam|연남동|연트럴/i,
    hint: { station: "홍대입구", exit: "3", walk: "Gyeongui Line Forest Park starts right outside." },
  },
  {
    match: /itaewon|이태원|梨泰院/i,
    hint: { station: "이태원", exit: "1", walk: "Comes out on the main strip of restaurants." },
  },
  {
    match: /gyeongnidan|경리단길|haebangchon|해방촌/i,
    hint: { station: "녹사평", exit: "2", walk: "About 8 min uphill — steep but short." },
  },
  {
    match: /garosu|가로수길|カロスキル|林荫道/i,
    hint: { station: "신사", exit: "8", walk: "Garosu-gil begins about 3 min straight ahead." },
  },
  {
    match: /apgujeong rodeo|압구정로데오/i,
    hint: { station: "압구정로데오", exit: "5", walk: "The boutique streets are immediately outside." },
  },
  {
    match: /coex|코엑스|starfield library|별마당/i,
    hint: { station: "삼성", exit: "5", walk: "Underground passage connects straight into the mall — no need to surface." },
  },
  {
    match: /lotte world|롯데월드|ロッテワールド|乐天世界|lotte tower|롯데타워/i,
    hint: { station: "잠실", exit: "1", walk: "Connected underground to the mall and the theme park entrance." },
  },
  {
    match: /seongsu|성수|聖水|圣水/i,
    hint: { station: "성수", exit: "3", walk: "The café and concept-store blocks start 3 min away." },
  },
  {
    match: /seoul forest|서울숲/i,
    hint: { station: "서울숲", exit: "3", walk: "Park entrance is about 5 min on foot." },
  },
  {
    match: /gwanghwamun square|광화문광장|cheonggyecheon|청계천/i,
    hint: { station: "광화문", exit: "2", walk: "Cheonggyecheon's starting plaza is 2 min away." },
  },
  {
    match: /deoksugung|덕수궁|city hall|시청/i,
    hint: { station: "시청", exit: "2", walk: "The palace's stone-wall road is right outside." },
  },
  {
    match: /seoullo|서울로 ?7017/i,
    hint: { station: "서울역", exit: "2", walk: "The elevated walkway starts at the exit." },
  },
  {
    match: /noryangjin|노량진/i,
    hint: { station: "노량진", exit: "1", walk: "Cross the footbridge into the fish market, about 5 min." },
  },
  {
    match: /daehangno|대학로|naksan|낙산/i,
    hint: { station: "혜화", exit: "2", walk: "The theatre street is right outside; Naksan Park is 15 min uphill." },
  },
  {
    match: /mangwon|망원/i,
    hint: { station: "망원", exit: "2", walk: "Mangwon Market is about 5 min ahead." },
  },
  {
    match: /yeouido|여의도 ?한강|여의나루|hangang park/i,
    hint: { station: "여의나루", exit: "2", walk: "The riverside park is directly outside the exit." },
  },
  {
    match: /ttukseom|뚝섬/i,
    hint: { station: "뚝섬유원지", exit: "2", walk: "Straight into the riverside park." },
  },
  {
    match: /war memorial|전쟁기념관/i,
    hint: { station: "삼각지", exit: "12", walk: "The memorial grounds are 3 min away." },
  },
  {
    match: /national museum of korea|국립중앙박물관/i,
    hint: { station: "이촌", exit: "2", walk: "A covered walkway leads to the museum, about 5 min." },
  },
  {
    match: /goto ?mall|고투몰|반포한강|banpo/i,
    hint: { station: "고속터미널", exit: "8-1", walk: "Goto Mall runs underground from here; Banpo river park is 10 min further." },
  },
  {
    match: /euljiro|을지로 ?(?:3가|노가리|골목)/i,
    hint: { station: "을지로3가", exit: "4", walk: "The old print-shop alleys and beer streets start here." },
  },
  {
    match: /konkuk|건대입구|건대 ?맛의거리/i,
    hint: { station: "건대입구", exit: "2", walk: "The food street begins immediately outside." },
  },
];

/** The exit for a named place, when we know it well enough to say so. */
export function exitFor(place: string): ExitHint | undefined {
  const raw = (place ?? "").trim();
  if (!raw) return undefined;
  const n = normalizeName(raw);
  return EXITS.find(({ match }) => match.test(raw) || match.test(n))?.hint;
}

/** One line ready to drop into any card. */
export function exitLine(place: string): string | undefined {
  const h = exitFor(place);
  if (!h) return undefined;
  return `🚪 **Exit ${h.exit}** at ${h.station} Station — ${h.walk}`;
}

/** Does this message look like "which exit do I take?" — in any of our languages. */
export function asksAboutExit(text: string): boolean {
  return /which exit|what exit|exit number|몇 ?번 ?출구|출구 ?(?:어디|번호)|何番出口|出口は|几号出口|幾號出口|哪个出口|哪個出口/i.test(
    text ?? "",
  );
}
