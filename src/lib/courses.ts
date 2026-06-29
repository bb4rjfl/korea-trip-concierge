/**
 * Trip-course composition (D-025 enrichment). Builds rich, persona-combinable
 * itineraries (half-day / 1-day / 2-day, Seoul Phase 1) from a curated set of
 * tagged "spots" plus a small set of hand-written signature courses.
 *
 * Data strategy (see docs/07 "수익화/BM 로드맵" sibling note): this is CURATED
 * reference data authored at build time, not a runtime LLM/web call — so it's
 * D-009-safe, instant, key-free, and deterministic (idempotent). Popular patterns
 * are evergreen; only volatile facts would need date-stamps.
 *
 * Pure module: no API, no randomness (stable sort), fully unit-testable.
 */

export type Block = "morning" | "afternoon" | "evening" | "any";
export type Duration = "half-day" | "1-day" | "2-day" | "3-day";
export type City = "Seoul" | "Busan" | "Jeju" | "Gyeongju";

export interface Spot {
  id: string;
  name: string;
  area: string; // neighbourhood (display + clustering)
  zone: string; // coarse cluster to minimise travel within a day
  themes: string[]; // beauty/photo/hanbok/history/food/market/cafe/nature/view/shopping/nightlife/kpop/family/experience
  blocks: Block[]; // best time-of-day
  note: string;
  city?: City; // defaults to Seoul (most spots); Busan/Jeju set explicitly
}

