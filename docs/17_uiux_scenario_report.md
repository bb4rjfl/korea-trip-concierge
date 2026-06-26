# 17. UI/UX Scenario Test Report — Korea Trip Concierge (post‑D‑015)

> **Date:** 2026‑06‑26 (Fri ~16:15–16:40 KST) · **Target:** LIVE deployed endpoint `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp` (the just‑redeployed product, 11 tools, all 8 sources `true` incl. `visitseoul`).
> **Scope:** Exhaustive UX + correctness assessment before contest submission, with emphasis on the new **D‑015 VisitSeoul** integration.
> **Method:** ~240 live scenarios (≈140 single‑turn + ≈100 multi‑turn chip journeys) across 12+ personas, run by **9 parallel sub‑agents**, each designing + running + scoring its slice; findings aggregated, de‑duplicated, and the 5 most severe **independently re‑verified by the lead tester**.
> **Verdict (TL;DR):** The product's foundations are strong and rule‑compliant — the chip‑journey vision genuinely works end‑to‑end on the happy paths, intercity grounding/payment/allergen‑honesty/injection‑resistance/PII handling are all solid. But there is a cluster of **8 must‑fix issues** that break documented chip journeys or the core promise of two flagship tools (`getNowInfo`, `searchPlaceForeigner`), several of which a judge will hit within the first few taps. **Not yet submission‑ready; ~1 focused fix pass gets it there.** See §6 for the top‑5.

---

## 1. Methodology — what we benchmarked and how we improved it

### 1.1 The prior approach (benchmark)
The previous test (the "kpass 2" session) ran **107 scenarios via 5 parallel sub‑agents**, per‑scenario evaluation, segmented into 5 categories (transit / payment / menu / place / complex‑journey). It produced a numbered fix list **C1–C10** of real bugs (weather `allSettled`, English→Korean bus‑stop mapping, menu regex over‑match, allergen false‑reassurance, search food‑keyword expansion, landmark mis‑match, ja/zh fallback, route origin prompt, ODsay romanization). Most C‑items were subsequently fixed; this test confirms they hold and hunts the next layer.

### 1.2 How this test improved on it
| Dimension | Prior | This test |
|---|---|---|
| Scenario count | 107 | **~240** (≈140 single + ≈100 multi‑turn) |
| Sub‑agents | 5 | **9** (5 single‑turn slices + 4 journey slices) |
| Personas | implicit | **12–15 explicit** (US first‑timer, JP, CN, Muslim/halal, vegan, budget backpacker, business, family, elderly, late‑night arrival, transit‑anxious, K‑pop fan, shopaholic, foodie, non‑English speaker) |
| Multi‑turn journeys | "complex‑journey" category | **20 full chip journeys (4–6 turns)** that *actually read the chips returned, pick the chip the persona would tap, map it to the next tool+args carrying context, and evaluate continuity* — the core differentiator under test |
| Rubric | per‑scenario | **7 dimensions, each 🟢/🟡/🔴**: Correctness · Foreigner‑friendliness · Chip quality · UX continuity · Rule‑compliance · Language handling · Graceful degradation |
| Adversarial | partial | **dedicated slice**: gibberish, impossible places/cities, typos, ambiguous names, conflicting constraints, prompt‑injection, PII bait, multilingual native‑script |
| New‑path coverage | n/a | explicit matrix over **every D‑012..D‑015 path**: VisitSeoul Seoul discovery, getNowInfo Seoul‑hours fallback, dining→POI split, VisitSeoul‑empty→grounding, non‑Seoul→grounding, subway 3 modes + off‑hours, intercity, did‑you‑mean fuzzy, en/ja/zh/ko, weather warnings, allergen honesty |
| Verification | agent‑reported | **5 most‑severe findings re‑run first‑hand by the lead** (all confirmed); A3's "loop overcount" hypothesis was **empirically falsified** by J3's 6‑pair probe and corrected here |

### 1.3 Honesty / sampling notes
- **Time of day:** all runs were ~16:15–16:40 KST (Friday afternoon) — subway in service, attractions open. **Post‑01:00 off‑hours behavior was NOT live‑testable.** Off‑hours/night logic was instead **source‑verified** (read `trackSubwayArrival.ts`, `seoulSubway.ts`, `getNowInfo.ts`): the ~05:30–01:00 no‑data messaging and night advisory are present and correct by inspection, labeled "source‑verified, not live" wherever cited.
- **VisitSeoul rate‑limit:** the brief warned VisitSeoul rate‑limits rapid calls → empty → grounding (expected graceful degradation). In practice **no rate‑limit empties were triggered** across the whole run (the deployed TTL cache absorbed repeats); therefore the "wrong category / restaurants for sightseeing" results below are **genuine content/relevance gaps, not throttling artifacts.**
- **Guardrails honored:** read‑only on server source/tests; only throwaway runner scripts were written (all deleted); no commits/pushes; `.env` untouched; no key values exposed.

---

## 2. Coverage matrix (every tool × every new path)

