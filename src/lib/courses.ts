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

import { isEmptyProfile, type TravelProfile } from "./profile.js";

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
  { id: "ihwa", name: "Ihwa Mural Village + Naksan Wall", area: "Ihwa-dong", zone: "central", themes: ["photo", "view", "history"], blocks: ["afternoon", "evening"], note: "Hillside murals and the old city wall with a sweeping sunset city view — a short climb above Dongdaemun." },
  { id: "cheonggyecheon", name: "Cheonggyecheon Stream walk", area: "Jongno", zone: "old-north", themes: ["nature", "view", "experience"], blocks: ["afternoon", "evening"], note: "A restored downtown stream — a cool, lantern-lit evening stroll through the city centre." },
  { id: "euljirobars", name: "Euljiro 'Hipjiro' bars", area: "Euljiro", zone: "central", themes: ["nightlife", "cafe", "food"], blocks: ["evening"], note: "Speakeasy bars and retro 'newtro' cafés hidden up worn stairwells in the old printing district." },
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
  // The curated spots carry a hand-written reason to go; a live entry carries a
  // category. On equal theme fit the written one is the better recommendation.
  let s = /^(?:vs_|ta_)/.test(spot.id) ? 0 : 2;
  // A live listing that arrived without an address cannot be clustered, so it
  // matches every part of the city and a day built around them zig-zags across
  // Seoul. Let them fill gaps, not lead the day.
  if (spot.zone === "any" && /^(?:vs_|ta_)/.test(spot.id)) s -= 1;
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

/**
 * Is this stop somewhere you stay dry?
 *
 * QA found the "it's pouring rain all day" course returning a hillside mural
 * village and a stream walk — the theme label changed, the itinerary did not.
 * Palaces, hanok villages, parks and street markets are open-air in practice, so
 * only genuinely sheltered venues qualify.
 */
export function isIndoorSpot(spot: Spot): boolean {
  const hay = `${spot.name} ${spot.note ?? ""}`;
  if (/palace|village|park|stream|trail|market|street|walk|garden|fortress|tower|bridge|river|island|beach|hanok|해변|공원|시장|거리|산책/i.test(hay)) {
    return /mall|museum|aquarium|department|indoor|underground|library|실내|박물관|미술관/i.test(hay);
  }
  if (/museum|gallery|aquarium|mall|department|library|cafe|café|spa|jjimjilbang|sauna|store|shop|arcade|cinema|theater|theatre|observatory|박물관|미술관|백화점|쇼핑/i.test(hay)) return true;
  return spot.themes.includes("cafe") || spot.themes.includes("beauty") || spot.themes.includes("shopping");
}
/**
 * Places a visitor with a bad knee should not be sent to.
 *
 * "Bukchon is a 10-minute uphill walk" is charming in a guidebook and
 * disqualifying for someone travelling with a parent who walks slowly — and they
 * told us so.
 */
export const STRENUOUS = /uphill|steep|hike|hiking|trail|climb|mountain|stairs|summit|slope|등산|언덕|계단|가파/i;

/**
 * Places whose whole point is spending money — plus the paid attractions that
 * cost more than a budget traveller's whole day.
 *
 * Someone who wrote "we're on a budget" was being handed Lotte World (₩62,000)
 * and KidZania (₩50,000+) as their morning. Naming the big-ticket attractions is
 * blunter than a price feed we do not have, and it is right about the ones that
 * actually come up.
 */
export const PRICEY =
  /department store|duty.?free|\bmalls?\b|luxury|boutique|\bspa\b|백화점|면세|명품|theme ?park|amusement ?park|water ?park|aquarium|observator|observation deck|cruise|ski resort|lotte world|everland|kidzania|seoul sky|n seoul tower/i;

/** Stops whose entire reason to exist is the meat on the grill. */
const MEAT_LED =
  /\bbbq\b|barbecue|samgyeopsal|galbi|bulgogi|jokbal|bossam|chimaek|fried chicken|dakgalbi|gopchang|\bsundae\b|raw fish|sashimi|\bhoe\b|고기|삼겹|갈비|불고기|족발|보쌈|치킨|곱창|막창|회센터/i;