// ── Curated Seoul spots (Phase 1) ───────────────────────────────────────────
export const SEOUL_SPOTS: Spot[] = [
  // Old-north (palaces, hanok, downtown heritage)
  { id: "gyeongbokgung", name: "Gyeongbokgung Palace (+ hanbok)", area: "Gwanghwamun", zone: "old-north", themes: ["history", "hanbok", "photo"], blocks: ["morning", "afternoon"], note: "Korea's grandest palace — free entry in hanbok + changing-of-the-guard." },
  { id: "changdeokgung", name: "Changdeokgung + Secret Garden", area: "Jongno", zone: "old-north", themes: ["history", "nature", "hanbok"], blocks: ["morning", "afternoon"], note: "UNESCO palace; book the Huwon garden tour ahead." },
  { id: "bukchon", name: "Bukchon Hanok Village", area: "Bukchon", zone: "old-north", themes: ["history", "photo", "hanbok"], blocks: ["morning", "afternoon"], note: "Postcard hanok alleys between the palaces — go by day, keep quiet." },
  { id: "insadong", name: "Insadong", area: "Insadong", zone: "old-north", themes: ["history", "shopping", "cafe"], blocks: ["afternoon"], note: "Crafts, teahouses, and the Ssamzigil spiral mall." },
  { id: "ikseon", name: "Ikseon-dong hanok cafés", area: "Ikseon", zone: "old-north", themes: ["cafe", "photo", "food"], blocks: ["afternoon", "evening"], note: "1920s hanok alleys turned pretty cafés and bistros." },
  { id: "tongin", name: "Tongin Market (coin lunchbox)", area: "Seochon", zone: "old-north", themes: ["food", "market", "experience"], blocks: ["afternoon"], note: "Pay with brass coins for a make-your-own yeopjeon dosirak." },
  { id: "gwangjang", name: "Gwangjang Market street food", area: "Jongno", zone: "old-north", themes: ["food", "market"], blocks: ["afternoon", "evening"], note: "Bindaetteok, mayak gimbap, live-octopus stalls." },
  { id: "jogyesa", name: "Jogyesa Temple", area: "Insadong", zone: "old-north", themes: ["history", "experience"], blocks: ["morning", "afternoon"], note: "Downtown Zen temple; spectacular lantern canopies." },
  { id: "cheongwadae", name: "Cheong Wa Dae (Blue House)", area: "Gwanghwamun", zone: "old-north", themes: ["history"], blocks: ["morning", "afternoon"], note: "The former presidential compound — reserve a free slot online." },
  // Central (Myeongdong / Namsan)
  { id: "nseoultower", name: "N Seoul Tower (Namsan)", area: "Namsan", zone: "central", themes: ["view", "nature"], blocks: ["evening"], note: "Cable car up; sunset and night skyline." },
  { id: "myeongdong", name: "Myeongdong shopping + street food", area: "Myeongdong", zone: "central", themes: ["shopping", "beauty", "food"], blocks: ["afternoon", "evening"], note: "Cosmetics flagships, tax-free, evening food carts." },
  { id: "oliveyoung", name: "Olive Young flagship (K-beauty haul)", area: "Myeongdong", zone: "central", themes: ["beauty", "shopping"], blocks: ["afternoon", "evening"], note: "K-beauty everything; tax-free with your passport." },
  { id: "namsangol", name: "Namsangol Hanok Village", area: "Myeongdong", zone: "central", themes: ["history", "hanbok", "family"], blocks: ["afternoon"], note: "Free traditional houses + crafts near Myeongdong." },
  { id: "kpopgoods", name: "K-pop goods shops", area: "Myeongdong", zone: "central", themes: ["kpop", "shopping"], blocks: ["afternoon", "evening"], note: "Albums, photocards, and official merch." },
  // West (Hongdae / Yeonnam)
  { id: "insaengnecut", name: "인생네컷 / profile photo studio", area: "Hongdae", zone: "west", themes: ["photo", "beauty"], blocks: ["afternoon", "evening"], note: "Self-photo booth or a pro profile-photo studio." },
  { id: "nailart", name: "Nail art studio", area: "Hongdae", zone: "west", themes: ["beauty"], blocks: ["afternoon"], note: "World-class Korean nail art — walk-in or same-day." },
  { id: "hongdaeshop", name: "Hongdae shopping & busking street", area: "Hongdae", zone: "west", themes: ["shopping", "kpop", "nightlife"], blocks: ["afternoon", "evening"], note: "Indie fashion, buskers, K-pop goods, cheap eats." },
  { id: "yeonnam", name: "Yeonnam-dong café street", area: "Yeonnam", zone: "west", themes: ["cafe", "food"], blocks: ["afternoon"], note: "Yeontral Park cafés and brunch — calmer than Hongdae." },
  { id: "bbq", name: "Korean BBQ + somaek", area: "Hongdae", zone: "west", themes: ["food", "nightlife"], blocks: ["evening"], note: "Grill samgyeopsal/galbi at the table with soju-beer." },
  // South (Gangnam / Sinsa / Jamsil)
  { id: "hairsalon", name: "Hair & makeup salon", area: "Gangnam", zone: "south", themes: ["beauty"], blocks: ["morning", "afternoon"], note: "English-friendly salons with tourist styling packages." },
  { id: "dermainfo", name: "K-beauty derma/aesthetic (info only)", area: "Gangnam", zone: "south", themes: ["beauty", "experience"], blocks: ["any"], note: "Popular facials/lifting; English consultations at big clinics — info only, no booking (medical law)." },
  { id: "garosugil", name: "Garosu-gil (Sinsa) boutiques & cafés", area: "Sinsa", zone: "south", themes: ["shopping", "cafe"], blocks: ["afternoon"], note: "Tree-lined designer street + dessert cafés." },
  { id: "bongeunsa", name: "Bongeunsa Temple", area: "Gangnam", zone: "south", themes: ["history", "experience"], blocks: ["morning", "afternoon"], note: "1,200-year-old temple facing COEX; English Temple Life Thu." },
  { id: "coexaqua", name: "COEX Aquarium + Starfield Library", area: "Gangnam", zone: "south", themes: ["family", "shopping"], blocks: ["afternoon"], note: "Aquarium + the huge open library — easy indoor combo." },
  { id: "smtown", name: "SMTOWN COEX (K-pop)", area: "Gangnam", zone: "south", themes: ["kpop", "family"], blocks: ["afternoon"], note: "SM artium, goods, and themed café." },
  { id: "lotteworld", name: "Lotte World theme park", area: "Jamsil", zone: "south", themes: ["family"], blocks: ["morning", "afternoon"], note: "Indoor + outdoor park; great on a rainy/cold day." },
  { id: "seoulsky", name: "Lotte World Tower – Seoul Sky", area: "Jamsil", zone: "south", themes: ["view"], blocks: ["evening"], note: "The city's highest night view." },
  // East (Seongsu)
  { id: "seongsu", name: "Seongsu café & concept-store street", area: "Seongsu", zone: "east", themes: ["cafe", "photo", "shopping"], blocks: ["afternoon"], note: "Warehouse cafés, pop-ups, designer concept stores." },
  { id: "seoulforest", name: "Seoul Forest", area: "Seongsu", zone: "east", themes: ["nature", "family"], blocks: ["afternoon"], note: "Leafy park with a deer enclosure and riverside trails." },
  // River / Yongsan / North
  { id: "hangang", name: "Han River park (picnic + chimaek)", area: "Yeouido", zone: "river", themes: ["nature", "family", "food"], blocks: ["afternoon", "evening"], note: "Rent a mat, order fried chicken to the park, watch the fountain." },
  { id: "nationalmuseum", name: "National Museum of Korea", area: "Ichon", zone: "yongsan", themes: ["history", "family"], blocks: ["afternoon"], note: "Free, world-class; the gold crowns and Pensive Bodhisattva." },
  { id: "hybe", name: "HYBE / agency streets (Yongsan)", area: "Yongsan", zone: "yongsan", themes: ["kpop"], blocks: ["afternoon"], note: "HYBE HQ + Insight museum; cafés and goods nearby." },
  { id: "dongdaemun", name: "Dongdaemun (DDP + night malls)", area: "Dongdaemun", zone: "central", themes: ["shopping", "view"], blocks: ["evening"], note: "Spaceship DDP + all-night fashion malls." },
  // Anywhere (experiences)
  { id: "jjimjilbang", name: "Jjimjilbang (Korean spa)", area: "anywhere", zone: "any", themes: ["experience", "nightlife"], blocks: ["evening"], note: "Sauna + sleeping rooms; bring cash, settle the wristband on the way out." },
  { id: "chimaek", name: "Chimaek (fried chicken + beer)", area: "anywhere", zone: "any", themes: ["food", "nightlife"], blocks: ["evening"], note: "The national pairing — order to your hotel or a pub." },
];