| Tool | Single‑turn | In journeys | New‑path coverage |
|---|---|---|---|
| searchPlaceForeigner | A1 (24) | J1,J2,J4 | VisitSeoul Seoul discovery ✓, dining→POI split ✓, VS‑empty→grounding ✓, non‑Seoul→grounding ✓, fuzzy/typo ✓, en/ja/zh/ko ✓ |
| getNowInfo | A2 (24) | J1,J2,J3,J4 | curated landmarks ✓, **VisitSeoul tier‑② hours ✓**, TourAPI fallback ✓, ambiguous ✓, native‑script ✓ |
| getAreaGuide | A2 | J1,J3,J4 | 11/21 hoods ✓, interest tailoring ✓, unlisted fallback ✓, enum error ✓ |
| getTransitRoute | A3 (11) | J1,J2,J3,J4 | intra ✓, **intercity grounding ✓**, no‑`from` prompt ✓, same‑place ✓ |
| trackBusArrival | A3 | J3 | non‑Seoul TAGO ✓, **Seoul fallback ✓**, EN→KO stop map ✓ |
| trackSubwayArrival | A3 | J1,J2,J3 | station ✓, line ✓, **journey countdown ✓**, did‑you‑mean ✓, off‑hours (source) |
| explainPayment | A4 (7) | J2,J3 | transit/market/taxi/kiosk/tipping ✓, PII bait ✓ |
| translateMenuContext | A4 (9) | J2 | allergen honesty ✓, injection ✓, multi‑dish ✓ |
| findForeignerFriendlyStore | A4 (7) | J1,J2,J3 | all 6 needs ✓, overview picker ✓ |
| getWeatherAndAir | A4 (5) | J3,J4 | KMA+air+**warnings** ✓, allSettled ✓, unknown city ✓ |
| getJejuInfo | A4 (4) | J4 | categories ✓, stale‑filter ✓ |
| Adversarial/multilingual | A5 (26) | — | gibberish/impossible/typo/ambiguous/conflicting/injection/PII/CJK ✓ |

---

## 3. Per‑scenario results (condensed scorecards)

> Legend: **C**=Correctness · **FF**=Foreigner‑friendliness · **Chip**=Chip quality · **UX**=UX continuity · **Rule**=Rule‑compliance · **Lang**=Language · **Grace**=Graceful degradation. Full per‑turn logs live in the sub‑agent transcripts; the most material rows are reproduced here.

### 3.1 Single‑turn — A1 searchPlaceForeigner & VisitSeoul (24)
On‑target & clean: `shopping/Myeongdong`, `nature/Seoul`, `bbq/Gangnam`, `halal/Itaewon`, `temple stay/Seoul`, `attractions/Busan`, `tourist spots/Gyeongju`, all 3 multilingual (names localized, UI English). **Relevance failures (🔴 Correctness):** `things to see/Insadong` (stale 2020 festival + restaurants), `good museums/Seoul` (concerts not museums), `kid‑friendly/Seoul` (hair salon/jewelry/makeup), `art galleries/Samcheong` (Aesop/Dr.Martens), `things to do/Jeonju` & `beaches/Gangneung` (clothing chains), and **all vague/CJK/typo non‑dining** (`musuems`, `가볼 만한 곳`, `観光スポット`, `景点` → restaurants). Dining split verified correct everywhere (POI labeled "live local search", never "official Seoul Tourism").

### 3.2 Single‑turn — A2 getNowInfo & getAreaGuide (31)
Curated landmark tier ① **13/13 🟢** (Gyeongbokgung, N Seoul Tower, Lotte World→Adventure, Bukchon, Changdeokgung, COEX, Han River, DDP, Gwangjang, War Memorial, Haeundae, Seongsan, Hallasan) — crisp 🟢/🔴 with correct closed‑days and live per‑city weather. **Tier‑② (VisitSeoul) 🔴**: Seoul City Wall Museum / Seoul Museum of History / National Museum of Korea show hours+closed‑days but **no go/no‑go verdict**. Ambiguous `Lotte`→"Lotte World Tower Luggage Storage" 🔴. `南山タワー`/`景福宮` native‑script → "not found" 🔴. getAreaGuide 11/11 tested hoods correct + graceful unlisted fallback (Pangyo), but `interest:"drinks"` → **raw ‑32602 error** 🔴.

### 3.3 Single‑turn — A3 transit family (31)
**getTransitRoute 11/11 🟢** including all intercity (Busan/Jeju="flight only"/Gyeongju/Sokcho="no train") with booking links — **ODsay is live and fast, no egress‑IP timeouts.** trackBusArrival: non‑Seoul live ✓, Seoul fallback clean ✓. trackSubwayArrival station/line modes ✓, did‑you‑mean ✓. **Journey mode** Hongdae→Gangnam flagged (see §4 R8 — count correct, direction wrong).

### 3.4 Single‑turn — A4 knowledge/essentials (31)
**Zero 🔴.** Allergen honesty solid (dairy/halal "not tracked" → no false safe; hidden broth/ham warnings fire; 닭갈비 not mis‑tagged). Injection ignored. No PII solicited. Weather allSettled + real "High seas advisory". 4 × 🟡: stale 2019 Jeju festivals (year in intro), foreignCardDining out‑of‑area spam, ATM list non‑ATM noise, multi‑dish silent drop.

