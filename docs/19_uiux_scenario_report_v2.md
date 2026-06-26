# 19. UI/UX Scenario Test Report v2 — Korea Trip Concierge (post‑D‑016, 12 tools)

> **Date:** 2026‑06‑27 (Sat ~01:45–02:05 KST) · **Target:** LIVE deployed endpoint `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp` (just redeployed, **tools: 12**, health `sources` all `true`) + byte‑identical local handlers for deterministic curated coverage.
> **Scope:** Fresh, rigorous re‑test focused on the **NEW surface since v1** — the brand‑new 12th tool `explainKoreanService`, the greatly‑expanded `explainPayment`, the menu diet flags, the `emergency` essentials need, the transit Naver tip — while **regression‑checking** that v1's fixes (docs/17, R1–R8 + Y‑series) still hold.
> **Method:** ~**180 single‑turn** + ~**22 multi‑turn chip journeys (~95 turns)** across 14+ personas, run by the lead tester directly (curated + key regressions, ground‑truth observed) **plus 5 parallel sub‑agents** (3 journey slices + 2 single‑turn breadth/adversarial slices); the 4 highest‑severity findings were **independently re‑verified first‑hand** against the deployed endpoint.
> **Verdict (TL;DR):** The product is **stronger than at v1** — the 12th tool delivers real, accurate, PII‑safe value, the expanded payment matrix is excellent, and **v1's 8 must‑fixes all hold**. But this round surfaced a tight cluster of **3 new must‑fix issues** a judge could plausibly hit in the first few taps: (1) the flagship new tool **mis‑routes "KakaoTalk sign‑up" → the Taxi guide** (the literal example string in its own schema), (2) an **adult‑entertainment "room salon" appears in foreigner ATM results** (deterministic, reputation‑risky in a KakaoTalk surface), and (3) **raw `‑32602` still leaks** on realistic `language` values ("english"/"chinese"/"japanese") — the v1 R7 enum fix missed the `language` params. **Still close to submission‑ready; one focused ~half‑day fix pass closes the gap.** See §7 for the top‑5.

---

## 1. Methodology — benchmark vs. improvements

### 1.1 What v1 did (benchmark)
v1 (docs/17, 2026‑06‑26): ~240 scenarios (≈140 single + ≈100 multi‑turn), 12–15 personas, **9 parallel sub‑agents**, 7‑dimension rubric, dedicated adversarial slice, 5 most‑severe findings lead‑verified. It produced an 8‑item must‑fix list (R1–R8) + 22 should‑fix (Y1–Y22). Those fixes were subsequently shipped (D‑016 + the R/Y cleanup commits).

### 1.2 How this test improved on it
| Dimension | v1 | **v2 (this test)** |
|---|---|---|
| Surface weighting | even across 11 tools | **~50% weighted to the NEW surface** — every `explainKoreanService` service (all 10) + GENERIC + detail sub‑routing; new `explainPayment` topics; menu diet flags; `emergency` need; transit Naver tip |
| Tool count | 11 | **12** (new `explainKoreanService`) |
| Verification | 5 lead‑verified | **4 highest‑severity re‑run first‑hand on deployed**, each confirmed deterministic |
| Test surface | deployed only | **deployed (real product) + byte‑identical local handlers** (verified identical: `explainKoreanService/explainPayment/translateMenuContext` all `IDENTICAL=true`) → fast, deterministic curated coverage, deployed for live‑API truth |
| Time‑of‑day honesty | 16:15 KST (all open) | **01:45 KST (off‑hours)** — subway closed, late‑night verdicts; documented which results are expected graceful degradation vs. real bugs |
| New‑tool focus | n/a | dedicated **accuracy/currency audit** of `explainKoreanService`'s curated 2026 facts + an adversarial pass (gibberish/off‑list/ja‑zh/injection) |

### 1.3 Honesty / sampling notes
- **Time of day:** the run was ~01:45–02:05 KST (Saturday, off‑hours). The **Seoul subway is closed (05:30–01:00)**, so `trackSubwayArrival` live modes correctly degrade to "no live trains, runs 05:30–01:00" — this is **expected, not a bug**, and is reported as such. `getNowInfo` curated landmarks correctly read 🔴 Closed / late‑night. R8 (Line‑2 loop) could not be live‑tested; it was **source‑verified** instead (the short‑arc count fix + honest loop guidance are present — see §5/R8).
- **Local cold‑cache:** a fresh local `tsx` process has an empty cache; at this hour the first ODsay/TourAPI calls sometimes returned "temporarily unavailable." The **deployed endpoint (warm cache, KC egress IP) is the source of truth** for API tools and was used for every API‑dependent finding. The deployed endpoint served live transit/museum/weather data cleanly throughout.
- **Holiday banner:** today (2026‑06‑27) is **not** a Korean holiday, so the 🎌 Seollal/Chuseok banner cannot fire live. The logic was **source‑verified** in `src/lib/holidays.ts` (lunar dates exact for 2026–27 per date.nager.at; `major` only for Seollal/Chuseok; `holidayBanner()` copy correct). Logic is sound; not reported as "no banner."
- **Guardrails honored:** read‑only on server source/tests; only throwaway `_uxtest/*.mts` runner scripts written (all deleted); no commits/pushes/PRs; `.env` copied locally only, never committed; **no key values exposed**.

