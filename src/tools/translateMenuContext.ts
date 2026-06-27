import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * translateMenuContext — curated, knowledge-based. More than literal
 * translation: spice level, key ingredients, and common allergens for Korean
 * dishes, plus allergy flags tailored to the user's concerns.
 */

interface Dish {
  match: RegExp;
  en: string;
  desc: string;
  spice: 0 | 1 | 2 | 3; // 0 none … 3 very spicy
  allergens: string[]; // lowercase tokens: gluten, egg, soy, shellfish, fish, peanut, dairy, sesame, pork
}

const DISHES: Dish[] = [
  { match: /김치찌개|kimchi.?jjigae/i, en: "Kimchi stew", desc: "Tangy, fermented-cabbage stew, usually with pork and tofu.", spice: 2, allergens: ["soy", "pork", "fish"] },
  { match: /된장찌개|doenjang/i, en: "Soybean-paste stew", desc: "Savory, earthy stew from fermented soybean paste with vegetables and tofu.", spice: 1, allergens: ["soy", "shellfish"] },
  { match: /비빔밥|bibimbap/i, en: "Bibimbap", desc: "Rice topped with seasoned vegetables, egg, and gochujang; mix before eating.", spice: 1, allergens: ["egg", "soy", "sesame"] },
  { match: /불고기|bulgogi/i, en: "Bulgogi", desc: "Sweet-savory marinated grilled beef.", spice: 0, allergens: ["soy", "sesame", "gluten"] },
  { match: /삼겹살|samgyeopsal/i, en: "Grilled pork belly", desc: "DIY-grilled pork belly, wrapped in lettuce with garlic and ssamjang.", spice: 0, allergens: ["soy", "pork", "sesame"] },
  { match: /떡볶이|tteokbokki/i, en: "Tteokbokki", desc: "Chewy rice cakes in a sweet-spicy gochujang sauce.", spice: 3, allergens: ["gluten", "soy"] },
  { match: /순두부|sundubu/i, en: "Soft-tofu stew", desc: "Silky soft tofu in a spicy seafood-or-pork broth, served bubbling.", spice: 2, allergens: ["soy", "egg", "shellfish", "fish"] },
  { match: /냉면|naengmyeon/i, en: "Cold buckwheat noodles", desc: "Chilled noodles in icy broth (mul) or spicy sauce (bibim).", spice: 1, allergens: ["gluten", "egg", "soy"] },
  { match: /김밥|kimbap|gimbap/i, en: "Kimbap", desc: "Seaweed rice rolls with vegetables, egg, and often ham or tuna.", spice: 0, allergens: ["egg", "sesame", "fish", "soy"] },
  { match: /제육|jeyuk/i, en: "Spicy stir-fried pork", desc: "Pork stir-fried in a spicy gochujang marinade.", spice: 2, allergens: ["soy", "pork", "sesame"] },
  { match: /삼계탕|samgyetang/i, en: "Ginseng chicken soup", desc: "Whole young chicken stuffed with rice, ginseng, and garlic in a mild broth — a summer health dish.", spice: 0, allergens: [] },
  { match: /잡채|japchae/i, en: "Glass noodle stir-fry", desc: "Sweet-savory sweet-potato glass noodles with vegetables and beef.", spice: 0, allergens: ["soy", "sesame", "egg"] },
  { match: /해장국|haejangguk/i, en: "Hangover soup", desc: "Hearty soup (often with ox-blood, pork spine, or cabbage) eaten to recover from drinking.", spice: 1, allergens: ["soy"] },
  { match: /순대|sundae/i, en: "Korean blood sausage", desc: "Steamed pig-intestine sausage filled with noodles and barley — savory, often with offal.", spice: 0, allergens: ["pork", "soy", "gluten"] },
  { match: /파전|해물전|pajeon|\bjeon\b/i, en: "Savory pancake", desc: "Pan-fried scallion (and often seafood) pancake; crispy edges, soft center.", spice: 0, allergens: ["gluten", "egg", "shellfish", "soy"] },
  { match: /빈대떡|bindaetteok|mung.?bean pancake/i, en: "Mung-bean pancake", desc: "Crispy pancake ground from mung beans with pork, kimchi, and scallion — a market classic.", spice: 0, allergens: ["pork", "soy"] },
  { match: /부대찌개|budae|army stew/i, en: "Army stew", desc: "Spicy hot-pot of kimchi, sausage, Spam, tofu, and instant noodles — a post-war fusion classic, shared at the table.", spice: 2, allergens: ["gluten", "pork", "soy"] },
  { match: /갈비찜|galbi.?jjim/i, en: "Braised short ribs", desc: "Beef short ribs braised until tender in a sweet soy sauce with vegetables.", spice: 0, allergens: ["soy", "sesame", "gluten"] },
  { match: /갈비탕|galbitang/i, en: "Short-rib soup", desc: "Clear, mild beef short-rib soup with glass noodles — comforting and not spicy.", spice: 0, allergens: ["egg", "soy"] },
  { match: /(?<![닭돼지])갈비(?![탕찜])|\bgalbi\b|\bkalbi\b/i, en: "Grilled short ribs", desc: "Marinated beef short ribs grilled at the table; sweet-savory and tender.", spice: 0, allergens: ["soy", "sesame", "gluten"] },
  { match: /닭갈비|dak.?galbi/i, en: "Spicy stir-fried chicken", desc: "Chicken stir-fried with cabbage, rice cakes, and gochujang on a hot plate — a Chuncheon specialty.", spice: 2, allergens: ["soy", "sesame", "gluten"] },
  { match: /찜닭|jjimdak/i, en: "Braised chicken", desc: "Chicken braised in sweet soy sauce with glass noodles, potato, and carrot — mildly sweet (Andong style can be spicy).", spice: 1, allergens: ["soy", "gluten", "sesame"] },
  { match: /보쌈|bossam/i, en: "Boiled pork wraps", desc: "Thin-sliced boiled pork belly wrapped in cabbage/kimchi with salted shrimp — savory, not spicy.", spice: 0, allergens: ["pork", "shellfish", "soy"] },
  { match: /족발|jokbal/i, en: "Braised pig's trotters", desc: "Pig's feet braised in soy and spices, sliced and served with wraps — gelatinous and savory.", spice: 0, allergens: ["pork", "soy"] },
  { match: /감자탕|gamjatang/i, en: "Pork-bone stew", desc: "Spicy stew of pork spine, potato, and perilla — hearty and rich, eaten communally.", spice: 2, allergens: ["pork", "soy", "sesame"] },
  { match: /육개장|yukgaejang/i, en: "Spicy beef soup", desc: "Shredded beef, scallions, and fern in a fiery red broth.", spice: 3, allergens: ["egg", "soy", "sesame"] },
  { match: /설렁탕|seolleongtang/i, en: "Ox-bone soup", desc: "Milky, mild ox-bone broth with rice and noodles — season it yourself with salt.", spice: 0, allergens: [] },
  { match: /칼국수|kalguksu/i, en: "Knife-cut noodle soup", desc: "Hand-cut wheat noodles in a warm anchovy or seafood broth.", spice: 0, allergens: ["gluten", "shellfish", "fish", "soy"] },
  { match: /라면|라멘|ramyeon|ramen/i, en: "Instant ramen", desc: "Korean-style instant wheat noodles in a spicy broth — a national comfort food.", spice: 2, allergens: ["gluten", "soy", "egg"] },
  { match: /만두|mandu|dumpling/i, en: "Dumplings", desc: "Steamed or fried dumplings filled with pork, vegetables, or kimchi.", spice: 0, allergens: ["gluten", "pork", "soy", "sesame"] },
  { match: /돈[까가]스|돈카츠|donkatsu|donkkaseu|tonkatsu/i, en: "Pork cutlet", desc: "Breaded, deep-fried pork cutlet with a sweet-savory brown sauce — kid-friendly, not spicy.", spice: 0, allergens: ["gluten", "egg", "pork"] },
  { match: /(?<!양념)치킨|후라이드|fried chicken/i, en: "Korean fried chicken", desc: "Extra-crispy double-fried chicken, plain or in a sweet-spicy sauce; the classic beer pairing (chimaek).", spice: 1, allergens: ["gluten", "soy"] },
  { match: /양념치킨|yangnyeom/i, en: "Sweet-spicy fried chicken", desc: "Fried chicken glazed in a sticky sweet-and-spicy gochujang sauce.", spice: 2, allergens: ["gluten", "soy", "sesame"] },
  { match: /회덮밥|hoedeopbap/i, en: "Raw-fish rice bowl", desc: "Diced raw fish over rice and vegetables, mixed with spicy-sweet sauce.", spice: 1, allergens: ["fish", "soy", "sesame", "egg"] },
  { match: /(?<![육물])회(?!덮밥)|sashimi|raw fish/i, en: "Korean sashimi (hoe)", desc: "Fresh raw fish slices, dipped in chili-vinegar (chojang) or soy — usually flatfish or sea bream.", spice: 1, allergens: ["fish", "soy"] },
  { match: /곱창|gopchang/i, en: "Grilled beef intestines", desc: "Rich, chewy grilled offal — a beloved drinking food, often very fatty.", spice: 1, allergens: ["soy", "sesame"] },
  { match: /떡국|tteokguk/i, en: "Rice-cake soup", desc: "Sliced oval rice cakes in a clear beef broth with egg — eaten on Lunar New Year.", spice: 0, allergens: ["egg", "soy", "gluten"] },
  { match: /호떡|hotteok/i, en: "Sweet syrup pancake", desc: "Griddled pancake filled with melted brown sugar, cinnamon, and nuts — a winter street snack.", spice: 0, allergens: ["gluten", "peanut"] },
  { match: /붕어빵|bungeoppang/i, en: "Fish-shaped pastry", desc: "Fish-shaped waffle filled with sweet red-bean paste (or custard) — a winter street treat.", spice: 0, allergens: ["gluten", "egg"] },
  { match: /어묵|오뎅|eomuk|odeng/i, en: "Fish cake", desc: "Skewered fish-cake simmered in warm broth — a cheap, savory street snack.", spice: 0, allergens: ["fish", "gluten", "soy"] },
  { match: /아[구귀]찜|agujjim|agwijjim/i, en: "Braised monkfish", desc: "Monkfish braised with bean sprouts in a spicy sauce — meaty, very spicy, a Korean seafood classic.", spice: 3, allergens: ["fish", "shellfish", "soy", "sesame"] },
  { match: /도토리묵|dotori|acorn jelly/i, en: "Acorn jelly", desc: "Wobbly acorn-starch jelly in a savory soy-sesame sauce with vegetables — light, nutty, low-calorie.", spice: 1, allergens: ["soy", "sesame"] },
  { match: /비빔국수|bibim.?guksu|spicy.*noodles/i, en: "Spicy cold noodles", desc: "Chewy thin noodles tossed in a sweet-spicy gochujang sauce — served cold.", spice: 2, allergens: ["gluten", "soy", "sesame", "egg"] },
  { match: /콩나물국밥|kongnamul/i, en: "Bean-sprout soup rice", desc: "Rice in a clear, peppery bean-sprout broth — light and a popular hangover cure.", spice: 1, allergens: ["soy", "fish", "egg"] },
  { match: /두부김치|dubu.?kimchi/i, en: "Tofu with stir-fried kimchi", desc: "Warm tofu slices served with stir-fried pork kimchi — a classic drinking snack.", spice: 2, allergens: ["soy", "pork"] },
  { match: /보리밥|bori.?bap/i, en: "Barley rice (mixed)", desc: "Barley-and-rice mix served with assorted vegetables and gochujang to mix yourself — wholesome and light.", spice: 1, allergens: ["gluten", "soy", "sesame"] },
  // ── Busan & southern-coast specialties ──────────────────────────────────────
  { match: /돼지국밥|dwaeji.?gukbap/i, en: "Pork soup rice (Busan)", desc: "Busan's signature — slices of boiled pork in a milky pork-bone broth over rice; season with salted shrimp, chives, and chili paste.", spice: 1, allergens: ["pork", "soy", "shellfish"] },
  { match: /밀면|milmyeon/i, en: "Busan cold wheat noodles", desc: "Chewy wheat noodles in an icy broth (mul) or spicy sauce (bibim), topped with a slice of meat and egg — Busan's take on naengmyeon.", spice: 1, allergens: ["gluten", "soy", "egg"] },
  { match: /물회|mulhoe/i, en: "Cold raw-fish soup", desc: "Sliced raw fish in an icy sweet-spicy broth with vegetables — a refreshing coastal summer dish (Busan, Jeju, the east coast).", spice: 2, allergens: ["fish", "soy", "sesame"] },
  // ── Jeju specialties ────────────────────────────────────────────────────────
  { match: /흑돼지|heuk.?dwaeji|black pork/i, en: "Jeju black-pork BBQ", desc: "Prized Jeju heritage-breed pork grilled at the table and dipped in meljeot (anchovy sauce) — richer and chewier than ordinary samgyeopsal.", spice: 0, allergens: ["pork", "fish", "sesame"] },
  { match: /갈치조림|galchi.?jorim/i, en: "Braised cutlassfish", desc: "Silvery cutlassfish braised with radish and potato in a spicy-savory sauce — a Jeju seafood staple.", spice: 2, allergens: ["fish", "soy"] },
  { match: /전복죽|jeonbok.?juk|abalone porridge/i, en: "Abalone porridge", desc: "Creamy rice porridge cooked with abalone, tinged green from its roe — gentle and nourishing, a Jeju classic.", spice: 0, allergens: ["shellfish"] },
  // ── Seoul & nationwide classics foreigners seek out ─────────────────────────
  { match: /간장게장|ganjang.?gejang|soy.?sauce.?crab|marinated crab/i, en: "Soy-marinated raw crab", desc: "Raw crab cured in soy sauce — silky briny roe and meat eaten over rice; nicknamed the 'rice thief' (밥도둑). It's raw, so eat it where it's fresh.", spice: 0, allergens: ["shellfish", "soy"] },
  { match: /닭한마리|dak.?han.?mari/i, en: "Whole-chicken hotpot", desc: "A whole chicken simmered at the table in a clear broth with potato and rice cakes; dip in soy-mustard sauce and finish with noodles — a Dongdaemun favorite to share.", spice: 0, allergens: ["soy"] },
  { match: /곰탕|gomtang/i, en: "Beef-bone soup", desc: "Clear, long-simmered beef-and-brisket broth with rice — cleaner and milder than the milky seolleongtang; season it yourself.", spice: 0, allergens: [] },
  { match: /수제비|sujebi/i, en: "Hand-torn dough soup", desc: "Soft hand-torn wheat-dough flakes in an anchovy-or-seafood broth with vegetables — homey comfort food, especially on a rainy day.", spice: 0, allergens: ["gluten", "soy", "fish"] },
  { match: /막국수|makguksu/i, en: "Chilled buckwheat noodles (makguksu)", desc: "Gangwon-style cold buckwheat noodles tossed in a tangy-sweet sauce (bibim) or served in a cool broth (mul) with vegetables.", spice: 1, allergens: ["gluten", "soy", "sesame", "egg"] },
  { match: /콩국수|kong.?guksu|kongguksu/i, en: "Cold soy-milk noodles", desc: "Wheat noodles in a chilled, nutty soy-milk broth — a creamy, plant-based summer dish; add a pinch of salt to taste.", spice: 0, allergens: ["gluten", "soy"] },
  { match: /추어탕|chueotang|loach/i, en: "Loach soup", desc: "Hearty soup of ground freshwater loach with perilla and vegetables — earthy and nourishing, often seasoned with sancho pepper.", spice: 1, allergens: ["fish", "soy"] },
  // ── More popular / adventurous dishes ───────────────────────────────────────
  { match: /닭볶음탕|닭도리탕|dak.?bokkeum|dakdoritang/i, en: "Spicy braised chicken stew", desc: "Chicken simmered with potato, carrot, and a spicy gochujang-gochugaru sauce — hearty and shared from one pot.", spice: 2, allergens: ["soy", "sesame"] },
  { match: /쭈꾸미|주꾸미|jjukkumi/i, en: "Spicy stir-fried baby octopus", desc: "Baby octopus stir-fried in a fiery gochujang sauce — small but seriously spicy, a favorite drinking dish.", spice: 3, allergens: ["shellfish", "soy", "sesame"] },
  { match: /양꼬치|yangkkochi|lamb skewer/i, en: "Cumin lamb skewers", desc: "Chinese-Korean grilled lamb skewers rolled in cumin and chili — rotated over a tabletop grill, a beer favorite.", spice: 1, allergens: ["sesame", "peanut"] },
  { match: /골뱅이|golbaeng/i, en: "Spicy whelk salad", desc: "Chewy canned whelks tossed with vegetables in a sweet-spicy sauce, usually with thin somyeon noodles — a classic bar snack (anju).", spice: 2, allergens: ["shellfish", "gluten", "soy"] },
  { match: /김치전|kimchi.?jeon|kimchi pancake/i, en: "Kimchi pancake", desc: "Crispy pan-fried pancake of chopped kimchi in batter — tangy and savory, great on a rainy day (kimchi usually contains fish sauce).", spice: 1, allergens: ["gluten", "soy", "fish"] },
  { match: /번데기|beondegi|silkworm/i, en: "Steamed silkworm pupae", desc: "Steamed silkworm pupae sold from street carts — nutty, earthy, and an adventurous Korean snack (not for the squeamish).", spice: 0, allergens: [] },
  // ── More everyday & drinking-food dishes ────────────────────────────────────
  { match: /김치볶음밥|kimchi.?bokkeumbap|kimchi.?fried.?rice/i, en: "Kimchi fried rice", desc: "Rice stir-fried with kimchi (and usually pork/ham), topped with a fried egg and seaweed flakes — a quick, comforting one-plate meal.", spice: 1, allergens: ["soy", "egg", "fish"] },
  { match: /닭강정|dakgangjeong/i, en: "Sweet crispy chicken bites", desc: "Bite-size double-fried chicken in a sticky sweet-and-spicy glaze — a market and street-stall favorite, great to share.", spice: 1, allergens: ["gluten", "soy", "peanut"] },
  { match: /쫄면|jjolmyeon/i, en: "Chewy spicy cold noodles", desc: "Very chewy wheat noodles tossed with vegetables in a sweet-spicy gochujang sauce — served cold, a bunsik (snack-bar) classic.", spice: 2, allergens: ["gluten", "egg", "soy", "sesame"] },
  { match: /닭발|dakbal|chicken feet/i, en: "Spicy chicken feet", desc: "Boneless or bone-in chicken feet in a fiery gochugaru sauce — a chewy, very spicy drinking food (anju). Order with cold drinks.", spice: 3, allergens: ["soy", "sesame"] },
  { match: /양념게장|yangnyeom.?gejang|spicy.?(marinated|raw).?crab/i, en: "Spicy marinated raw crab", desc: "Raw crab marinated in a spicy gochujang-garlic sauce — eaten with rice; the spicy cousin of soy-marinated ganjang-gejang. It's raw, so eat it fresh.", spice: 2, allergens: ["shellfish", "soy", "sesame"] },
  { match: /새우장|saewujang|soy.?(marinated)?.?shrimp/i, en: "Soy-marinated raw shrimp", desc: "Raw shrimp cured in soy sauce — sweet, briny, and silky over rice; another 'rice thief'. Raw, so eat where it's fresh.", spice: 0, allergens: ["shellfish", "soy"] },
  { match: /한정식|hanjeongsik|korean.?(course|set|table).?(meal|menu|course)?/i, en: "Korean table d'hôte (hanjeongsik)", desc: "A multi-course spread of many small dishes — rice, soups, grilled meat or fish, and a parade of banchan side dishes. Set price, shared at the table.", spice: 1, allergens: ["soy", "sesame", "egg", "fish"] },
  { match: /백반|baekban/i, en: "Home-style set meal (baekban)", desc: "A simple, cheap set of rice, a soup or stew, and an assortment of banchan — the everyday Korean comfort meal at small eateries.", spice: 1, allergens: ["soy", "fish"] },
  { match: /수육|suyuk|boiled pork/i, en: "Boiled pork slices (suyuk)", desc: "Tender thin-sliced boiled pork served with salt, ssamjang, and wraps — milder than samgyeopsal, often eaten with rice or as drinking food.", spice: 0, allergens: ["pork", "soy"] },
];