### 3.5 Single‑turn — A5 adversarial & multilingual (26)
**Grace dimension very strong** — no fabrication, no injection compliance, no PII collection across all attacks. Gibberish/impossible/SQL/coupon‑bait all degrade to honest "couldn't find" + chips. 🔴: `景福宮/zh` dead‑end. 🟡: `Wakanda`→silent Seoul, `Busan→Busan`→misleading "timeout", `Lotte`→luggage storage, `spaceship` enum→raw error, ja image‑markdown noise.

### 3.6 Multi‑turn journeys — scorecards (20 journeys)
| Journey | Persona | T | C | FF | Chip | UX | Rule | Lang | Grace | Verdict |
|---|---|--|--|--|--|--|--|--|--|---|
| JR1 | US first‑timer (Insadong) | 5 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Flawless 5‑chip chain, zero re‑typing — the vision working |
| JR2 | K‑pop fan | 5 | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟡 | K‑pop search off‑intent; getNowInfo{Hongdae}→crab restaurant |
| JR3 | Shopaholic | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Best journey — shopping→area→essentials→exchange clean |
| JR4 | Family w/ kids | 4 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | Search misses; only user's own pivot to Lotte World rescues |
| JR5 | Foodie (Seongsu) | 4 | 🟡 | 🟢 | 🟡 | 🟡 | 🟢 | 🟢 | 🟢 | getNowInfo{Seongsu}→drugstore; no direct "food here" chip |
| JR6 | Muslim/halal | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Clean halal chain; broth warning fires (pork flag soft) |
| JR7 | Vegan | 4 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | Best allergen honesty (tofu broth + kimbap ham flagged) |
| JR8 | Budget backpacker | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Flawless payment→exchange→route→live subway |
| JR9 | Menu decode (gluten) | 4 | 🔴 | 🟡 | 🟡 | 🟡 | 🟢 | 🟢 | 🟢 | "Ordering sentence" dead‑end + "tteokbokki"→hair salons |
| JR10 | Street‑food payment | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | docs/09 ex.1 chains cleanly; ATM list 2 noise rows |
| JR11 | Late‑night Incheon arrival | 4 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | AREX route + live arrivals; track chip names origin not transfer |
| JR12 | Transit‑anxious newbie | 4 | 🟢 | 🟢 | 🟡 | 🔴 | 🟢 | 🟢 | 🔴 | **"Plan a route from here" → raw ‑32602 crash** |
| JR13 | Business (COEX) | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Flawless route→area→ATM→taxi‑pay, corporate Visa acknowledged |
| JR14 | Subway countdown (headline) | 4 | 🟡 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | Line‑2 journey shows only wrong‑direction trains |
| JR15 | Bus tracking Busan | 4 | 🟡 | 🟡 | 🟡 | 🟡 | 🟢 | 🟢 | 🟢 | Live data flows but bus 1003 ≠ resolved stop; 1st call timeout |
| JR16 | Japanese (ja) | 6 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | JA data persists; 南山タワー dead‑ends; verdict stays English |
| JR17 | Chinese (zh) | 5 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🔴 | 🟡 | zh‑Hans works; 景福宮 (traditional) hard dead‑end |
| JR18 | Korean (ko) | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Hangul area/origin/query all resolve & carry — production‑ready |
| JR19 | Jeju trip | 4 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | attraction→now→getting‑there→weather stitches; Jeju curation weak |
| JR20 | Elderly | 4 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | Plain, reassuring; only garbled bus‑stop romanization |