---

## 2. Coverage matrix

| Tool | Single‑turn | In journeys | New‑surface coverage |
|---|---|---|---|
| **explainKoreanService ★NEW** | ~30 (all 10 services ×, GENERIC ×, detail‑routing ×, adversarial ja/zh/injection/PII) | J1,J3,J5,J6,J7,J8 + A1,A2 | all 10 services ✓, GENERIC fallback ✓, detail→combined‑match ✓, year‑guard (entryDocs) ✓, 1330 thread ✓ |
| **explainPayment ★EXPANDED** | ~20 (KTX/SRT, VAT, ATM/DCC/PIN, online, T‑money deep, Apple/Samsung, tip, split, market, conv, hotel, admission, generic) | J2,J3,J5,J7 + most journeys | every new topic routes ✓; T‑money tap‑out/Climate/K‑Pass/refund ✓; ATM 4‑digit‑PIN/DCC ✓ |
| **translateMenuContext ★diet flags** | ~12 (veg/halal/vegan, dairy honesty, multi‑dish, long‑menu, injection) | J5,J6,A2 | inline ordering phrase ✓ (R4 fixed), Korean diet phrase‑card ✓, per‑dish pork flag ✓; **veg flag misses beef/chicken ✗** |
| **findForeignerFriendlyStore ★emergency need** | ~10 (all 7 needs + overview + unknown‑need) | J4,J6,A1,A2,A3 | `emergency` (119/1339/1330) ✓, ATM 4‑digit‑PIN ✓, `z.string` need (no enum crash) ✓; **ATM POI leak ✗**, emergency chips tone‑deaf ✗ |
| **getTransitRoute ★Naver tip** | ~12 | J1,J2,J3,J5,J8,A1,A3,A5 | Naver‑Map walking tip ✓, transfer‑track chip ✓ (Y15), same‑origin guard ✓ (Y9), from‑only graceful ✓ (R5), intercity grounding ✓ |
| getNowInfo | ~20 (12 curated landmarks, museums, area names, ambiguous, CJK, specific business) | J1,J3,J5,A2,A4,A5,A6 | R1 area→neighbourhood ✓, R2 tier‑② verdict ✓, R6 CJK ✓; **no weather line on curated path ✗** |
| searchPlaceForeigner | ~16 | J2,J4,J5,J7,A4,A5,A6 | dining→POI split ✓; **non‑dining vague/specific off‑intent ✗ (R3/Y3 residual)**, language enum crash ✗ |
| getAreaGuide | ~16 (15 hoods + unlisted + interest variations) | J1,J3,J7,A4 | 21 hoods ✓, interest tailoring ✓, unlisted fallback ✓, R7 `interest` graceful ✓, food chip ✓ (Y10) |
| getWeatherAndAir | ~8 (Seoul/Busan/Jeju/Daegu/Gwangju/Gangneung/unknown) | J5,J8,A5 | per‑city forecast ✓ (verified), warnings ✓, allSettled ✓, unknown‑city note ✓ (Y8) |
| trackSubwayArrival | ~4 + source | J3,A3 | off‑hours graceful ✓; R8 loop fix source‑verified |
| trackBusArrival | ~4 | J3 | non‑Seoul TAGO graceful ✓, Seoul→fallback ✓ |
| getJejuInfo | ~4 | J8 | categories ✓, R7 bad‑category graceful ✓; attraction relevance weak |
| Adversarial / safety | ~12 | — | injection ignored ✓, PII never stored/echoed/solicited ✓, ads/coupon refused ✓ |

---

## 3. New‑tool assessment — `explainKoreanService` (the headline)

**Coverage — excellent.** All 10 curated services route and render the full ⛔blocker → ✅workaround → 🔁twin → 🆘fallback → ☎️1330 structure; GENERIC fires for off‑list/blank/gibberish; `detail` is concatenated to `service` for matching, so detail‑only routing works (`{service:"I'm stuck", detail:"Kakao T card error"}` → Taxi; `{service:"help", detail:"ambulance"}` → Emergency). Every response ends with the universal **1330** safety line + 3 chips. Knowledge‑only (no API/login/PII) — fully Kakao‑rule‑safe.