// ── Busan spots (Phase 2) ───────────────────────────────────────────────────
export const BUSAN_SPOTS: Spot[] = [
  { id: "b_haeundae", name: "Haeundae Beach", area: "Haeundae", zone: "haeundae", themes: ["nature", "view", "family"], blocks: ["morning", "afternoon", "evening"], note: "Busan's flagship beach; the Blue Line Park beach train & sky capsule nearby.", city: "Busan" },
  { id: "b_gwangalli", name: "Gwangalli Beach & Gwangan Bridge", area: "Gwangalli", zone: "gwangalli", themes: ["view", "nightlife", "cafe"], blocks: ["evening"], note: "Café-and-bar strip facing the lit bridge; weekend drone shows.", city: "Busan" },
  { id: "b_gamcheon", name: "Gamcheon Culture Village", area: "Saha", zone: "saha", themes: ["photo", "history", "view"], blocks: ["morning", "afternoon"], note: "Pastel hillside art village ('Korea's Santorini') — go by day, be respectful.", city: "Busan" },
  { id: "b_jagalchi", name: "Jagalchi Market & Nampo (BIFF)", area: "Nampo", zone: "nampo", themes: ["food", "market"], blocks: ["afternoon", "evening"], note: "Korea's biggest fish market + BIFF Square street food (ssiat-hotteok).", city: "Busan" },
  { id: "b_haedong", name: "Haedong Yonggungsa Temple", area: "Gijang", zone: "gijang", themes: ["history", "view"], blocks: ["morning"], note: "A rare seaside temple on the rocks above the waves — sunrise is magical.", city: "Busan" },
  { id: "b_taejongdae", name: "Taejongdae cliffs + Danubi tram", area: "Yeongdo", zone: "yeongdo", themes: ["nature", "view"], blocks: ["morning", "afternoon"], note: "Coastal cliffs and pine forest; ride the tram between viewpoints.", city: "Busan" },
  { id: "b_oryukdo", name: "Oryukdo Skywalk", area: "Namgu", zone: "namgu", themes: ["view", "nature"], blocks: ["morning", "afternoon"], note: "Glass-floored cliff walkway over the sea; pair with the Igidae trail.", city: "Busan" },
  { id: "b_seomyeon", name: "Seomyeon eats & nightlife", area: "Seomyeon", zone: "seomyeon", themes: ["food", "nightlife", "shopping"], blocks: ["evening"], note: "Downtown crossroads — dwaeji-gukbap, bars, and shopping.", city: "Busan" },
  { id: "b_dwaeji", name: "Dwaeji-gukbap (Busan pork soup)", area: "anywhere", zone: "any", themes: ["food"], blocks: ["any"], note: "Busan's signature pork-and-broth rice; add salted shrimp & chives.", city: "Busan" },
  { id: "b_milmyeon", name: "Milmyeon / fresh hoe by the bay", area: "anywhere", zone: "any", themes: ["food"], blocks: ["afternoon", "evening"], note: "Busan cold wheat noodles, or raw fish (hoe) by the sea.", city: "Busan" },
  { id: "b_huinnyeoul", name: "Huinnyeoul Culture Village", area: "Yeongdo", zone: "yeongdo", themes: ["photo", "view", "cafe"], blocks: ["afternoon"], note: "Cliffside white-wave village over the sea — film-set alleys and ocean-view cafés.", city: "Busan" },
  { id: "b_songdo", name: "Songdo Beach & Cloud Trails cable car", area: "Seogu", zone: "songdo", themes: ["view", "nature", "experience"], blocks: ["afternoon"], note: "Korea's first public beach + a sea-crossing cable car with glass-floor cabins.", city: "Busan" },
  { id: "b_gukje", name: "Gukje Market & BIFF eats", area: "Nampo", zone: "nampo", themes: ["market", "shopping", "food"], blocks: ["afternoon"], note: "Sprawling postwar market next to Jagalchi — bibim-dangmyeon, hotteok, knick-knacks.", city: "Busan" },
  { id: "b_spaland", name: "Spa Land Centum (jjimjilbang)", area: "Centum", zone: "centum", themes: ["experience", "nightlife"], blocks: ["evening"], note: "Upscale spa with 22 baths & themed sauna rooms inside Shinsegae Centum.", city: "Busan" },
  { id: "b_yongdusan", name: "Yongdusan Park & Diamond Tower", area: "Nampo", zone: "nampo", themes: ["view", "history"], blocks: ["afternoon", "evening"], note: "Hilltop park above Nampo with the city's observation tower — escalators up from BIFF.", city: "Busan" },
];