/** The subset that matters for halal and no-pork travellers. */
const PORK_LED = /\bpork\b|samgyeopsal|jokbal|bossam|돼지|삼겹|족발|보쌈|순대/i;

/**
 * Does this stop survive what the traveller told us?
 *
 * A filter rather than a score, because these are things someone said out loud:
 * a person who cannot manage a hill does not want the hill ranked lower, they
 * want it gone.
 */
export function allowedBy(spot: Spot, profile?: TravelProfile): boolean {
  if (!profile) return true;
  const hay = `${spot.name} ${spot.note ?? ""}`;
  if (profile.mobility === "easy" && STRENUOUS.test(hay)) return false;
  if (profile.budget === "low" && PRICEY.test(hay)) return false;
  if (profile.dislikes.some((d) => spot.themes.includes(d))) return false;
  // Saying "we are vegetarian" and then being handed Korean BBQ is the kind of
  // miss that costs the whole answer its credibility. We cannot vet every menu,
  // but we can keep off the list the stops that are *defined* by the meat.
  if (profile.dietary.length) {
    const wantsNoMeat = profile.dietary.includes("vegetarian") || profile.dietary.includes("vegan");
    const wantsNoPork = profile.dietary.includes("no-pork") || profile.dietary.includes("halal");
    if (wantsNoMeat && MEAT_LED.test(hay)) return false;
    if (wantsNoPork && PORK_LED.test(hay)) return false;
  }
  return true;
}

/**
 * Words that say nothing about *which* place this is. Two stops both containing
 * "market" are two markets; two both containing "lotte world tower" are one
 * building listed twice.
 */
const GENERIC_NAME_WORD =
  /^(?:the|a|of|and|in|at|seoul|busan|jeju|gyeongju|korea|korean|market|park|street|food|village|museum|center|centre|hall|tour|tours|cafe|café|house|shop|store|art|old|new)$/i;

export function distinctiveWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !GENERIC_NAME_WORD.test(w));
}

/**
 * Is this the same landmark under another listing?
 *
 * The feed carries "Lotte World Tower – Seoul Sky" and "Lotte World Tower & Mall"
 * as separate entries, and a day that visits both is a day that visits one place
 * twice. Name-equality dedup cannot see it; two shared distinctive words can.
 */
function samePlaceAs(candidate: Spot, chosen: Spot[]): boolean {
  const mine = distinctiveWords(candidate.name);
  if (!mine.length) return false;
  // "Gwangjang Market" and "Gwangjang Market street food" are one market. When a
  // name carries only one word that identifies it, that word alone is the test.
  const needed = mine.length === 1 ? 1 : 2;
  return chosen.some((s) => {
    const theirs = new Set(distinctiveWords(s.name));
    return mine.filter((w) => theirs.has(w)).length >= needed;
  });
}

function fits(spot: Spot, block: Block): boolean {
  if (block === "any") return true;
  return spot.blocks.includes(block) || spot.blocks.includes("any");
}

/**
 * Build one day from a candidate pool.
 *
 * `offset` is what makes "give me another one" mean anything: at 0 every slot
 * takes its best-scoring candidate, and each step down takes the next one, so a
 * second ask returns a different day rather than the same itinerary again.
 *
 * `fallback` is the wider pool used when the primary one cannot fill the day —
 * a narrow filter (indoor, one zone) was producing two-stop "courses".
 */