**Correctness / currency — clean for 2026.** I audited every curated fact against the 2026 reality:
- Emergency numbers **119 / 112 / 1339 / 1330** — all correct; 1330's 3‑way interpretation correct.
- Foreigner "twin" apps **k.ride, Shuttle Delivery, CatchTable Global, Coupang Global / Gmarket Global, Klook / Trazy** — all current and real.
- **entryDocs year‑guard works:** today (2026‑06‑27 < 2027‑01‑01) correctly shows the *2026* note ("K‑ETA waived for 67 visa‑waiver nationalities through Dec 31 2026"), date‑stamped, with official links **k‑eta.go.kr** + **e‑arrivalcard.go.kr**. Paper arrival card abolished Jan 2026 / Q‑code framing correct.
- **VAT refund** ≥₩15,000 / stays ≤6 months / ≈5–7% back — correct, date‑stamped.
- **No stale facts found.** The "as of 2026" stamps are by‑design and appropriate.

**Defects (new):** the routing has two keyword gaps and the chips are static — see N1, N4, N5 below. These do not affect content accuracy, only which guide you land on and where the tool hands you next.

---

## 4. Regression check — did v1's fixes hold?

| v1 finding | Status | Evidence (this run) |
|---|---|---|
| **R1** getNowInfo area‑name → random business | ✅ **HOLDS** | `{Hongdae}`/`{홍대}`/`{Seongsu}` → "is a neighbourhood, doesn't open/close" + late‑night note. Not a crab restaurant. |
| **R2** getNowInfo tier‑② no verdict | ✅ **HOLDS** | `{Seoul Museum of History}` (deployed) → "🔴 Closed now — opens 09:00" + hours + Mon‑closed + subway + weather. `{National Museum}` verdict too. |
| **R3** searchPlaceForeigner dish/vague mis‑route | 🟡 **PARTIAL** | Dish routing **fixed** (`tteokbokki`→food restaurants, no more hair salons). **Non‑dining vague/specific still off‑intent** → see N9. |
| **R4** "ordering sentence" dead‑end chip | ✅ **HOLDS** | Ordering phrase now rendered **inline** ("🗣️ To order: 이거 주세요…"); dead‑end chip removed. |
| **R5** getTransitRoute `from` only → ‑32602 | ✅ **HOLDS** | `{from:"Seoul Station"}` → graceful "Where do you want to go?" + destination chips. No crash. |
| **R6** CJK landmark dead‑end | ✅ **HOLDS** | `{景福宮, zh}`→Gyeongbokgung; `{南山タワー, ja}`→N Seoul Tower, both with verdicts. |
| **R7** enum errors leak raw ‑32602 | 🟡 **PARTIAL** | `interest`/`category`/`need` **fixed** (graceful). **`language` enums still crash** on realistic values → see N3 (regression‑class). |
| **R8** Line‑2 journey misleads | ✅ **HOLDS (source)** | `stopsBetween` has the loop short‑arc fix (`subwayId 1002`, `stops = 43 − stops`); `renderJourney` gives honest "both directions reach X, cross over if the count climbs" guidance. Not live‑testable (subway closed). |
| **Y8** weather unknown city → silent Seoul | ✅ **HOLDS** | `{Wakanda}` → "I don't have data for Wakanda — showing Seoul. I cover Busan, Incheon…" |
| **Y9** no same‑origin guard | ✅ **HOLDS** | `{to:Busan, from:Busan}` → "You're already at Busan — no transit route needed." |
| **Y10** no food chip on getAreaGuide | ✅ **HOLDS** | `{Hongdae, food}` → "🍽️ Find foreigner‑friendly places to eat in Hongdae" chip. |
| **Y15** track chip names origin not transfer | ✅ **HOLDS** | route chips now include "🔀 Track the subway at {transfer} — your transfer station." |
| **Y4** image‑markdown noise · **Y5** romanization run‑together | 🟡 **PERSIST** | Still present on search lists → see N11. |
| **Safety** (injection / PII / ads) | ✅ **HOLDS** | All injection ignored; PII never stored/echoed‑as‑data/solicited; coupon/ad bait refused. |

**Net:** every v1 must‑fix holds except the two that were only *partially* completed — **R3** (dish fixed, non‑dining vague residual) and **R7** (interest/category/need fixed, `language` missed). Both reappear below as findings.

---

## 5. Prioritized findings

> Severity · offending tool/path · concrete repro · observed · fix recommendation (source file). **[VERIFIED]** = re‑run first‑hand on the deployed endpoint this round.

### 🔴 MUST‑FIX

**N1 — `explainKoreanService` mis‑routes "KakaoTalk sign‑up" → the Taxi guide. [VERIFIED]**
- Path: `src/tools/explainKoreanService.ts` routing regex · Repro: `explainKoreanService{service:"KakaoTalk sign-up"}`.
- Observed: header `🧭 **🚕 Taxi apps (Kakao T) — getting past it**` with **100% taxi content** (Pay‑to‑driver, k.ride…). The correct 🆔 sign‑up/본인인증 guide exists and renders fine via `{service:"kakaoNaverSignup"}`.
- Root cause: the taxi matcher `/(taxi|kakao ?t|cab|…)/i` — `kakao ?t` matches the "**KakaoT**" inside "**KakaoT**alk", and Taxi is index 0 (checked before the sign‑up matcher at index 4). `.find()` returns Taxi first.
- **Why it matters:** "KakaoTalk sign‑up" is the **literal example string in the tool's own `inputSchema` description**, a documented service (`kakaoNaverSignup`), and the most natural phrasing a real user/LLM sends. It returns confidently‑wrong content with no error — exactly the class v1 rated must‑fix.
- Fix: add a word boundary / negative‑lookahead so `kakao ?t` won't fire inside "kakaotalk" (e.g. `kakao ?t\b` — "Kakao T" still matches, "KakaoTalk" no longer does), **or** move the `kakaoNaverSignup` matcher (match `kakaotalk|kakao talk|sign.?up|본인인증`) above the taxi matcher in `SERVICES`.