// ── Jeju spots (Phase 2) ────────────────────────────────────────────────────
export const JEJU_SPOTS: Spot[] = [
  { id: "j_seongsan", name: "Seongsan Ilchulbong (Sunrise Peak)", area: "Seongsan", zone: "east", themes: ["nature", "view"], blocks: ["morning"], note: "UNESCO tuff cone; a ~25-min climb, famous for sunrise.", city: "Jeju" },
  { id: "j_manjanggul", name: "Manjanggul Cave", area: "Gujwa", zone: "east", themes: ["nature"], blocks: ["morning", "afternoon"], note: "A walkable UNESCO lava tube — a steady 11°C, bring a jacket.", city: "Jeju" },
  { id: "j_udo", name: "Udo (Cow Island)", area: "Udo", zone: "east", themes: ["nature", "view"], blocks: ["afternoon"], note: "Bike or scooter the islet's white-sand beaches; ferry from Seongsan.", city: "Jeju" },
  { id: "j_seopjikoji", name: "Seopjikoji", area: "Seongsan", zone: "east", themes: ["view", "nature"], blocks: ["afternoon"], note: "Grassy coastal cape with a lighthouse and drama set.", city: "Jeju" },
  { id: "j_cheonjiyeon", name: "Cheonjiyeon Falls", area: "Seogwipo", zone: "seogwipo", themes: ["nature"], blocks: ["afternoon"], note: "Lush Seogwipo waterfall, floodlit in the evening.", city: "Jeju" },
  { id: "j_jusangjeolli", name: "Jusangjeolli Cliffs", area: "Seogwipo", zone: "seogwipo", themes: ["view", "nature"], blocks: ["afternoon"], note: "Hexagonal basalt columns pounded by the surf.", city: "Jeju" },
  { id: "j_osulloc", name: "O'sulloc Tea Museum", area: "Seogwang", zone: "west", themes: ["cafe", "nature"], blocks: ["afternoon"], note: "Green-tea museum & café among the west-Jeju tea fields.", city: "Jeju" },
  { id: "j_hyeopjae", name: "Hyeopjae Beach", area: "Hallim", zone: "west", themes: ["nature", "view"], blocks: ["afternoon"], note: "Turquoise west-coast beach facing Biyangdo islet.", city: "Jeju" },
  { id: "j_hallasan", name: "Hallasan day hike", area: "Central", zone: "central", themes: ["nature"], blocks: ["morning"], note: "Korea's highest peak; strict trail cutoffs — start early.", city: "Jeju" },
  { id: "j_dongmun", name: "Dongmun Market + black-pork street", area: "Jeju City", zone: "jeju-city", themes: ["food", "market"], blocks: ["evening"], note: "Night market + heuk-dwaeji (black pork) BBQ.", city: "Jeju" },
  { id: "j_galchi", name: "Jeju black pork / galchi / abalone", area: "anywhere", zone: "any", themes: ["food"], blocks: ["any"], note: "Heuk-dwaeji BBQ, braised cutlassfish, abalone porridge.", city: "Jeju" },
  { id: "j_camellia", name: "Camellia Hill garden", area: "Andeok", zone: "west", themes: ["nature", "photo", "cafe"], blocks: ["afternoon"], note: "Seasonal flower arboretum — camellias in winter, hydrangeas in summer; very photogenic.", city: "Jeju" },
  { id: "j_yongduam", name: "Yongduam (Dragon Head Rock) & Iho Tewoo", area: "Jeju City", zone: "jeju-city", themes: ["view", "nature"], blocks: ["afternoon", "evening"], note: "Lava-rock sea cliff + the candy-striped horse lighthouses of Iho beach at sunset.", city: "Jeju" },
  { id: "j_saryeoni", name: "Saryeoni Forest trail", area: "Jocheon", zone: "central", themes: ["nature", "experience"], blocks: ["morning", "afternoon"], note: "A flat, dreamy cedar-and-cypress forest walk — easy 'healing' stroll, no hike needed.", city: "Jeju" },
  { id: "j_hamdeok", name: "Hamdeok Seowoo Beach", area: "Jocheon", zone: "east", themes: ["nature", "view", "cafe"], blocks: ["afternoon"], note: "Turquoise east-coast beach with shallow water and seaside cafés (Delmoondo nearby).", city: "Jeju" },
];

