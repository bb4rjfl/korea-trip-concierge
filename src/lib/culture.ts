/**
 * The two questions a guidebook answers and a search engine answers badly: how to
 * behave, and whether the country is usable if you cannot climb stairs.
 *
 * QA found us refusing both — "I can't provide information about social etiquette"
 * to a visitor asking how not to cause offence, and a request for the origin
 * station to a wheelchair user asking whether the subway is accessible. Both are
 * squarely the "Korean context a foreigner cannot infer" this service exists for,
 * and both are stable enough to curate rather than fetch.
 */

export interface Card {
  title: string;
  intro: string;
  sections: { heading: string; points: string[] }[];
  closing?: string;
}

const ETIQUETTE: Card = {
  title: "🙇 Manners in Korea — the ones that actually come up",
  intro:
    "Nobody expects a visitor to get everything right, and mistakes are forgiven easily. These are the few that people notice.",
  sections: [
    {
      heading: "Hands, age and drinks",
      points: [
        "**Give and receive with two hands** — money, a card, a bag, a drink. One hand with the other touching your forearm is the casual version.",
        "**Never pour your own drink.** Fill other people's glasses; someone will fill yours. Pour for the oldest person first.",
        "When an older person pours for you, **hold your glass with both hands**; when you drink, turn slightly away from them.",
        "Wait for the eldest at the table to start eating.",
      ],
    },
    {
      heading: "At the table",
      points: [
        "**Don't stand chopsticks upright in rice** — that is how rice is offered to the dead.",
        "Rice and soup are eaten with the **spoon**, side dishes with chopsticks. The bowl stays on the table; you don't lift it.",
        "Side dishes (**반찬**) are free and refillable — ask for more, don't take a whole extra portion you won't finish.",
        "Blowing your nose at the table is genuinely offensive; step away.",
        "To call staff, say **\"저기요\"** (jeo-gi-yo) or press the table buzzer. Don't wave or click.",
      ],
    },
    {
      heading: "Money",
      points: [
        "**Do not tip.** Not in restaurants, taxis, hotels or salons. It isn't stingy — a tip causes confusion and is often refused or chased after you.",
        "Someone will usually pay for the whole table rather than split; offering to pay next time is the normal response.",
      ],
    },
    {
      heading: "Out in public",
      points: [
        "**Priority seats** on the subway (marked, usually at the car ends) stay empty even when the train is packed. Sitting there as a young, able traveller is the single most visible mistake.",
        "Take your **backpack off** in a crowded train and hold it low.",
        "Phone calls on transit are kept short and quiet.",
        "**Shoes off** in homes, guesthouses, temples, and any restaurant with floor seating — look for a step up and a shoe rack.",
        "**Eating while walking** is mildly frowned on, except at markets and festivals, where it is the whole point.",
        "**Public bins are rare.** Carry rubbish until you find one, or leave street-food waste at the stall you bought it from.",
        "**Smoking** only in marked areas; fines are enforced, including outside many subway exits.",
      ],
    },
    {
      heading: "Photos and bodies",
      points: [
        "Ask before photographing people, and keep your voice down in hanok neighbourhoods like Bukchon — people live there, and the signs asking for quiet are serious.",
        "**Tattoos** are fine in daily life; some **jjimjilbang** and public pools still ask you to cover them.",
      ],
    },
  ],
  closing:
    "If you get something wrong, a short bow and **\"죄송합니다\"** (joe-song-hab-ni-da) closes it. Effort counts for far more than accuracy.",
};

const ACCESSIBILITY: Card = {
  title: "♿ Getting around Korea with limited mobility",
  intro:
    "Seoul is one of the more wheelchair-navigable large cities in Asia — the subway in particular was retrofitted deliberately — but the gaps are specific and worth knowing before you set out.",
  sections: [
    {
      heading: "Subway",
      points: [
        "**Almost every Seoul station has a lift** to street level, and every station has at least one step-free route. Look for the lift symbol on the station map at the entrance.",
        "There is a **wide gate** at the end of every gate line for wheelchairs and large luggage — the staff office is beside it.",
        "**Platform intercoms** connect to the station office; staff bring a ramp for the platform gap if you ask. It is a normal, routine request.",
        "Older stations occasionally have only a **stair lift** rather than a lift — slow, and staff have to operate it.",
      ],
    },
    {
      heading: "Buses and taxis",
      points: [
        "**Low-floor buses** with a ramp are marked with a wheelchair symbol on the front; they are common on trunk routes but not universal on the small green ones.",
        "**Call taxis for disabled passengers** (장애인콜택시) exist in every city but generally require prior registration and residency — visitors usually cannot book them.",
        "A regular taxi takes a folding wheelchair in the boot; a powerchair will not fit.",
      ],
    },
    {
      heading: "Sights",
      points: [
        "**Gyeongbokgung, Changdeokgung and Deoksugung** are mostly flat, but the surface is gravel — passable and tiring. All three **lend wheelchairs free** at the ticket office.",
        "**Museums and department stores** are fully accessible and have accessible toilets; the National Museum of Korea is a good rainy-day option.",
        "**Bukchon and Ihwa Mural Village are steeply sloped** — beautiful and genuinely hard going.",
      ],
    },
    {
      heading: "Planning help",
      points: [
        "**Danurim (무장애 관광, danuri.visitseoul.net)** publishes step-free routes and venue-by-venue access details for Seoul.",
        "The Korea Tourism Organization publishes accessible-travel itineraries at **english.visitkorea.or.kr**.",
        "**1330** (24h, multilingual) will call a venue and ask about steps, lifts or a ramp before you travel.",
      ],
    },
  ],
  closing:
    "Foreign disability cards are not part of the Korean registration system, so discounts are inconsistent — bring your card and passport and ask; palaces and national museums often accept them.",
};

/** Is this a question about how to behave? */
export function asksAboutEtiquette(text: string): boolean {
  return /etiquette|manners|rude|offend|customs?\b|taboo|culture shock|what should i (?:not )?do|dos and don|tip(?:ping)?\b|bow(?:ing)?\b|chopstick|shoes off|예의|매너|실례|에티켓|팁\s*(?:줘|주나|문화)|マナー|礼儀|失礼|チップ|礼节|禮節|禮儀|小费|小費|忌讳|忌諱/i.test(
    text ?? "",
  );
}

/** Is this a question about accessible travel? */
export function asksAboutAccess(text: string): boolean {
  return /wheelchair|accessib|disabled|disabilit|step.?free|barrier.?free|mobility (?:scooter|aid|issues)|elevator|lift access|crutches|walker\b|휠체어|장애인|무장애|배리어프리|엘리베이터.*(있|되)|車椅子|バリアフリー|障害者|轮椅|輪椅|无障碍|無障礙/i.test(
    text ?? "",
  );
}

export function renderCard(c: Card): string {
  const body = c.sections
    .map((s) => [`**${s.heading}**`, ...s.points.map((p) => `- ${p}`)].join("\n"))
    .join("\n\n");
  return [c.title, "", c.intro, "", body, c.closing ? `\n💡 ${c.closing}` : ""].filter(Boolean).join("\n");
}

export const ETIQUETTE_CARD = ETIQUETTE;
export const ACCESSIBILITY_CARD = ACCESSIBILITY;