function buildDay(
  title: string,
  pool: Spot[],
  themes: string[],
  template: { key: string; block: Block; food?: boolean; any?: string[] }[],
  used: Set<string>,
  offset = 0,
  fallback: Spot[] = [],
  profile?: TravelProfile,
  /** Stops already placed on earlier days — the same market twice is still twice. */
  alreadyPlaced: Spot[] = [],
): DayPlan {
  const rank = (list: Spot[]): Spot[] =>
    [...list].sort((a, b) => score(b, themes) - score(a, themes) || a.id.localeCompare(b.id));
  const ranked = rank(pool);
  const wider = rank(fallback.filter((s) => !pool.includes(s)));
  const stops: Stop[] = [];
  for (const [slotIndex, slot] of template.entries()) {
    const suits = (s: Spot): boolean =>
      !used.has(s.id) &&
      fits(s, slot.block) &&
      allowedBy(s, profile) &&
      (!slot.food || s.themes.includes("food") || s.themes.includes("market")) &&
      // An evening is dinner, a bar or a view — not a stationery shop that
      // happened to be the next candidate in the list.
      (!slot.any || slot.any.some((t) => s.themes.includes(t)));
    const chosen = [...alreadyPlaced, ...stops.map((st) => st.spot)];
    const notATwin = (s: Spot) => !samePlaceAs(s, chosen);
    const ok = ranked.filter(suits).filter(notATwin);
    const candidates = ok.length ? ok : wider.filter(suits).filter(notATwin);
    if (!candidates.length) continue;
    // A day of three markets is a list, not an itinerary. Prefer a stop whose
    // lead theme hasn't been used yet, and fall back if that leaves nothing.
    const usedThemes = stops.map((st) => st.spot.themes[0]);
    const fresh = candidates.filter((c) => !usedThemes.includes(c.themes[0]));
    const shortlist = fresh.length ? fresh : candidates;
    // Walk further down the list at every variant, and a different distance in
    // each slot — otherwise the one crowd-pleasing venue wins the morning of
    // every variant and three "different" courses share the same first stop.
    //
    // The stride has to be 1 in the first slot. Multiplying the variant by the
    // template length aliased the moment a shortlist was as short as the day
    // (`3 % 3 === 6 % 3`), and a traveller who asked twice for something else got
    // the same morning both times. Stepping by one guarantees a new headline stop
    // for as many variants as there are candidates; the later slots keep their
    // wider strides so the rest of the day moves too.
    const stride = [1, 2, 3, 5, 7][slotIndex % 5];
    const step = offset * stride;
    const pick = shortlist[step % shortlist.length];
    used.add(pick.id);
    const alt = shortlist.find((s) => !used.has(s.id) && s.id !== pick.id);
    if (alt) used.add(alt.id);
    stops.push({ block: BLOCK_LABEL[slot.key] ?? slot.key, spot: pick, alt });
  }
  return { title, stops };
}

const EVENING_THEMES = ["food", "nightlife", "view", "market", "cafe"];

const ONE_DAY_TEMPLATE: { key: string; block: Block; food?: boolean; any?: string[] }[] = [
  { key: "morning", block: "morning" },
  { key: "lunch", block: "afternoon", food: true },
  { key: "afternoon", block: "afternoon" },
  { key: "evening", block: "evening", any: EVENING_THEMES },
];
const HALF_DAY_TEMPLATE: { key: string; block: Block; food?: boolean; any?: string[] }[] = [
  { key: "morning", block: "any" },
  { key: "food", block: "any", food: true },
  { key: "afternoon", block: "any" },
];