// ── Gyeongju spots (Phase 3) — Korea's open-air museum, a culture/history magnet ──
export const GYEONGJU_SPOTS: Spot[] = [
  { id: "g_bulguksa", name: "Bulguksa Temple", area: "Tohamsan", zone: "bulguk", themes: ["history", "experience"], blocks: ["morning", "afternoon"], note: "UNESCO Silla masterpiece — stone bridges and twin pagodas; pair with Seokguram.", city: "Gyeongju" },
  { id: "g_seokguram", name: "Seokguram Grotto", area: "Tohamsan", zone: "bulguk", themes: ["history", "view"], blocks: ["morning"], note: "Hilltop granite Buddha gazing at the sunrise sea — a short walk above Bulguksa.", city: "Gyeongju" },
  { id: "g_daereungwon", name: "Daereungwon Tomb Complex (Cheonmachong)", area: "Downtown", zone: "downtown", themes: ["history", "photo"], blocks: ["morning", "afternoon"], note: "Grassy royal burial mounds you can walk among; enter one excavated tomb.", city: "Gyeongju" },
  { id: "g_cheomseongdae", name: "Cheomseongdae Observatory", area: "Downtown", zone: "downtown", themes: ["history", "photo"], blocks: ["afternoon", "evening"], note: "Asia's oldest surviving observatory; flower fields around it in season.", city: "Gyeongju" },
  { id: "g_wolji", name: "Donggung Palace & Wolji Pond", area: "Downtown", zone: "downtown", themes: ["history", "view", "photo"], blocks: ["evening"], note: "Reflected pavilions floodlit after dark — Gyeongju's iconic night view.", city: "Gyeongju" },
  { id: "g_woljeonggyo", name: "Woljeonggyo Bridge", area: "Downtown", zone: "downtown", themes: ["history", "photo", "view"], blocks: ["evening"], note: "Reconstructed Silla covered bridge, beautifully lit over the river at night.", city: "Gyeongju" },
  { id: "g_hwangnidan", name: "Hwangnidan-gil café street", area: "Hwangnam", zone: "downtown", themes: ["cafe", "food", "photo"], blocks: ["afternoon"], note: "Hanok-lined 'Gyeongju's Garosu-gil' — ssambap, tenmun bread, and pretty cafés.", city: "Gyeongju" },
  { id: "g_museum", name: "Gyeongju National Museum", area: "Downtown", zone: "downtown", themes: ["history", "family"], blocks: ["afternoon"], note: "Free; the Emille Bell and Silla gold crowns — the best primer on the kingdom.", city: "Gyeongju" },
  { id: "g_bomun", name: "Bomun Lake resort & cherry road", area: "Bomun", zone: "bomun", themes: ["nature", "view", "family"], blocks: ["afternoon", "evening"], note: "Lakeside cycling and Korea's most famous cherry-blossom drive in spring.", city: "Gyeongju" },
  { id: "g_yangdong", name: "Yangdong Folk Village", area: "Gangdong", zone: "yangdong", themes: ["history", "experience"], blocks: ["morning", "afternoon"], note: "UNESCO living Joseon village of thatched and tiled clan houses.", city: "Gyeongju" },
  { id: "g_ssambap", name: "Gyeongju ssambap & hwangnam-bread", area: "anywhere", zone: "any", themes: ["food"], blocks: ["any"], note: "Wrap-rice feast of many side dishes; red-bean hwangnam-bbang to take away.", city: "Gyeongju" },
];