**Journey takeaways:** 8/20 journeys are flawless or near‑flawless (JR1,3,6,7,8,10,13,18,20) — the seamless chip‑chaining demo genuinely works. The failures cluster on **(a) getNowInfo resolving area/dish/specific names to a random business, (b) two chips that lead to a crash or a no‑op, (c) ja/zh native‑script dead‑ends, (d) Line‑2 journey direction.** A reality‑check on the chip set: the docs/04 example chip *"Find foreigner‑friendly restaurants here"* on getAreaGuide **does not exist** on the deployed build (it's "Find foreigner essentials here"), and route screens don't offer "What's around this station?" — the documented chip map is slightly ahead of the shipped chips.

---

## 4. Prioritized findings

> Each finding: severity · the offending tool/path · a concrete repro · observed (quoted) · fix recommendation with source file. Findings marked **[VERIFIED]** were re‑run first‑hand by the lead tester.

### 🔴 MUST‑FIX

**R1 — `getNowInfo` on a neighborhood/area name silently resolves to a random single business. [VERIFIED]**
- Path: getNowInfo VisitSeoul tier‑② · Repro: `getNowInfo{place:"Hongdae"}` (also `"Seongsu"`, `"홍대"`).
- Observed: `🕒 **Hongdae Soy Sauce Marinated Crab Hongilpum — right now** … Opening hours: 11:00‑21:30 … Closed on Mondays` — the user asked whether a *neighborhood* is good to go and got one crab restaurant's hours. `"Seongsu"`→"Seongsu Ready Young drug store".
- **Why it matters:** this fires on the **documented headline chip** (getAreaGuide's "Is it good to go now?" → `getNowInfo{place:area}`), i.e. in normal demo use, and produces a confidently‑wrong answer.
- Fix: in `src/tools/getNowInfo.ts` (~L177‑215), before the VisitSeoul lookup, detect known area names (reuse `getAreaGuide`'s area table) and return an **area‑level "now"** summary (area hours/vibe + live weather), the way the landmark path already does for Insadong/Lotte World. Additionally tighten `pickConfidentMatch` in `src/lib/sources/visitseoul.ts` (~L255‑269) to reject a hit when the query is a bare area token (require the query to cover a higher fraction of the *full* normalized title, not a substring).

**R2 — `getNowInfo` tier‑② gives NO go/no‑go verdict — the tool's core promise fails. [VERIFIED]**
- Path: getNowInfo VisitSeoul tier‑② · Repro: `getNowInfo{place:"Seoul Museum of History"}` (also Seoul City Wall Museum, National Museum of Korea).
- Observed: `🏛️ Opening hours: 09:00‑18:00 … Extended Hours: Every Friday until 21:00 … 🚫 Closed: Mondays` — **no `🟢 Open now` / `🔴 Closed` line anywhere.** It is Friday 16:36; the museum is open (and open late today), but the tool never says so. The whole tool sells "a clear go/no‑go" (its own description).
- Fix: `renderSeoulNow()` in `getNowInfo.ts` (~L131‑147) builds hour lines but never computes a verdict. Parse `d.hours`/`d.closedDays` into a verdict line (reuse the `landmarkVerdict()` machinery from `src/lib/landmarks.ts`), and ideally honor the "Friday until 21:00" extension. 3/4 tier‑② tests failed this (the 4th, Leeum, only passed because it's *also* a curated landmark alias).

**R3 — `searchPlaceForeigner` mis‑routes dish‑name / vague / CJK / kid / hallyu non‑dining queries → restaurants or wrong category. [VERIFIED]**
- Path: searchPlaceForeigner category inference · Repro: `searchPlaceForeigner{query:"tteokbokki", area:"Myeongdong"}`; also `{query:"kid-friendly experiences", area:"Seoul"}`, `{query:"가볼 만한 곳", area:"서울", language:"ko"}`, `{query:"good museums", area:"Seoul"}`.
- Observed (tteokbokki): `_official Seoul Tourism_` → `1. A:muu Hair … _Wellness_`, `2. … Makeup … _Wellness_`, `3‑4. Bricksand dessert`, `5. Lamb Skewers`, `6. Jjimdak` — **zero tteokbokki.** (kid‑friendly): hair salon, jewelry studio, makeup studio.
- Root cause: `inferCategory()`/`inferSeoulCategory()` (`searchPlaceForeigner.ts` ~L38‑78; `visitseoul.ts` ~L67‑81) return `undefined` for these queries, so dish queries skip the dining‑POI branch (gated on `cat==="food"`) and hit VisitSeoul's keyword browse; vague/kid/CJK queries fall to the dining‑heavy culture/experience/wellness node. **This is the exact chip path "Find a place that serves this".**
- Fix: (a) add the curated dish dictionary (mirror `translateMenuContext`'s DISHES) to `FOOD_TERMS`, and force `cat="food"` whenever a dish matches; (b) add `beach|things to do|sightsee|landmark|해변|볼거리|観光|景点|가볼` → attraction, and `kid|family|child`, `k-pop|hallyu` routes to the inferrers; (c) filter dining categoryPaths out of non‑dining discovery; (d) when none of the query terms appear in any returned title, prepend a one‑line hedge + an area‑pivot chip instead of silently returning off‑intent results.

**R4 — "Make an ordering sentence" chip is a dead‑end (no tool implements it). [VERIFIED]**
- Path: translateMenuContext chip · Repro: any `translateMenuContext{…}` → tap `Make an ordering sentence` (`주문 문장 만들기` — desc "a phrase to order this").
- Observed: the chip is present on **every** menu response; re‑invoking the tool returns the identical explanation with **no ordering phrase**, and no other tool maps to it.
- **Why it matters:** the foreigner who can't speak Korean is exactly who taps this — a silent no‑op on the tool's most actionable promise. (docs/09 example 2 demos this exact tap.)
- Fix: in `src/tools/translateMenuContext.ts` (chip ~L122), generate the sentence in‑handler from the already‑matched `found` dishes, e.g. `저기요, 떡볶이 하나 주세요 (jeogiyo, tteokbokki hana juseyo — "Excuse me, one tteokbokki please")`. If not backed this pass, drop the chip rather than ship a dead‑end.

**R5 — `Plan a route from here` chip → raw MCP `‑32602` validation error. [VERIFIED]**
- Path: trackSubwayArrival chip → getTransitRoute · Repro: `getTransitRoute{from:"Seoul Station"}` (no `to`).
- Observed: `MCP error -32602: Input validation error … path:["to"] … "Required"` — raw JSON‑RPC, **no Markdown, no chips, hard dead‑end.** The `Plan a route from here` chip (built in `trackSubwayArrival.ts`) is designed to carry only `from`.
- Fix: in `src/tools/getTransitRoute.ts` (~L106) make `to` optional; when absent, return a graceful `ok()` Markdown prompt ("📍 Starting from **{from}** — where to?") with destination‑suggestion chips, instead of letting Zod throw.

**R6 — Native‑script (traditional‑Chinese / Japanese‑kanji) landmark names dead‑end. [VERIFIED via A5]**
- Path: getNowInfo → resolveLandmark · Repro: `getNowInfo{place:"景福宮", language:"zh"}` and `{place:"南山タワー", language:"ja"}`.
- Observed: `⚠️ Place not found — I couldn't find 景福宮 …` — yet both are **curated** landmarks. Split‑brain confirmed: simplified `景福宫` reaches TourAPI‑zh but returns "No published hours found" (degraded, no curated verdict); traditional `景福宮` and the ja kanji form fail outright.
- **Why it matters:** worst‑case dead‑end for the **ja/zh personas the product explicitly targets** (D‑008 courts the #1/#2 inbound markets).
- Fix: add CJK aliases (both traditional + simplified) to the high‑traffic entries in `src/lib/landmarks.ts` — `景福宮/景福宫`, `南山タワー/南山塔/N首尔塔`, `昌德宮/昌德宫`, `明洞`, `東大門/东大门`, `仁寺洞`, `弘大`, `城山日出峰`, `海雲台/海云台`. Because `resolveLandmark` is API‑free, this fixes both the dead‑end and the degraded‑hours case instantly with no TourAPI round‑trip.

**R7 — Enum‑validation errors leak raw `‑32602` JSON‑RPC to the user. [VERIFIED via A2/A5]**
- Path: input schema enums · Repro: `getAreaGuide{area:"Euljiro", interest:"drinks"}`; `getJejuInfo{category:"spaceship"}`.
- Observed: `MCP error -32602: Input validation error … received 'drinks' … Expected 'food' | 'shopping' | 'history' | 'nightlife'` — a developer‑facing protocol dump, **the only responses in the whole suite that break the Markdown+chips contract.** "drinks" is the single most natural interest for Euljiro/Hipjiro, and an LLM client may well emit it.
- Fix: widen the enums to `z.string()` in `getAreaGuide.ts` (~L220/283) and `getJejuInfo.ts`, and normalize synonyms inside the handler (`drinks|bars`→nightlife) with a graceful fallback for unknowns — the handlers already have graceful "isn't especially known for X" paths these errors never reach. (Trigger likelihood depends on the client sending an off‑enum value; fix is trivial and removes the only contract break.)

**R8 — `trackSubwayArrival` journey mode misleads riders on the Line‑2 loop. [count corrected by empirical probe]**
- Path: trackSubwayArrival journey mode · Repro: `trackSubwayArrival{station:"Hongdae", to:"Gangnam"}`.
- Observed: `📍 **17 stops to go** from Hongik University. Stay on until Gangnam` with **Next trains: all four "to Seongsu"** and guidance "Board the train heading toward **Gangnam's side**."
- **Correction to a prior hypothesis:** A3 initially suspected "17 = the long way (should be ~9)". J3's 6‑pair empirical probe **falsified** this — 17 *is* the correct counterclockwise short‑way count (the clockwise long way ≈26). The real defect is **direction**: the only trains surfaced ("to Seongsu") run the *long* way, and "toward Gangnam's side" is undecidable on a loop — so a rider boards a long‑way train and the "17" countdown is then wrong for the train they're on. A minor off‑by‑one also exists on some pairs (Sindorim→Hongdae shows 5, short way 4).
- **Why it matters:** journey countdown is a *headline* "where do I get off" feature, and this misleads on Line 2 — the busiest line — during exactly the kind of demo that wins votes.
- Fix: in `renderJourney` (`trackSubwayArrival.ts` ~L122‑131) filter/label surfaced trains to the direction matching the chosen arc and name the concrete terminus to board ("board trains showing **to Sindorim**"), not "Gangnam's side"; in `stopsBetween` (`src/lib/sources/seoulSubway.ts` ~L164) compute `min(gap, totalLineStations − gap)` for circular Line 2 to fix the off‑by‑one and guarantee the short arc.

### 🟡 SHOULD‑FIX

- **Y1 — Stale past‑dated events surfaced as current.** `searchPlaceForeigner{things to see/Insadong}`→"2020 Insadong Culture Festival"; `getJejuInfo{festival}`→2019 events (year lives in `intro`, not `title`). Fix: filter `\b(19|20)\d\d\b` past‑years against `title + intro` in `visitseoul.ts` list parse and `jeju.ts` `isFresh` (~L85‑90). (A1, A4)
- **Y2 — Dining qualifiers silently dropped.** `"vegan ramen"`→generic ramen, `"quiet cafe to work"`/`"late night street food"` ignore the qualifier (`foodKeyword()` collapses to the first dish term). Fix: compose qualifier+dish or add a "can't guarantee vegan — confirm on‑site" caveat. (A1)
- **Y3 — "museums"/"historic palaces" rank events & tangential sites above the real thing** (Gyeongbokgung at #5‑6 under "historic palaces"). Fix: prefer `Museums`/`palace` categoryPaths/title‑matches. (A1)
- **Y4 — Markdown artifacts in VisitSeoul renders.** literal `<Running Man>` angle brackets (may render as a broken HTML tag) and raw `![photo](https://api.visitseoul.net/…)` image URLs (~80 chars each, noise in a text‑only chat client). Fix: run list summaries through `stripHtml`/entity‑escape (`visitseoul.ts` ~L165/213) and reconsider thumbnails for the chat surface. (A1, A5)
- **Y5 — Romanized addresses & stop names run together.** POI `Mapogu Wausanro35Gil`, ODsay legs `ItaewonYeok.Bogwangdongipgu`, bus stops `Namsan3Hoteoneol…`. This is the one string a foreigner pastes into Maps — real friction. Fix: insert separators at gu/ro/gil boundaries (`Mapo‑gu Wausan‑ro 35‑gil`) in the romanizer. (A1, A3, J1, J4) — extends C10.
- **Y6 — Misspelled area names not fuzzy‑resolved → empty.** `area:"Seongsoo"`, `area:"Myungdonggg"` return "no places". Fix: route `area` through `fuzzy.resolveName` before VS/TourAPI; use the existing RETRY chip set on the empty‑results path. (A1, A5)
- **Y7 — Ambiguous bare names silently pick an odd match.** `getNowInfo{place:"Lotte"}`→"Lotte World Tower Luggage Storage". Fix: when the VisitSeoul hit is a weak/no‑hours/utility match for a bare brand token, offer candidate chips (the TourAPI path already has `distinctByType`); exclude "Luggage Storage"/"Information Center" entries. (A2, A5)
- **Y8 — `getWeatherAndAir` unknown city silently defaults to Seoul.** `city:"Wakanda"`→Seoul data with no note (a user who typo'd "Busann" gets confidently‑wrong Seoul weather). Fix: prepend "I don't have 'X' — showing Seoul; did you mean Busan/…?" in `resolveCity` (`weatherair.ts`). (A5)
- **Y9 — No same‑origin/destination guard on `getTransitRoute`.** `{to:"Busan", from:"Busan"}`→misleading "Couldn't reach routing service … timeout". Fix: early‑return "You're already at X" when normalized `from===to`. (A5)
- **Y10 — No direct "find food here" chip on `getAreaGuide`.** Foodies must infer essentials‑picker → "Foreign‑card‑friendly food" (2 non‑obvious taps); the docs/04 chip "Find foreigner‑friendly restaurants here" doesn't exist on the build. Fix: for `interest:"food"`, swap one chip to "🍽️ Find foreigner‑friendly places to eat here" → `findForeignerFriendlyStore{area, need:"foreignCardDining"}`. (J1)
- **Y11 — `findForeignerFriendlyStore` POI noise.** `need:"atm"` lists "piknic Seoul"/"Paulie's Pizzeria"/"If Cafe"; `need:"foreignCardDining"` for Gangnam returns a Seongdong‑gu pipe‑spam listing (`성수다락 | 성수 레스토랑 | …`). Fix: tighten POI category filter per need, distance‑gate against the resolved coord, drop names containing `|`/repeated keywords, dedupe identical name+address. (A4, J2)
- **Y12 — Allergen under‑tagging.** 순대 not flagged for gluten despite its own description "noodles and **barley**"; halal pork dishes (제육볶음/김치찌개) get the soft broth note but **no hard per‑dish "contains pork — not halal" flag**. Fix: add `gluten` to 순대's allergens; when a concern matches `/halal/` and a dish's allergens include `pork`, emit a per‑dish ⚠️ (`translateMenuContext.ts` ~L35/100). Honesty is right in spirit — these close two specific gaps. (J2)
- **Y13 — Multi‑dish menu silently drops unrecognized tokens.** `"회 물회 산낙지"`→only 회; `물회/산낙지/국밥` vanish with no "couldn't identify X". Fix: append a soft unmatched‑items note. (A4)
- **Y14 — `getNowInfo` on a specific place name falls back to the area landmark, dropping specificity.** `"Bongchu Jjimdak Myeongdong"`→"Myeongdong Shopping Street" hours. Fix: try a POI/VisitSeoul lookup on the full string before degrading to the area. (J2)
- **Y15 — Dynamic subway‑track chip names the origin, not the transfer/alight station.** Incheon Airport→Myeongdong offers "Track the subway at Incheon Airport T1" when the rider wants the AREX transfer. Fix: also offer "Track the subway at {transfer station}". (J3)
- **Y16 — Busan bus continuity.** Route recommends bus 1003 but the generic `dropOffStop:"Haeundae"` resolves to "Haeundaesijang" (a stop 1003 doesn't serve) → "bus 1003 isn't in the live list", and the next chips are **untypeable Korean bus names** (해운대구2/7/10). Plus the first call timed out (p99 risk). Fix: carry the route leg's exact resolved end‑stop into the `Track bus {n}` chip; romanize bus‑name chips; verify TAGO timeout/retry budget. (J3)
- **Y17 — Station‑arrivals wall of text at mega‑interchanges.** `station:"Seoul Station"` = 1,856 chars / 17 direction groups incl. self‑referential "to Seoul Station (via Seoul Station)" AREX rows. Fix: cap to ~4‑6 directions, collapse self‑referential rows (`trackSubwayArrival.ts` render). (A3)
- **Y18 — Curated‑landmark verdict body stays English even when `language:ja/zh`.** "🟢 Open now" + note render English on the landmark path regardless of `language`. Acceptable for contest scope (chips are English by design); note as a consistency gap, larger effort. (J4)
- **Y19 — `getJejuInfo{attraction}` surfaces niche operators over iconic sights** (scuba shops/foot‑bath over Seongsan/Manjanggul/Hallasan). Fix: seed/sort attraction list from curated Jeju landmarks. (J4)
- **Y20 — Hallasan "Good to go now" at 16:19 ignores summit entry cutoffs.** Daylight verdict doesn't echo the strict trail cutoff its own note warns about. Fix: for `daylight`+mountain, down‑rank to a 🟠 advisory after ~14:00. (A2)
- **Y21 — N‑prefix night bus offered as a daytime route option** (N73 at 16:30). Fix: de‑prioritize/annotate `N###` outside ~23:30‑06:00. (J1)
- **Y22 — `getNowInfo` National Museum closed‑days raw dump** (~250‑char wall of edge cases). Fix: `clip()` the closed‑days string and lead with the verdict (compounds R2). (A2)

### 🟢 POLISH
- **G1** — "Ssamziegil" typo (→ Ssamzigil) in getAreaGuide Insadong copy. (A2)
- **G2** — `language:"ko"` getNowInfo body still English (expected by design; chips are English too). (A2, J4)
- **G3** — 맛집 query result mislabeled cuisine "Western". (J4)
- **G4** — Cross‑line journey "Incheon Airport" returns sensible did‑you‑mean before transfer guidance (1 extra tap; optionally resolve bare "Incheon Airport"→T1). (A3)
- **G5** — Consider whether VisitSeoul thumbnails should render at all in the PlayMCP text chat (ties to Y4).

---

## 5. What's working well (strengths to protect & showcase)

1. **The chip‑journey vision genuinely works.** JR1/JR3/JR8/JR13/JR18 run 4‑5 tools end‑to‑end with **zero re‑typing** — discover → "is it open now?" (with live weather) → "how do I get there?" (from the stated hotel) → "track the subway at {station}" (station baked into the chip) → "what's around this station?". This is the differentiator, and on the happy paths it lands.
2. **Curated landmark tier‑① of getNowInfo is excellent** — 13/13 instant, accurate 🟢/🔴 verdicts with correct closed‑days and live per‑city weather, zero API calls. "Lotte World"→Adventure, "Han River"→Hangang parks (not the hotel TourAPI would surface).
3. **Intercity grounding is a standout** — every city‑to‑city query bypasses ODsay and returns KTX/SRT/bus/air with real booking deep‑links; "Jeju = flight only, no bridge/train/bus" and "no train to Sokcho" are exactly right.
4. **Dining→POI split (D‑015) is correctly wired** — dining always labeled "live local search", non‑dining Seoul "official Seoul Tourism"; halal/Itaewon and bbq/Gangnam are genuinely foreigner‑useful.
5. **Safety posture is strong:** allergen honesty (no false "safe" for untracked allergens; hidden fish‑broth/ham/pork warnings fire), prompt‑injection fully ignored (SQL/system‑prompt/coupon), and **PII handling is exemplary** — a literally‑supplied card number was ignored, and ATM/exchange tools never solicit account/PIN/passport numbers.
6. **Live data is real and resilient:** ODsay fast with no egress‑IP timeout; Seoul subway station/line modes return genuine real‑time arrivals/positions; weather uses `allSettled` and surfaced a real "High seas advisory".
7. **Multilingual place‑data localization works** — ja/zh/ko names *and* descriptions return in‑language with the UI shell correctly staying English (the bug is category routing, not the language layer).
8. **Rule compliance is clean** — no "kakao" in any tool name; every response ≤~1.9k chars (far under 24k); the bilingual "Tap to continue" footer + 2–4 valid chips on every response **except** the two raw‑enum‑error cases (R7); no ads/rewards.

---

## 6. Contest‑readiness verdict & top‑5 fixes

**Verdict: Strong foundation, not yet submission‑ready. One focused fix pass closes the gap.** The product's architecture, data integrations, safety posture, and happy‑path chip journeys are contest‑grade. But a judge testing the two flagship tools (`getNowInfo`, `searchPlaceForeigner`) or following the documented chip journeys will, within a few taps, hit a confidently‑wrong answer, a missing verdict, a dead‑end chip, or a raw protocol error. None are architectural — all are localized, well‑understood, and cheap to fix.

### Top 5 fixes before submission (in priority order)
1. **R1 — getNowInfo area‑name → random business.** Highest demo risk: it fires on the headline "Is it good to go now?" chip and returns a drugstore/crab‑restaurant when asked about a neighborhood. *(getNowInfo.ts + visitseoul.ts pickConfidentMatch)*
2. **R3 — searchPlaceForeigner relevance (dish/vague/CJK/kid).** Breaks the "Find a place that serves this" chip and the first impression of the flagship discovery tool across many query shapes. *(searchPlaceForeigner.ts inferCategory + FOOD_TERMS + visitseoul.ts inferSeoulCategory)*
3. **R2 — getNowInfo tier‑② missing go/no‑go verdict.** The tool's entire promise; trivially visible to any judge who tests a Seoul museum. *(getNowInfo.ts renderSeoulNow + landmarkVerdict reuse)*
4. **Chip‑integrity cluster (R4 + R5 + R7).** Eliminate every chip/path that leads to a no‑op or a raw `‑32602` error — the "Make an ordering sentence" dead‑end, the "Plan a route from here" crash, and the enum‑error leaks. These read as broken software to a judge and are the cheapest wins. *(translateMenuContext.ts, getTransitRoute.ts schema, getAreaGuide.ts/getJejuInfo.ts enums)*
5. **R6 — CJK landmark aliases.** One‑file, high‑value fix for the ja/zh inbound markets the product explicitly courts; removes a hard dead‑end on the most‑asked palace/tower. *(landmarks.ts)*

**Runner‑up (do if time):** R8 (Line‑2 journey direction — the headline "where do I get off" feature misleads on the busiest line) and Y5 (romanized address spacing — the string foreigners actually paste into Maps).

---

## 7. Appendix — full scenario inputs

**Single‑turn (≈140):**
- *A1 searchPlaceForeigner (24):* things‑to‑see/Insadong · good museums/Seoul · shopping/Myeongdong · nature/Seoul · historic palaces/Seoul · kid‑friendly/Seoul · art galleries/Samcheong · vegan ramen/Hongdae · korean bbq/Gangnam · quiet cafe/Seongsu · late night street food/Myeongdong · halal/Itaewon · temple stay/Seoul · indie bookshops/Seoul · attractions/Busan · things to do/Jeonju · beaches/Gangneung · tourist spots/Gyeongju · "I'm bored"(no area) · instagram/Seongsoo(typo) · musuems/Seoul · 観光スポット/Seoul/ja · 景点/Seoul/zh · 가볼 만한 곳/서울/ko.
- *A2 getNowInfo+getAreaGuide (31):* getNowInfo Gyeongbokgung · N Seoul Tower · Lotte World · Bukchon · Changdeokgung · COEX Aquarium · Han River Park · DDP · Gwangjang Market · War Memorial · Haeundae Beach · Seongsan Ilchulbong · Hallasan · Seoul City Wall Museum · Leeum · Seoul Museum of History · National Museum of Korea · Lotte · Han River · gyeongbok gung(typo) · Random Cafe 12345 · 南山タワー/ja · 경복궁/ko. getAreaGuide Hongdae/nightlife · Insadong · Haeundae · Seogwipo · Euljiro/drinks · Garosu‑gil · Pangyo(unlisted) · Gangnam/shopping.
- *A3 transit (31):* getTransitRoute Gyeongbokgung←Seoul Station · Hongdae←Incheon Airport · COEX←Myeongdong · Gangnam←Itaewon · N Seoul Tower←Hongdae · Bukchon(no from) · 해운대←부산역 · Busan←Seoul · Jeju←Seoul · Gyeongju←Seoul · Sokcho←Seoul. trackBusArrival 1003/Haeundae/Busan · 100/동대구역/Daegu · 111/Songdo/Incheon · 143/Myeongdong/Seoul · 272/Gwanghwamun/Seoul. trackSubwayArrival Gangnam · Seoul Station · line:2 · line:Line 4 · Hongdae→Gangnam · Seoul Station→Incheon Airport · Myungdong(typo) + 8 follow‑up probes.
- *A4 knowledge (31):* explainPayment ×7 (subway/Visa, market, taxi/MC, kiosk, restaurant/Amex, tipping, T‑money). translateMenuContext ×9 (soy, dairy, gluten+pork, egg, raw seafood, fried chicken, halal/pork, drinks, injection). findForeignerFriendlyStore ×7 (overview + 6 needs). getWeatherAndAir ×5 (Seoul/Busan/Jeju/default/Daegu). getJejuInfo ×4.
- *A5 adversarial+multilingual (26):* gibberish ×5 · impossible ×5 · typo‑real ×4 · ambiguous ×4 · conflicting ×3 · injection ×3 · PII bait ×2 · multilingual ×5 · off‑hours (source‑verified).

**Multi‑turn journeys (20 / ≈100 turns):** JR1‑JR20 as scored in §3.6; each 4–6 turns of read‑chips → tap → map → carry context. Detailed per‑turn `tool{args} → [chips] → tapped → mapped; CLEAN✓/ISSUE✗` logs are in the sub‑agent transcripts (J1‑J4).

**Lead‑verified first‑hand (5):** R1 getNowInfo{Hongdae}, R5 getTransitRoute{from only}, R3 searchPlaceForeigner{tteokbokki/Myeongdong}, R2 getNowInfo{Seoul Museum of History}, R4 translateMenuContext ordering‑chip — all confirmed as described above.

---
*Report generated by a 9‑sub‑agent parallel UX test harness against the live deployed endpoint. No server source/tests were modified; all throwaway runner scripts were deleted; `.env` and keys were never touched or exposed.*