const SPICE_LABEL = ["🌶️ none", "🌶️ mild", "🌶️🌶️ medium", "🌶️🌶️🌶️ hot"];

// Allergen tokens our dictionary actually tracks — so we never silently "pass" a
// concern we can't check (e.g. dairy), which would be dangerous false reassurance.
const SUPPORTED_ALLERGENS = new Set(DISHES.flatMap((d) => d.allergens));

const ANIMAL = ["pork", "fish", "shellfish"];
// Beef/chicken aren't allergen tokens, so detect meat/fish by name too — else a
// vegetarian sees "No common allergens" for 삼계탕/불고기 (N6).
// Note: "bone" (ox-bone/pork-bone broths) not bare "broth" — else a plant-based
// "soy-milk broth" (콩국수) is falsely flagged not-veg (P-V1). 설렁탕 "ox-bone" still hits.
const MEAT_RE =
  /\b(beef|pork|chicken|duck|lamb|meat|fish|seafood|sausage|\bham\b|spam|anchovy|bone|intestine|trotter|monkfish|blood|octopus|squid|shrimp|prawn|crab|oyster|clam|whelk|silkworm|pupae)\b|galbi|bulgogi|samgye|jeyuk|gukbap|haejang|jokbal|gopchang/i;

function renderDish(d: Dish, supportedConcerns: string[], noPork: boolean, veg: boolean, vegan: boolean): string {
  const hits = d.allergens.filter((a) => supportedConcerns.includes(a));
  // "…to flag" scopes this to the tracked allergen set, so it never reads as a
  // contradiction next to a "contains meat" diet flag (e.g. 설렁탕/삼계탕) — P7.
  const allergenLine = d.allergens.length ? `Allergens: ${d.allergens.join(", ")}` : "No common allergens to flag";
  let warn = hits.length ? `\n  - ⚠️ **Contains ${hits.join(", ")}** (you flagged this)` : "";
  // Hard per-dish flag for halal/pork-free diners (Y12) — the soft broth note isn't enough.
  if (noPork && d.allergens.includes("pork")) warn += `\n  - ⚠️ **Contains pork — not halal/pork-free**`;
  // Per-dish veg/vegan flag — most Korean dishes hide meat/fish/seafood (docs/18 #7, N6).
  if (veg) {
    const animal = d.allergens.filter((a) => ANIMAL.includes(a));
    if (animal.length) warn += `\n  - ⚠️ **Contains ${animal.join("/")} — not vegetarian/vegan**`;
    else if (MEAT_RE.test(`${d.en} ${d.desc}`)) warn += `\n  - ⚠️ **Contains meat or fish — not vegetarian/vegan**`;
    // Vegetarian-OK but egg/dairy → flag for vegans specifically (P7).
    else if (vegan) {
      const ed = d.allergens.filter((a) => a === "egg" || a === "dairy");
      if (ed.length) warn += `\n  - ⚠️ **Contains ${ed.join("/")} — not vegan** (fine for vegetarians)`;
    }
  }
  return `- **${d.en}** — ${d.desc}\n  - Spice: ${SPICE_LABEL[d.spice]} · ${allergenLine}${warn}`;
}