export const ALL_SPOTS: Spot[] = [...SEOUL_SPOTS, ...BUSAN_SPOTS, ...JEJU_SPOTS, ...GYEONGJU_SPOTS];
const cityOf = (s: Spot): City => s.city ?? "Seoul";

// ── Personas → preferred themes (ordered = weight) ──────────────────────────
export interface PersonaDef {
  key: string;
  label: string;
  emoji: string;
  match: RegExp;
  themes: string[];
}
export const PERSONA_DEFS: PersonaDef[] = [
  { key: "beauty", label: "K-beauty & photo", emoji: "💄", match: /20s?|twenties|young|wom[ae]n|girl|female|lady|beauty|skincare|make ?up|hair|nail|photo|뷰티|화장|미용|여자|여성/i, themes: ["beauty", "photo", "hanbok", "cafe", "shopping", "food"] },
  { key: "family", label: "Family", emoji: "👨‍👩‍👧", match: /famil|kids?|child|toddler|parents?|가족|아이|어린이/i, themes: ["family", "history", "nature", "hanbok", "view"] },
  { key: "couple", label: "Couple", emoji: "💑", match: /couple|honeymoon|romantic|date|anniversary|커플|연인|데이트|신혼/i, themes: ["view", "cafe", "hanbok", "nature", "food", "nightlife"] },
  { key: "kpop", label: "K-pop fan", emoji: "🎤", match: /k-?pop|kpop|hallyu|idol|fan|concert|아이돌|팬|콘서트|굿즈/i, themes: ["kpop", "shopping", "food", "photo", "hanbok"] },
  { key: "foodie", label: "Foodie", emoji: "🍜", match: /food(ie)?|eat|cuisine|gourmet|미식|맛집|먹/i, themes: ["food", "market", "cafe", "nightlife"] },
  { key: "culture", label: "Culture & history", emoji: "🏛️", match: /history|historic|culture|tradition|heritage|temple|palace|museum|senior|역사|문화|전통|시니어/i, themes: ["history", "hanbok", "experience", "market", "nature"] },
  { key: "nightlife", label: "Nightlife", emoji: "🍻", match: /night ?life|party|partygoer|club(bing)?|pub|bar ?hop|유흥|클럽|술|밤/i, themes: ["nightlife", "food", "view", "cafe"] },
  { key: "nature", label: "Nature & healing", emoji: "🌿", match: /nature|healing|hiking?|outdoor|forest|mountain|자연|힐링|등산|숲|산/i, themes: ["nature", "view", "experience", "cafe", "food"] },
  { key: "solo", label: "Solo traveler", emoji: "🎒", match: /solo|alone|by myself|혼자|혼행|nomad|backpack/i, themes: ["cafe", "food", "history", "view", "experience", "nature"] },
  { key: "budget", label: "Budget", emoji: "💸", match: /budget|cheap|저렴|가성비|shoestring|student|free things/i, themes: ["market", "food", "history", "nature", "view"] },
];
const GENERIC_THEMES = ["history", "view", "food", "market", "shopping", "nature", "hanbok"]; // first-timer classics