**N2 — Adult‑entertainment "room salon" surfaces in foreigner ATM results. [VERIFIED — deterministic ×3]**
- Path: `src/tools/findForeignerFriendlyStore.ts` `renderNearby()` POI filter · Repro: `findForeignerFriendlyStore{area:"Gangnam", need:"atm"}` (deployed).
- Observed: result #4 = **"Gangnamrumssarong Pulssarong (강남룸싸롱 풀싸롱)"** — a 유흥/room‑salon (adult entertainment) venue — listed among KB/Shinhan ATMs, **identically across all 3 runs** (cached, not random). Other areas (Itaewon/Hongdae/Myeongdong) were clean.
- **Why it matters:** this product is exposed to KakaoTalk/Kakao Tools users; a foreigner (incl. families/business) asking for an ATM should **never** see an adult venue. Reputation/review risk far out of proportion to the bug size.
- Fix: in `renderNearby()` (~L140) add an adult/유흥 blocklist to the existing `FOOD_RE` guard — `/룸싸롱|룸살롱|풀싸롱|단란|유흥|안마|massage|room.?salon|club/i` — and/or for `need:"atm"` restrict to bank / convenience‑store / ATM categories. The same blocklist also cleans the known ATM noise (piknic Seoul, Paulie's Pizzeria — Y11).

**N3 — Raw `‑32602` still leaks on realistic `language` values and on a missing required field (R7 residual). [VERIFIED]**
- Path: `language` enums (`getNowInfo.ts`, `searchPlaceForeigner.ts`) + required‑field guards · Repro: `getNowInfo{place:"Gyeongbokgung", language:"english"}`; `getNowInfo{…, language:"chinese"}`; `searchPlaceForeigner{query:"shopping", area:"Myeongdong", language:"japanese"}`; also `searchPlaceForeigner{searchPlaceForeigner:"x", area:"Seoul"}` (wrong key → `query` missing).
- Observed: bare `MCP error -32602: Input validation error … Invalid enum value. Expected 'en' | 'ja' | 'zh' | 'ko', received 'english'` — **raw JSON‑RPC, no Markdown, no chips.** These are the only contract‑breaking responses found, identical to the class v1 R7 declared must‑fix.
- **Why it matters:** an LLM client mapping the user's language frequently emits `"english"/"chinese"/"japanese"/"korean"` rather than ISO codes — a **high‑likelihood** trigger, more so than the off‑enum interest values v1 already fixed. v1 widened `interest`/`category`/`need` to `z.string()` but **missed the two `language` params** (and there's no graceful guard on the required `query`).
- Fix: change `language` to `z.string().optional()` in both tools and normalize in‑handler (`english→en`, `chinese→zh`, `japanese→ja`, `korean→ko`, default `en`), mirroring the R7 approach. For `query`, coerce from any string arg / `area` (or return the normal "no places — broaden your term" card) instead of letting Zod throw.

### 🟡 SHOULD‑FIX

**N4 — `explainKoreanService` follow‑up chips are 100% static and never bridge to sibling tools. [corroborated by all journey agents]**
- Path: `CHOICES` constant in `explainKoreanService.ts` · Repro: every service returns the identical 3 chips (taxi / restaurant / kiosk) regardless of `service`.
- Observed: after `eSIM` you get a "taxi" chip; after `entryDocs` no "set up eSIM" chip; after `onlineShopping`/`taxRefund` no "how do payments work?" chip; and the just‑asked topic is re‑offered (ask Taxi → still get the Taxi chip).
- **Why it matters:** this is **the** reason all 8 "stuck → unstuck" journeys needed external glue — the headline new tool never hands the user forward into the route/pay/store tools that complete the unstuck flow. UX‑continuity was the weakest dimension across every journey.
- Fix: make the chip footer service‑aware — (a) drop the chip equal to the current service; (b) add one cross‑tool bridge chip per service (e.g. `entryDocs`→"Set up eSIM/data", `taxiApp`→"How do I get to my hotel?" (getTransitRoute), `foodDelivery`→"Find a convenience store" (findForeignerFriendlyStore), `onlineShopping`/`taxRefund`→"How do payments work?" (explainPayment), `kiosk`→"Translate this menu" (translateMenuContext), `emergencyMedical`→"Find a 24h pharmacy").