/** A "show this to staff" card of Korean phrases for diet/allergy needs (docs/18 #7). */
function phraseCard(concerns: string[], veg: boolean, noPork: boolean): string[] {
  const rows: string[] = [];
  if (veg)
    rows.push('- No meat/fish: **"저는 고기와 생선을 안 먹어요"** (_jeo-neun gogi-wa saengseon-eul an meogeoyo_ — "I don\'t eat meat or fish")');
  if (noPork)
    rows.push('- No pork: **"돼지고기 빼주세요"** (_dwaeji-gogi ppae-juseyo_ — "please leave out the pork")');
  const allergyWords = concerns.filter((c) => !/veg|vegan|meat|pork.?free|halal|beef/.test(c));
  if (allergyWords.length)
    rows.push(`- Allergy: **"저는 ${allergyWords.join("/")} 알레르기가 있어요"** (_…allergy…_ — say it / show this).`);
  rows.push('- Ask: **"이거 안에 뭐 들어가요?"** (_i-geo ane mwo deureoga-yo?_ — "what\'s in this?")');
  return rows.length ? ["", "🪧 **Show this to the staff (Korean):**", ...rows] : [];
}

function render(menuText: string, concerns: string[]): string {
  // Preserve the order dishes appear in the user's text, not dictionary order.
  const found = DISHES.filter((d) => d.match.test(menuText)).sort(
    (a, b) => menuText.search(a.match) - menuText.search(b.match),
  );
  const head = `🍽️ **Menu, explained in context**`;
  if (found.length === 0) {
    return [
      head,
      "",
      `I couldn't match a known dish in: _"${menuText.slice(0, 120)}"_.`,
      "Try a single dish name (Korean or romanized), e.g. `tteokbokki`, `bibimbap`, `삼겹살`.",
    ].join("\n");
  }

  // Split concerns into ones we can actually check vs ones we can't.
  const supported = concerns.filter((c) => SUPPORTED_ALLERGENS.has(c));
  const unsupported = concerns.filter((c) => !SUPPORTED_ALLERGENS.has(c));
  const veg = concerns.some((c) => /veg|vegan|meat|pork.?free|halal|beef/.test(c));
  const vegan = concerns.some((c) => /\bvegan\b/.test(c));
  const noPork = concerns.some((c) => /halal|pork.?free|no.?pork/.test(c));

  const lines = [head];
  if (supported.length) lines.push("", `_Checking against: **${supported.join(", ")}** (⚠️ marks dishes that contain these)_`);
  lines.push("", ...found.map((d) => renderDish(d, supported, noPork, veg, vegan)));

  const notes: string[] = [];
  // Y13: dish-like tokens we couldn't identify — surface them instead of dropping silently.
  const unmatched = [
    ...new Set(
      menuText
        .split(/[\s,/·]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && /[가-힣]/.test(t) && !found.some((d) => d.match.test(t))),
    ),
  ];
  if (unmatched.length) {
    notes.push(`❓ Couldn't identify **${unmatched.slice(0, 6).join(", ")}** — ask the restaurant or send the exact text.`);
  }
  // Honesty: don't pretend to verify allergens/diets we don't track.
  const cantCheck = unsupported.filter((c) => !/veg|vegan|meat|pork.?free|halal|beef/.test(c));
  if (cantCheck.length) {
    notes.push(`⚠️ I don't yet track **${cantCheck.join(", ")}** per dish — please confirm with the restaurant.`);
  }
  if (veg) {
    notes.push(
      "🌱 Vegetarian/halal note: many Korean dishes use **fish sauce, anchovy stock, or meat broth** even when they look meat-free. Ask “고기·생선 없이 돼요?” (without meat or fish?).",
    );
  }
  if (notes.length) lines.push("", ...notes.map((n) => `> ${n}`));
  // Korean phrases to show staff for diet/allergy needs.
  lines.push(...phraseCard(concerns, veg, noPork));
  // A ready-to-use ordering phrase, in-line — so a non-Korean speaker gets real
  // value instead of a chip that re-runs the same explanation (R4).
  lines.push(
    "",
    '🗣️ **To order:** point and say **"이거 주세요"** (_i-geo ju-se-yo_ — "this one, please"); for two, **"두 개 주세요"** (_du-gae ju-se-yo_).',
  );
  return lines.join("\n");
}

const CHOICES: Choice[] = [
  { emoji: "🍜", cmdEn: "Find a place that serves this", descEn: "foreigner-friendly restaurants" },
  { emoji: "💳", cmdEn: "How do I pay at restaurants?", descEn: "card, cash, and tipping" },
  { emoji: "🌶️", cmdEn: "Show only non-spicy options", descEn: "filter out spicy dishes" },
];

export const translateMenuContext: ToolDef = {
  name: "translateMenuContext",
  description:
    "Explains Korean menu items with cultural, spice-level, and allergen context in English — more than " +
    "literal translation. Flags allergens against the visitor's stated concerns. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    menuText: z.string().describe("Menu text or dish name(s), Korean or romanized."),
    allergyConcerns: z
      .array(z.string())
      .optional()
      .describe("Allergens to flag, e.g. ['gluten','shellfish','peanut']."),
  },
  annotations: {
    title: "Explain Korean Menu in Context",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const menuText = String(args.menuText ?? "");
    const concerns = Array.isArray(args.allergyConcerns)
      ? (args.allergyConcerns as unknown[]).map((c) => String(c).toLowerCase())
      : [];
    return ok(render(menuText, concerns), CHOICES);
  },
};