/** Parse a combinable persona string ("20s woman, foodie") → matched persona defs. */
export function resolvePersonas(input: string): PersonaDef[] {
  const parts = (input ?? "").split(/[,&+/]| and /i).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: PersonaDef[] = [];
  for (const part of parts.length ? parts : [input ?? ""]) {
    for (const d of PERSONA_DEFS) {
      if (d.match.test(part) && !seen.has(d.key)) {
        seen.add(d.key);
        out.push(d);
      }
    }
  }
  return out;
}

/** Ordered, de-duped wanted themes from personas (+ explicit themes first). */
export function wantedThemes(personas: PersonaDef[], explicit: string[]): string[] {
  const out: string[] = [];
  const push = (t: string) => { const k = t.toLowerCase().trim(); if (k && !out.includes(k)) out.push(k); };
  explicit.forEach(push);
  // interleave persona themes so a combo ("beauty"+"foodie") blends rather than one dominating
  const lists = personas.length ? personas.map((p) => p.themes) : [GENERIC_THEMES];
  for (let i = 0; i < 8; i++) for (const l of lists) if (l[i]) push(l[i]);
  return out;
}

function score(spot: Spot, themes: string[]): number {
  let s = 0;
  spot.themes.forEach((t) => {
    const idx = themes.indexOf(t);
    if (idx >= 0) s += Math.max(1, 6 - idx); // earlier wanted theme → higher
  });
  return s;
}

export interface Stop {
  block: string; // display label
  spot: Spot;
  alt?: Spot;
}
export interface DayPlan {
  title: string;
  stops: Stop[];
}

const BLOCK_LABEL: Record<string, string> = { morning: "🌅 Morning", afternoon: "☀️ Afternoon", evening: "🌃 Evening", lunch: "🍜 Lunch / market", food: "🍽️ Eat" };

function fits(spot: Spot, block: Block): boolean {
  if (block === "any") return true;
  return spot.blocks.includes(block) || spot.blocks.includes("any");
}

/** Build one day from a candidate pool, filling the given block template. */
function buildDay(title: string, pool: Spot[], themes: string[], template: { key: string; block: Block; food?: boolean }[], used: Set<string>): DayPlan {
  const ranked = [...pool].sort((a, b) => score(b, themes) - score(a, themes) || a.id.localeCompare(b.id));
  const stops: Stop[] = [];
  for (const slot of template) {
    const ok = ranked.filter((s) => !used.has(s.id) && fits(s, slot.block) && (!slot.food ? true : s.themes.includes("food") || s.themes.includes("market")));
    if (!ok.length) continue;
    const pick = ok[0];
    used.add(pick.id);
    const alt = ok.find((s) => !used.has(s.id) && s.id !== pick.id);
    if (alt) used.add(alt.id);
    stops.push({ block: BLOCK_LABEL[slot.key] ?? slot.key, spot: pick, alt });
  }
  return { title, stops };
}

const ONE_DAY_TEMPLATE: { key: string; block: Block; food?: boolean }[] = [
  { key: "morning", block: "morning" },
  { key: "lunch", block: "afternoon", food: true },
  { key: "afternoon", block: "afternoon" },
  { key: "evening", block: "evening" },
];
const HALF_DAY_TEMPLATE: { key: string; block: Block; food?: boolean }[] = [
  { key: "morning", block: "any" },
  { key: "food", block: "any", food: true },
  { key: "afternoon", block: "any" },
];

/** Top zones in a city by total theme score (so each day clusters to minimise travel). */
function rankZones(themes: string[], city: City): string[] {
  const byZone = new Map<string, number>();
  for (const s of ALL_SPOTS) {
    if (cityOf(s) !== city || s.zone === "any") continue;
    byZone.set(s.zone, (byZone.get(s.zone) ?? 0) + score(s, themes));
  }
  return [...byZone.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([z]) => z);
}

const SPOT_BY_ID = new Map(ALL_SPOTS.map((s) => [s.id, s]));

