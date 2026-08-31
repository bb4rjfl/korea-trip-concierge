/**
 * The big malls, because "big mall" was answering with a sneaker shop.
 *
 * Asking for a mall in Seoul returned a Musinsa select store, a Chiikawa goods
 * shop and a wellness pharmacy — every one of them filed under "Specialty Shops
 * & Stores" and every one of them the wrong scale of thing. The tourism
 * categories cannot tell a 600-store complex from a boutique, and the words a
 * visitor uses ("mall", "big mall", "department store") match nothing in the
 * Korean names.
 *
 * There are only about a dozen places anyone means, they change on the scale of
 * decades, and what makes each worth the trip is exactly the part an API does not
 * carry — so they are curated, like the station exits.
 */

export interface Mall {
  name: string;
  ko: string;
  area: string;
  /** Why you would go to this one rather than the next one. */
  draw: string;
  /** The station and exit, in the form the signs use. */
  getThere: string;
}

const SEOUL: Mall[] = [
  {
    name: "Starfield COEX Mall",
    ko: "스타필드 코엑스몰",
    area: "Samseong / Gangnam",
    draw:
      "The largest underground mall in Asia — and the reason most people come is the **Starfield Library**, a 13-metre-high open bookshelf that is free to walk into. An aquarium, a cinema, SM Town and a department store are all under the same roof.",
    getThere: "Line 2 Samseong, Exit 5 or 6 — the passage runs straight into the mall, no need to surface.",
  },
  {
    name: "Lotte World Mall",
    ko: "롯데월드몰",
    area: "Jamsil",
    draw:
      "Mall, department store, aquarium, cinema and concert hall stacked under **Lotte World Tower** — the tallest building in Korea, with the Seoul Sky observatory on top. The indoor theme park is next door.",
    getThere: "Lines 2 and 8 Jamsil, Exit 1 or 2 — connected underground.",
  },
  {
    name: "The Hyundai Seoul",
    ko: "더현대 서울",
    area: "Yeouido",
    draw:
      "The newest and the most photographed: a full indoor garden under a glass roof, and a basement food hall that is a destination in itself. Quieter on weekdays.",
    getThere: "Lines 5 and 9 Yeouido, Exit 3 — about 5 min, or a covered walk from IFC.",
  },
  {
    name: "IFC Mall",
    ko: "아이에프씨몰",
    area: "Yeouido",
    draw: "Underground, unhurried, strong on international brands and a big cinema. Pairs with The Hyundai across the road.",
    getThere: "Lines 5 and 9 Yeouido, Exit 3 — directly connected.",
  },
  {
    name: "Times Square",
    ko: "타임스퀘어",
    area: "Yeongdeungpo",
    draw:
      "One of the biggest floor areas in the country, with a department store, a hotel and a cinema inside. Less touristed than Gangnam, which is part of the appeal.",
    getThere: "Line 1 Yeongdeungpo, Exit 3 — about 5 min.",
  },
  {
    name: "Shinsegae Department Store, Main Store",
    ko: "신세계백화점 본점",
    area: "Myeongdong / Hoehyeon",
    draw:
      "The historic flagship — the 1930s building is part of the experience, the basement food hall is one of the best in the city, and the Christmas façade is a Seoul fixture.",
    getThere: "Line 4 Hoehyeon, Exit 7 — connected underground.",
  },
  {
    name: "Lotte Department Store & Young Plaza",
    ko: "롯데백화점 본점 · 영플라자",
    area: "Myeongdong",
    draw:
      "The Myeongdong shopping core: department store, Young Plaza for younger brands, and one of the largest duty-free floors in the city upstairs.",
    getThere: "Line 2 Euljiro 1-ga, Exit 7 — connected directly.",
  },
  {
    name: "Yongsan I'Park Mall",
    ko: "용산 아이파크몰",
    area: "Yongsan",
    draw:
      "Built on top of Yongsan station, so you can walk off a train into it. Electronics on the upper floors, an aquarium and a big cinema — the best rainy-day option near central Seoul.",
    getThere: "Line 1 / Gyeongui–Jungang Yongsan station — the mall is the station building.",
  },
  {
    name: "Doota Mall & Hyundai Outlet Dongdaemun",
    ko: "두타몰 · 현대아울렛 동대문점",
    area: "Dongdaemun",
    draw:
      "Fashion malls that keep night-market hours — some floors run past midnight, which is the whole point of Dongdaemun. Wholesale prices, cash preferred in the older buildings.",
    getThere: "Lines 1 and 4 Dongdaemun, Exit 8, or Dongdaemun History & Culture Park, Exit 14.",
  },
  {
    name: "Goto Mall (Gangnam Terminal Underground)",
    ko: "고투몰",
    area: "Express Bus Terminal",
    draw:
      "600 metres of underground bargain shopping — clothes, shoes, flowers and homeware at a fraction of department-store prices. Cash and small change help; many stalls do not take cards.",
    getThere: "Lines 3, 7 and 9 Express Bus Terminal, Exit 8-1 — the mall is the passage itself.",
  },
];

const BUSAN: Mall[] = [
  {
    name: "Shinsegae Centum City",
    ko: "신세계 센텀시티",
    area: "Haeundae / Centum City",
    draw:
      "Recorded as the largest department store in the world, with a spa, an ice rink and a rooftop garden inside. Genuinely a half-day.",
    getThere: "Busan Line 2 Centum City, Exit 4 — connected underground.",
  },
  {
    name: "Lotte Department Store Gwangbok",
    ko: "롯데백화점 광복점",
    area: "Nampo-dong",
    draw: "Rooftop garden and a musical fountain over the harbour, a short walk from Jagalchi fish market and BIFF Square.",
    getThere: "Busan Line 1 Nampo, Exit 10 — connected.",
  },
];

const OUTSKIRTS =
  "🏙️ **Bigger still, outside the city:** **Starfield Hanam** and **Starfield Goyang** are the largest complexes in the country (about 40 min out), and the **Premium Outlets** at Yeoju and Paju are where the discounted brands are.";

/** Is this about a mall or a department store, rather than a shop? */
export function asksAboutMalls(text: string): boolean {
  return /\bmalls?\b|shopping (?:cent(?:er|re)|complex)|department store|outlet|쇼핑몰|백화점|아울렛|복합쇼핑|モール|百貨店|デパート|アウトレット|[商购購][场場城]|百[货貨]|[奥奧][莱萊]/i.test(
    text ?? "",
  );
}

/** The mall card for whichever city was named. */
export function mallsCard(text: string): string {
  const busan = /busan|부산|釜山|プサン/i.test(text ?? "");
  const list = busan ? BUSAN : SEOUL;
  const city = busan ? "Busan" : "Seoul";
  const lines = list.map(
    (m, i) =>
      `**${i + 1}. ${m.name}** (${m.ko}) · _${m.area}_\n   ${m.draw}\n   🚇 ${m.getThere}`,
  );
  return [
    `🛍️ **The big malls and department stores in ${city}**`,
    "",
    ...lines,
    "",
    ...(busan ? [] : [OUTSKIRTS, ""]),
    "_Department stores open about 10:30–20:00 and close one Monday a month; malls run later. Tax refund desks are on the ground floor — bring your passport._",
  ].join("\n");
}