**N5 — Routing‑keyword gaps in `explainKoreanService`: its own restaurant chip → GENERIC; "duty free tax back" → GENERIC. [VERIFIED]**
- Path: `reservation` and `taxRefund` matchers · Repro: `{service:"How do I book a popular restaurant as a tourist?"}` (the tool's own `CHOICES[1]`); `{service:"duty free tax back"}`.
- Observed: both fall through to the GENERIC guide. The reservation matcher's `book a (table|restaurant)` requires "table/restaurant" *immediately* after "book a", so "book a **popular** restaurant" misses. The taxRefund matcher has `tax.?free` but not `duty.?free`/`tax back`. So **tapping the tool's own chip** delivers generic guidance instead of the 🍽️ CatchTable‑Global/walk‑in answer its description promises.
- Fix: broaden the reservation regex (`book.*\b(restaurant|table)\b|popular restaurant|reservation`) and add `duty.?free|tax back` to the taxRefund matcher. (Fix in the same pass as N1 — all three are keyword‑coverage gaps.)

**N6 — `translateMenuContext` veg/vegan flag misses beef & chicken dishes. [VERIFIED + corroborated]**
- Path: `ANIMAL`/`renderDish` in `translateMenuContext.ts` (~L75–87) · Repro: `{menuText:"불고기", allergyConcerns:["vegetarian"]}`; `{menuText:"삼계탕", allergyConcerns:["vegetarian"]}`.
- Observed: **Bulgogi** ("Sweet‑savory marinated grilled **beef**") shows no per‑dish "⚠️ not vegetarian/vegan" flag; **samgyetang** ("Whole young **chicken**…") even prints "**No common allergens**" to a vegetarian. The per‑dish flag fires only for `pork/fish/shellfish` (which happen to be allergen tokens); beef/chicken/duck dishes get nothing but the general 🌱 note. A vegan reading the card could reasonably conclude bulgogi is fine.
- Fix: derive an animal‑protein flag from the dish (scan `desc` for `beef|chicken|duck|meat|intestine|trotter|ox-bone|blood sausage|monkfish` / Korean `소고기|한우|닭|오리`), or add an explicit `protein` field to `Dish`; flag for `veg` regardless of allergen tokens. The pork/halal path already does this correctly — extend it to all meats.

**N7 — `translateMenuContext` is missing 빈대떡 (bindaetteok), which `getNowInfo` itself names. [VERIFIED]**
- Path: `DISHES` dictionary · Repro: `{menuText:"빈대떡 순대 떡볶이"}` → "❓ Couldn't identify **빈대떡**", while `getNowInfo{Gwangjang Market}`'s blurb names "bindaetteok" as the market's signature dish. Self‑inconsistent across tools; bindaetteok is *the* Gwangjang/market street‑food a foodie persona hits immediately.
- Fix: add 빈대떡/bindaetteok (mung‑bean pancake; allergens: gluten/egg) to `DISHES`. Cheap, high‑visibility.

**N8 — `getNowInfo` curated‑landmark path omits the live weather/air line that its spec promises. [VERIFIED]**
- Path: curated‑landmark render (`getNowInfo.ts` resolveLandmark branch) · Repro: `getNowInfo{Gyeongbokgung}` / any of the ~27 curated landmarks.
- Observed: the curated path returns verdict + hours + closed‑days + 📝 note **but no `🌤️ Now in <city>` line**, whereas the VisitSeoul (tier‑②) and TourAPI (tier‑③) paths *do* append it (museum result showed "🌤️ Now in Seoul: 22°C · Clear…"). docs/03 §8 explicitly says "셋 다 실시간 날씨·미세먼지 1줄 통합" (all three integrate live weather). The curated path makes **zero API calls for p99 protection** — a deliberate trade‑off that drops the promised weather line for the *most common* getNowInfo hits (palaces, tower, Han River, markets — exactly the outdoor spots where weather is decision‑relevant).
- Fix: append a **best‑effort** weather line to the curated path (single AirKorea/KMA call with a tight timeout, rendered only if it returns within budget), **or** correct docs/03 to state the curated path is weather‑free by design (R‑DOC consistency). Recommend the former.

**N9 — `searchPlaceForeigner` returns off‑intent filler for non‑dining vague/specific queries (R3/Y3 residual). [VERIFIED]**
- Path: `inferCategory`/`inferSeoulCategory` + low‑confidence fallback · Repro: `{beaches, Gangneung}`, `{art galleries, Samcheong}`, `{good museums, Seoul}`, `{K-pop spots, Seoul}`, `{観光スポット, Seoul, ja}`, `{景点, Seoul, zh}`, `{가볼 만한 곳, 서울, ko}`.
- Observed: **`{beaches, Gangneung}` is the worst** — returns *ABC‑Mart, Adidas, Aritaum, BEANPOLE* (A–Z retail), **zero beaches** in Korea's most famous beach town. `{art galleries}`→Aesop/Dr.Martens; `{good museums}`/`{K‑pop}`/generic sightseeing → the same generic VisitSeoul exhibition/concert list regardless of the niche query. (Contrast: concrete intent like `{kid-friendly}`/`{korean bbq}` returns excellent, on‑target results — the dish/dining routing v1 fixed works.)
- **Why it matters:** this is the flagship discovery tool, and "good museums"/"things to see"/"beaches" are obvious judge queries that currently return confidently‑irrelevant filler.
- Fix: (a) score TourAPI/VisitSeoul candidates against the query category; below a relevance threshold return an honest "no strong match for **X** in **Y** — here are general highlights" header instead of silent A–Z filler; (b) add `beach|해변|things to see|볼거리|観光|景点|가볼` → attraction routing and a small curated grounding seed (or hand off to getAreaGuide) for place‑types TourAPI has no category for; (c) never A–Z‑dump retail for a non‑shopping intent.

**N10 — `findForeignerFriendlyStore{need:"emergency"}` shows tone‑deaf store chips.**
- Path: shared `CHOICES` in `findForeignerFriendlyStore.ts` · Repro: `{area:"Myeongdong", need:"emergency"}`.
- Observed: the body is excellent (119/112/1339/1330/ER) but the footer is the generic store trio: "How do I pay here as a foreigner?" / "How do I get there?" / "What other essentials are nearby?" — wrong register for a medical emergency (there is no place to pay at / route to).
- Fix: branch the chips for `need:"emergency"` → "Find a 24h pharmacy nearby" (`need:"pharmacy"`), "Call 1330 — what do I say?", "Route to the nearest ER."

**N11 — Image‑markdown noise + run‑together romanization persist (Y4/Y5).**
- Path: search list render (`visitseoul.ts` / TourAPI list parse) + romanizer · Repro: `{tteokbokki, Myeongdong}`, `{things to see, Insadong}`, `{korean bbq, Gangnam}`.
- Observed: raw `![photo](https://api.visitseoul.net/…)` / `![photo](http://tong.visitkorea.or.kr/…)` image markdown (~80‑char URLs, render as broken/empty in the text‑only PlayMCP chat); romanized addresses run together — "Gangnamgu Nonhyeonro 95‑gil", "Seochogu Seochodaero", "GyeongbokgungYeokExit 3" — the exact string a foreigner pastes into Naver Map.
- Fix: strip `![photo](…)` from list bodies (landmark/BBQ lists are already clean — make it consistent); insert separators at gu/ro/gil boundaries in the romanizer ("Gangnam‑gu Nonhyeon‑ro 95‑gil").

**N12 — Impossible/unknown place reported as a transient outage, not "not found."**
- Path: `getNowInfo` empty‑vs‑error handling · Repro: `getNowInfo{place:"Hogwarts Castle"}`.
- Observed: "🔌 live data temporarily unavailable … try again" → a user retries forever for a place that doesn't exist. (Tested at cold‑cache; the deployed warm path may differ — worth confirming.) Same conflation can mask a genuine "not found, did you mean…".
- Fix: distinguish an **empty result** (→ "couldn't find that place, did you mean…?" + alternative chip) from a **fetch failure** (→ "temporarily unavailable, try again").

### 🟢 POLISH
- **G1** — `getNowInfo` 🟠 daylight verdict copy ("open‑air/residential spot with little to see after dark") is wrong for **Hallasan** (a mountain). Branch the template by place type. (S1)
- **G2** — `getAreaGuide{Jamsil, "theme park"}` appends "Jamsil isn't especially known for theme park" though **Lotte World** is its anchor — suppress the "not known for X" disclaimer when X ∈ the hood's own tags. (S2)
- **G3** — `explainPayment{Klook}` / `{buying a SIM}` fall to GENERIC where a tailored branch would help. (S2)
- **G4** — `explainKoreanService` header double‑emoji (`🧭` prefix + service emoji, e.g. "🧭 **🚕 Taxi…**"); **ja/zh phrasing** (タクシー/外卖) → GENERIC (no ja/zh keywords — degrades safely but misses the target markets); curated bodies stay English under `language:ja/zh/ko` (acceptable by design — chips are English). (me, multi‑agent)
- **G5** — Junk/PII‑shaped strings echoed verbatim into headings ("ATM in my passport is 123", "Seoul ideas for asdfghjkl") — cosmetic only, **no PII stored**; length/shape‑guard echoed `area`/`query`. (S2)
- **G6** — Intercity flight‑only (Jeju) / no‑train (Sokcho) results still list generic KTX/SRT/bus booking links — headline correct, boilerplate slightly contradictory. (S1)
- **G7** — `getJejuInfo{attraction}` skews to niche operators (dive shops, footbath, brewery) over marquee sights (Seongsan/Hallasan/Manjanggul) — seed/sort from curated Jeju landmarks. (J8, carries v1 Y19)
- **G8** — `trackBusArrival` TAGO cold‑start ~4.6–5.0s exceeds the 3s p99 budget at cold cache — verify under warm load / tighten timeout. (S1)
- **NON‑ISSUE (investigated):** weather temp/sky looked identical for Busan & Jeju, but a 6‑city probe confirmed forecasts **are** per‑city (Seoul 22°/Clear, Gangneung 18°/Clear, Gwangju 21°/Clear) — Busan==Jeju is genuine south‑coast parity at 01:00, not a Seoul default. Air quality is per‑city. (Daegu forecast was momentarily unavailable while its air data returned — benign allSettled partial.)

---

## 6. What's working well (protect & showcase)

1. **`explainKoreanService` is a genuinely strong, accurate, PII‑safe addition** — every service gives a real "blocker → workaround → twin app → fallback → 1330" answer, the curated 2026 facts are correct, and the entryDocs year‑guard means it can't silently go stale. The *content* is contest‑grade; only routing/chips need a touch‑up.
2. **The expanded `explainPayment` matrix is excellent** — T‑money (tap‑out, 30‑min transfer, Climate Card/K‑Pass, refund rules), ATM (Global ATM, DCC decline, 4‑digit PIN, lock warning), VAT, KTX/SRT, online checkout all route correctly with sharp foreigner‑specific caveats.
3. **v1's whole fix set holds** — R1/R2/R4/R5/R6/R8/Y8/Y9/Y10/Y15 all confirmed; the two "partials" (R3 dish vs vague, R7 interest vs language) are the only carry‑overs.
4. **The chip‑journey vision still lands on the happy paths** — discover → "is it open now?" (verdict + weather) → "how do I get there?" (Naver tip + transfer‑track chip) → essentials, with zero re‑typing; halal/vegan allergen honesty fires; kid‑friendly/bbq search is on‑target.
5. **Off‑hours graceful degradation is exemplary** — subway "no live trains, runs 05:30–01:00 + plan‑route chip", late‑night getNowInfo notes, weather allSettled with a live "High seas advisory" all read as polished, not broken.
6. **Safety posture is clean** — prompt injection ignored (menu/service/SQL), **PII never stored, echoed‑as‑data, or solicited** (literal card+passport inputs ignored), coupon/ad bait refused; no "kakao" in any tool name; all responses ≤24k (max ~5.1k) with 2–4 valid chips.

---

## 7. Contest‑readiness verdict & top‑5 fixes

**Verdict: Stronger than v1, very close to submission‑ready — one focused fix pass closes it.** The 12th tool delivers, the payment expansion is excellent, the diet flags and emergency need add real value, and every v1 must‑fix holds. The gap is a small, well‑understood cluster of new defects, two of which a judge could hit in the first few taps (the KakaoTalk→taxi mis‑route on the schema's own example; the room‑salon in the ATM list) and one of which breaks the Markdown contract on a realistic input (raw ‑32602 on `language:"english"`). None are architectural; all are localized and cheap.

### Top 5 fixes before submission (priority order)
1. **N1 — `explainKoreanService` "KakaoTalk sign‑up" → Taxi mis‑route.** Highest demo risk: it's the literal example in the tool's own schema and the most natural phrasing; returns confidently‑wrong taxi content. *(explainKoreanService.ts — `kakao ?t\b` boundary or reorder matchers)*
2. **N2 — Room‑salon in ATM results.** Reputation‑serious, deterministic, on a KakaoTalk‑facing surface. *(findForeignerFriendlyStore.ts `renderNearby` — 유흥/room‑salon blocklist)*
3. **N3 — Raw ‑32602 on `language:"english"/"chinese"/"japanese"` (+ missing `query`).** The only contract‑breaking responses; completes v1's R7. *(getNowInfo.ts + searchPlaceForeigner.ts — `language` → z.string()+normalize; query guard)*
4. **N4 + N5 — `explainKoreanService` chips/routing.** Make chips service‑aware + bridging (the thing that would turn every "stuck→unstuck" journey from "works with external glue" to chip‑driven end‑to‑end), and close the reservation/duty‑free keyword gaps. *(explainKoreanService.ts CHOICES + matchers)*
5. **N6 + N7 — menu diet completeness.** Flag beef/chicken for vegetarians (not just pork/fish), and add 빈대떡. Closes the clearest safety‑adjacent gap a vegan hits first. *(translateMenuContext.ts ANIMAL/DISHES)*

**Runner‑up (do if time):** N9 (search off‑intent filler for "good museums"/"beaches" — the flagship discovery tool's first impression) and N8 (weather line on curated getNowInfo landmarks).

---

## 8. Appendix — scenario inventory

**Single‑turn (~180):**
- *explainKoreanService (~30):* all 10 services (taxiApp, foodDelivery, reservation, onlineShopping, kakaoNaverSignup, simEsim, taxRefund, entryDocs, emergencyMedical, kiosk) · GENERIC (laundry, blank, gibberish) · detail‑routing (Kakao T card error, K‑ETA US, ambulance) · adversarial (ja タクシー, zh 外卖, injection, PII bait) · self‑chip texts (taxi/restaurant/kiosk) · "can't pay Coupang", "Naver maps sign‑in", "is my SIM enough for KakaoT", "duty free tax back", "visa or K‑ETA", "book a hair appointment".
- *explainPayment (~20):* KTX, SRT, VAT, ATM, online, T‑money, Apple Pay, Samsung Pay, tipping, split, market, convenience, hotel, admission, restaurant, train, generic (hanbok), Klook, SIM, refund t‑money, Amex.
- *translateMenuContext (~12):* 불고기/vegetarian · 삼계탕/vegetarian · 제육볶음/halal · 삼겹살+비빔밥/vegetarian · 김치찌개+떡볶이+비빔밥/vegan · 순두부/dairy · 빈대떡+순대+떡볶이 · 회 물회 산낙지 · 300‑char multi‑dish · injection · empty.
- *findForeignerFriendlyStore (~10):* overview (Itaewon) · emergency (Myeongdong) · atm (Gangnam ×3, Itaewon, Hongdae, Myeongdong) · pharmacy · currencyExchange · convenience · unknown‑need (drinks) · PII‑shaped area.
- *getNowInfo (~20):* curated landmarks Gyeongbokgung, N Seoul Tower, Lotte World, Bukchon, Changdeokgung, COEX Aquarium, Han River Park, DDP, Gwangjang Market, War Memorial, Haeundae, Hallasan · museums (Seoul Museum of History, National Museum) · area names (Hongdae, 홍대, Seongsu) · CJK (景福宮/zh, 南山タワー/ja) · ambiguous (Lotte) · specific business (Bongchu Jjimdak) · impossible (Hogwarts) · bad language enums (english, chinese, klingon).
- *getTransitRoute (~12):* from‑only · same‑origin · Hongdae→Gangnam · Incheon Airport→Myeongdong · Seoul Station→Gyeongbokgung · Itaewon→Gangnam · Hongdae→N Seoul Tower · Seoul→Busan · Seoul→Jeju · Seoul→Sokcho · journey follow‑ups.
- *getAreaGuide (~16):* Myeongdong, Hongdae/nightlife, Gangnam/shopping, Insadong, Itaewon, Bukchon, Seongsu, Yeouido, Jamsil/theme‑park, Ikseondong, Euljiro/drinks, Garosu‑gil, Haeundae, Seogwipo, Pangyo(unlisted), SQL‑inject.
- *searchPlaceForeigner (~16):* korean bbq/Gangnam · tteokbokki/Myeongdong · good museums · historic palaces · kid‑friendly · art galleries/Samcheong · vegan ramen · temple stay · attractions/Busan · things to do/Jeonju · beaches/Gangneung · K‑pop spots · 観光スポット/ja · 景点/zh · 가볼 만한 곳/ko · wrong‑arg‑key · gibberish · conflicting · coupon bait.
- *getWeatherAndAir (~8):* Seoul, Busan, Jeju, Daegu, Gwangju, Gangneung, Wakanda(unknown).
- *trackBusArrival (~4):* 1003/Haeundae/Busan · 100/동대구역/Daegu · 143/Myeongdong/Seoul · 272/Gwanghwamun/Seoul. *trackSubwayArrival (~4):* Gangnam · Hongik Univ→Gangnam(journey) · off‑hours probes. *getJejuInfo (~4):* attraction · spaceship(bad enum) · highlights.

**Multi‑turn journeys (~22 / ~95 turns):**
- *New‑tool "stuck → unstuck" (J1 ×8):* arrival‑night (entryDocs→eSIM→taxi→route), card‑declined‑online, can't‑book‑restaurant, sick‑at‑night, korean‑kiosk, KakaoTalk‑signup, tax‑refund, SIM+delivery.
- *Classic personas (J2 ×8):* US first‑timer/Insadong, foodie/Gangnam, shopaholic/Myeongdong, Muslim‑halal, vegan, business/COEX, Japanese(ja), Jeju trip.
- *Extra personas (J3 ×6):* budget backpacker, late‑night street‑food, transit‑anxious, Korean speaker(ko), family w/ kids, Chinese tourist(zh) — plus a 10‑row regression spot‑check (R1/R2/R5/R6/R7/R8).

**Lead‑verified first‑hand (4):** N1 (KakaoTalk→taxi), N2 (room‑salon in ATM ×3 + 3 control areas), N3 (language enums english/chinese/japanese + wrong‑arg‑key), N9 (beaches/Gangneung retail dump) — all confirmed on the deployed endpoint. Weather city‑specificity probed (6 cities) and cleared.

---
*Report generated by the lead tester + 5 parallel sub‑agents against the live deployed endpoint (and byte‑identical local handlers) at ~01:45–02:05 KST 2026‑06‑27. No server source/tests were modified; all throwaway runner scripts were deleted; `.env` and keys were never committed or exposed.*