// Hand-tuned "golden" 1-day courses for the marquee single personas (the
// signature half of the hybrid). Combos and other durations use the engine.
const SIGNATURES: Record<string, { block: string; id: string }[]> = {
  "beauty:1-day": [
    { block: "🌅 Morning", id: "gyeongbokgung" },
    { block: "🍜 Lunch / market", id: "gwangjang" },
    { block: "☕ Afternoon", id: "seongsu" },
    { block: "📸 Photo", id: "insaengnecut" },
    { block: "🌃 Evening", id: "myeongdong" },
  ],
  "family:1-day": [
    { block: "🌅 Morning", id: "gyeongbokgung" },
    { block: "🍜 Lunch / market", id: "gwangjang" },
    { block: "☀️ Afternoon", id: "coexaqua" },
    { block: "🌃 Evening", id: "hangang" },
  ],
  "kpop:1-day": [
    { block: "🌅 Morning", id: "hybe" },
    { block: "🛍️ Afternoon", id: "hongdaeshop" },
    { block: "🍜 Eat", id: "gwangjang" },
    { block: "🌃 Evening", id: "bbq" },
  ],
  "foodie:1-day": [
    { block: "🌅 Morning / market", id: "gwangjang" },
    { block: "🍜 Lunch", id: "tongin" },
    { block: "☕ Afternoon", id: "yeonnam" },
    { block: "🌃 Evening", id: "bbq" },
  ],
  "culture:1-day": [
    { block: "🌅 Morning", id: "changdeokgung" },
    { block: "🏯 Then", id: "bukchon" },
    { block: "🍜 Lunch / market", id: "gwangjang" },
    { block: "☀️ Afternoon", id: "insadong" },
    { block: "🏺 Evening", id: "nationalmuseum" },
  ],
  "couple:1-day": [
    { block: "🌅 Morning", id: "bukchon" },
    { block: "👘 Then", id: "gyeongbokgung" },
    { block: "🍜 Lunch / market", id: "gwangjang" },
    { block: "☕ Afternoon", id: "ikseon" },
    { block: "🌃 Evening", id: "nseoultower" },
  ],
};

export interface Course {
  days: DayPlan[];
  themes: string[];
}

/** Compose a course for the (personas, duration, themes, city) request. */
export function composeCourse(personas: PersonaDef[], duration: Duration, explicitThemes: string[], city: City = "Seoul"): Course {
  const themes = wantedThemes(personas, explicitThemes);
  const zones = rankZones(themes, city);
  const used = new Set<string>();
  const inZones = (zs: string[]) => ALL_SPOTS.filter((s) => cityOf(s) === city && (zs.includes(s.zone) || s.zone === "any"));
  const band = (i: number) => (zones.slice(i, i + 2).length ? zones.slice(i, i + 2) : zones.slice(0, 2)); // a day's 1-2 adjacent zones
  const days: DayPlan[] = [];

  if (duration === "half-day") {
    days.push(buildDay("Half-day", inZones(zones.slice(0, 1).length ? zones.slice(0, 1) : zones), themes, HALF_DAY_TEMPLATE, used));
  } else if (duration === "2-day") {
    days.push(buildDay("Day 1", inZones(band(0)), themes, ONE_DAY_TEMPLATE, used));
    days.push(buildDay("Day 2", inZones(band(2)), themes, ONE_DAY_TEMPLATE, used));
  } else if (duration === "3-day") {
    days.push(buildDay("Day 1", inZones(band(0)), themes, ONE_DAY_TEMPLATE, used));
    days.push(buildDay("Day 2", inZones(band(2)), themes, ONE_DAY_TEMPLATE, used));
    days.push(buildDay("Day 3", inZones(band(4)), themes, ONE_DAY_TEMPLATE, used));
  } else {
    // 1-day: Seoul single-persona signature (golden), else engine.
    const sig = city === "Seoul" && personas.length === 1 ? SIGNATURES[`${personas[0].key}:1-day`] : undefined;
    if (sig) {
      const stops = sig.map((x) => ({ block: x.block, spot: SPOT_BY_ID.get(x.id)! })).filter((st) => st.spot);
      days.push({ title: "1-day", stops });
    } else {
      days.push(buildDay("1-day", inZones(band(0)), themes, ONE_DAY_TEMPLATE, used));
    }
  }
  return { days, themes };
}
