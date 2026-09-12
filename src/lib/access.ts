/**
 * How the last stretch to a destination actually goes.
 *
 * A straight line is the wrong measure for a place on a mountain. Asked for a
 * route from a Myeongdong hotel to N Seoul Tower, the phone said "walk 1.1 km,
 * about 15 minutes — quicker than a train": 1.1 km as the crow flies, and a
 * 30–40 minute climb up Namsan on foot. Every map app sends people up on the
 * circular bus or the cable car, and so should we.
 *
 * This is knowledge about the destination, not about the traveller — the same
 * wherever they start — so it can live on the server and travel with a route
 * the phone plans (src/lib/deviceTask.ts), and it also finishes a route the
 * server plans between named places. Curated (D-009): a short list of the
 * places visitors ask for where the last leg is a bus, a climb or a ferry.
 */

export interface Access {
  /** The names a traveller uses for it, in our four languages. */
  keys: RegExp;
  /** The station a trip ends at before the last leg (Korean, as the planner writes it). */
  gateway?: string;
  /** On a mountain, a hill or up long steps: never offered as a flat walk. */
  climb?: boolean;
  /** The last leg, in English — translated with the rest of the answer. */
  note: string;
}

const ACCESS: Access[] = [
  // Seoul
  {
    // Not Namsangol Hanok Village, which is at the foot of the hill by Chungmuro.
    keys: /n\s*seoul\s*tower|namsan(?!gol|\s*hanok)|남산(?!골|동)|n서울타워|南山(?!谷|韩屋|韓屋)|n首尔塔|n首爾塔|ソウルタワー/i,
    gateway: "명동",
    climb: true,
    note: "**N Seoul Tower sits on top of Namsan.** From **Myeongdong Station**, ride the **Namsan circular bus 01A or 01B** up to the tower, or walk about 10 min from Exit 3 to the **Namsan Cable Car**. Walking up is a steep 30–40 min.",
  },
  {
    keys: /naksan|낙산|ihwa|이화\s*(?:벽화)?마을|駱山|骆山|梨花洞/i,
    gateway: "혜화",
    climb: true,
    note: "**Naksan Park and Ihwa Mural Village are on a steep hill.** From **Hyehwa Station Exit 2** it is a 15–20 min uphill walk; the **Jongno 03** village bus goes most of the way up.",
  },
  {
    keys: /bukhansan|북한산|北漢山|北汉山|baegundae|백운대/i,
    gateway: "구파발",
    climb: true,
    note: "**Bukhansan is a mountain hike.** From **Gupabal Station Exit 1**, bus **704** or **34** reaches the Bukhansanseong trailhead in about 10 min. Allow 3–4 hours up and back, and start early.",
  },
  {
    keys: /inwangsan|인왕산|仁王山/i,
    gateway: "독립문",
    climb: true,
    note: "**Inwangsan is a hike.** The trail starts about 10 min uphill from **Dongnimmun Station Exit 2**; the summit is roughly an hour from there.",
  },
  {
    keys: /namhansanseong|남한산성|南漢山城|南汉山城/i,
    gateway: "산성",
    climb: true,
    note: "**Namhansanseong is a mountain fortress.** From **Sanseong Station Exit 2**, bus **9** or **52** climbs to the fortress in about 15 min.",
  },
  // Busan
  {
    keys: /gamcheon|감천|甘川/i,
    gateway: "토성",
    climb: true,
    note: "**Gamcheon Culture Village covers a steep hillside.** From **Toseong Station Exit 6**, the village buses **Saha 1-1**, **Seogu 2** or **Seogu 2-2** go up in about 10 min; on foot it is a 20+ min climb.",
  },
  {
    keys: /huinnyeoul|흰여울|白浅滩|白淺灘/i,
    gateway: "남포",
    climb: true,
    note: "**Huinnyeoul Culture Village runs along a cliff, with steps.** From **Nampo Station**, bus **7**, **71** or **508** takes about 15 min.",
  },
  {
    keys: /haedong\s*yonggung|해동용궁사|海東龍宮寺|海东龙宫寺/i,
    gateway: "해운대",
    note: "**Haedong Yonggungsa is on the coast north of Haeundae.** From **Haeundae Station Exit 7**, bus **181** takes about 30 min.",
  },
  {
    keys: /taejongdae|태종대|太宗台/i,
    gateway: "남포",
    note: "**Taejongdae is at the tip of Yeongdo.** From **Nampo Station**, bus **8**, **30** or **66** runs to the Taejongdae terminus (about 30 min); the Danubi train loops the park.",
  },
  // Jeju — no subway, so the last leg is the whole trip.
  {
    // Not Seongsan-dong in Seoul, and not every building with 우도 in its name.
    keys: /seongsan\s*il|성산\s*일출봉|城山日出峰|城山日出峯|\budo\b|우도(?=\s|$|섬|로|에|까지|가)|牛岛|牛島/i,
    climb: true,
    note: "**Seongsan Ilchulbong is on Jeju's east tip.** From Jeju Airport or the Jeju Bus Terminal, express bus **111** takes about 1 h 30 (local bus **201** about 2 h) to 성산일출봉입구; the climb to the crater rim is 25–30 min. For **Udo**, go on to Seongsan Port and take the ferry (bring your passport).",
  },
  {
    keys: /hallasan|한라산|漢拏山|汉拿山|seongpanak|성판악|gwaneumsa|관음사|eorimok|어리목|yeongsil|영실/i,
    climb: true,
    note: "**Hallasan is a full-day hike.** From Jeju City, bus **281** reaches the **Seongpanak** trailhead in about 40 min (bus **240** for Eorimok and Yeongsil). Hiking to the summit needs an **online reservation**, and trails close early in the afternoon.",
  },
  {
    keys: /hyeopjae|협재|挟才|挾才|hallim\s*park|한림공원|翰林公园|翰林公園/i,
    note: "**Hyeopjae Beach and Hallim Park are on Jeju's west coast.** From Jeju City, bus **202** takes about 1 h (express **102** is quicker).",
  },
  {
    keys: /jungmun|중문|中文(?:旅游|観光|观光)|cheonjeyeon|천제연/i,
    note: "**Jungmun is on Jeju's south coast.** From Jeju Airport, the **600** airport limousine bus takes about 1 h.",
  },
  // Gyeongju
  {
    keys: /seokguram|석굴암|石窟庵/i,
    climb: true,
    note: "**Seokguram is up the mountain above Bulguksa.** Bus **12** runs from Bulguksa in about 15 min; from the car park it is a 15 min walk.",
  },
  {
    keys: /bulguksa|불국사|佛国寺|佛國寺/i,
    note: "**Bulguksa is outside central Gyeongju.** From Gyeongju Station or the bus terminal, bus **10** or **11** takes about 40 min.",
  },
  // Gangwon. The national bus feed has no stops at all east of the mountains, so
  // for these three places this note is the whole answer, not a footnote to one.
  {
    keys: /jeongdongjin|정동진|正東津|正东津/i,
    note: "**Jeongdongjin is reached by train, not by subway.** From **Gangneung Station** it is about 20 min on the Donghae line — only a handful of trains a day, so check times in the **Korail Talk** app or at the station before you set out.",
  },
  {
    keys: /seorak|설악|雪岳|sinheungsa|신흥사|gwongeumseong|권금성/i,
    climb: true,
    note: "**Seoraksan is a mountain park.** From **Sokcho Intercity Bus Terminal**, local bus **7** or **7-1** reaches **Sogongwon**, the park entrance, in about 30–40 min; the cable car to Gwongeumseong goes up from there.",
  },
  {
    keys: /nami\s*island|남이섬|南怡岛|南怡島|ナミ島/i,
    note: "**Nami Island is reached by ferry.** Take the ITX-Cheongchun or Gyeongchun line to **Gapyeong Station**, then a shuttle bus or taxi about 10 min to the wharf, and the ferry across takes 5 min.",
  },
];

/** How the last leg to a named destination goes, when it is one we know needs telling. */
export function accessFor(place: string): Access | undefined {
  const p = (place ?? "").trim();
  return p ? ACCESS.find((a) => a.keys.test(p)) : undefined;
}