/** Top zones in a city by total theme score (so each day clusters to minimise travel). */
function rankZones(themes: string[], city: City, catalogue: Spot[] = ALL_SPOTS): string[] {
  const byZone = new Map<string, number>();
  for (const s of catalogue) {
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

/** One entry per place, keeping the first (curated) of any duplicate name. */
function dedupeByName(spots: Spot[]): Spot[] {
  const seen = new Set<string>();
  const out: Spot[] = [];
  for (const s of spots) {
    // "Tongin Market" and "Tongin Market (coin lunchbox)" are one place.
    const key = s.name
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z가-힣0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Compose a course for the (personas, duration, themes, city) request. */
export function composeCourse(
  personas: PersonaDef[],
  duration: Duration,
  explicitThemes: string[],
  city: City = "Seoul",
  indoor = false,
  /** 0 is the best answer; each step is a different one, for "give me another". */
  variant = 0,
  /** Live candidates from the city's tourism data, behind the curated ones. */
  extra: Spot[] = [],
  /** What the traveller told us about how they want to travel. */
  profile?: TravelProfile,
): Course {
  const themes = wantedThemes(personas, explicitThemes);
  // Someone who asked to take it easy gets a day with room in it, not the same
  // four stops at the same speed; someone who asked to see everything gets more.
  const dayTemplate =
    profile?.pace === "relaxed"
      ? ONE_DAY_TEMPLATE.filter((t) => t.key !== "afternoon")
      : profile?.pace === "packed"
        ? [...ONE_DAY_TEMPLATE, { key: "evening", block: "evening" as Block, any: EVENING_THEMES }]
        : ONE_DAY_TEMPLATE;
  // Curated and live overlap — "Tongin Market" arrives from both, and a day that
  // sends you to the same market twice is worse than one that never mentions it.
  // Curated wins, because it is the entry with the reason to go written on it.
  const catalogue = extra.length ? dedupeByName([...ALL_SPOTS, ...extra]) : ALL_SPOTS;
  const zones = rankZones(themes, city, catalogue);
  const used = new Set<string>();
  const inZones = (zs: string[]) => {
    const pool = catalogue.filter((s) => cityOf(s) === city && (zs.includes(s.zone) || s.zone === "any"));
    // Raining? Keep only sheltered stops — unless that leaves too few to fill a day,
    // in which case lead with them and let the rest follow.
    if (!indoor) return pool;
    const sheltered = pool.filter(isIndoorSpot);
    return sheltered.length >= 3 ? sheltered : [...sheltered, ...pool.filter((s) => !isIndoorSpot(s))];
  };
  // Every whole city in the pool, for when a narrow filter starves a day.
  const cityPool = catalogue.filter((s) => cityOf(s) === city);
  // A day's 1-2 adjacent zones. The variant rotates which part of the city
  // anchors the day, so "another" moves you across town rather than shuffling
  // the same three streets.
  const band = (i: number) => {
    if (!zones.length) return zones;
    const start = (i + variant * 2) % zones.length;
    const picked = [...zones, ...zones].slice(start, start + 2);
    return picked.length ? picked : zones.slice(0, 2);
  };
  /**
   * One whole course at a given variant, drawing from — and adding to — `seen`.
   *
   * Stepping further down a ranked list was not enough on its own: a different
   * variant reshuffles which part of the city anchors the day, and the same
   * crowd-pleaser can sit at index 1 of one shortlist and index 2 of the next.
   * A traveller who asks twice for something else should never be handed a stop
   * they have already been shown, so every earlier variant is composed first and
   * its picks are struck off before this one is built.
   */
  const compose = (v: number, seen: Set<string>): DayPlan[] => {
    const bandAt = (i: number) => {
      if (!zones.length) return zones;
      const start = (i + v * 2) % zones.length;
      const picked = [...zones, ...zones].slice(start, start + 2);
      return picked.length ? picked : zones.slice(0, 2);
    };
    const out: DayPlan[] = [];
    const placed: Spot[] = [];
    const day = (title: string, bandIndex: number, tpl = dayTemplate) => {
      const built = buildDay(title, inZones(bandAt(bandIndex)), themes, tpl, seen, v, cityPool, profile, placed);
      placed.push(...built.stops.map((st) => st.spot));
      out.push(built);
    };
    if (duration === "half-day") day("Half-day", 0, HALF_DAY_TEMPLATE);
    else if (duration === "2-day") {
      day("Day 1", 0);
      day("Day 2", 2);
    } else if (duration === "3-day") {
      day("Day 1", 0);
      day("Day 2", 2);
      day("Day 3", 4);
    } else day("1-day", 0);
    return out;
  };

  // 1-day Seoul single-persona has a hand-written signature day, which is the
  // single best answer — so it is variant 0 only, and only when the traveller has
  // not told us anything a fixed sequence cannot honour (a bad knee, a budget,
  // shelter from the rain).
  const sig =
    duration === "1-day" &&
    variant === 0 &&
    !indoor &&
    city === "Seoul" &&
    personas.length === 1 &&
    (!profile || isEmptyProfile(profile))
      ? SIGNATURES[`${personas[0].key}:1-day`]
      : undefined;
  if (sig) {
    const stops = sig.map((x) => ({ block: x.block, spot: SPOT_BY_ID.get(x.id)! })).filter((st) => st.spot);
    return { days: [{ title: "1-day", stops }], themes };
  }

  for (let k = 0; k < variant; k++) compose(k, used);
  let days = compose(variant, used);
  // Every candidate struck off eventually — a two-stop "course" is worse than
  // one that circles back, so start the rotation over rather than thinning out.
  const total = days.reduce((n, d) => n + d.stops.length, 0);
  if (total < days.length * 2) days = compose(variant, new Set<string>());
  return { days, themes };
}
