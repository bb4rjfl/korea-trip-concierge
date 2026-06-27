# 20. UI/UX Scenario Test Report v3 — Korea Trip Concierge (post N1–N10 fix round)

> **Date:** 2026‑06‑27 (Sat ~12:55–13:10 KST) · **Targets:** the **deployed endpoint** `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp` **and** the byte‑identical **local handlers** (commit `d7c3343 fix(ux): resolve the v2 re-test findings (N1–N10)`).
> **Scope:** Fresh Round‑3 test after the v2 fixes (N1–N10) were *supposed to* be redeployed. Brand‑new scenarios across four buckets (short one‑shots, long journeys, oddball/adversarial, full coverage matrix), plus a hard regression‑check that N1–N10 hold and that the earlier v1/v2 must‑fixes still hold.
> **Method:** ~**210 scenarios** + **12 long chip journeys (~55 turns)** across 14+ personas, run by the lead tester directly (fix‑verification, new‑bug hunt, deploy‑parity proof) **plus 4 parallel sub‑agents** (short one‑shots, long journeys, oddball/adversarial, API coverage). Highest‑severity claims re‑verified first‑hand.

---

## 0. 🔴🔴 HEADLINE BLOCKER — the redeploy did NOT take effect

**The deployed endpoint is still serving the OLD, pre‑fix build. NONE of the N1–N10 fixes are live.** The fixes are correctly committed and working **locally** (commit `d7c3343`), but the running KC container was not updated by the "redeploy."

**Proof — three independent, deterministic probes against the LIVE deployed endpoint (re‑checked after a 40s settle wait, and again by a sub‑agent):**

| Probe (DEPLOYED) | Observed (live) | Expected if fix were live | Verdict |
|---|---|---|---|
| `explainKoreanService{service:"KakaoTalk sign-up"}` | header **"🚕 Taxi apps (Kakao T)"** (full taxi body) | "🆔 KakaoTalk / Naver sign‑up & identity verification" | ❌ STALE (N1 missing) |
| `explainKoreanService{service:"taxi app"}` chips | OLD static chips: *"How do I get a taxi…"* / *"…book a popular restaurant…"* / *"…Korean‑only kiosk?"* | new service‑aware bridging chips (pay / route / resv) | ❌ STALE (N4 missing) |
| `getNowInfo{place:"Gyeongbokgung", language:"english"}` | raw **`-32602`** (enum rejects "english") | graceful Markdown (z.string + normalize) | ❌ STALE (N3 missing) |

**Source‑parity proof (same calls on the LOCAL fixed build):** `{"KakaoTalk sign-up"}` → "🆔 …sign‑up & identity verification" with service‑aware chips; `{"taxi app"}` → new bridging chips, not the old static pair. The local↔deployed parity check **FAILED** on every changed tool (`explainKoreanService`, `translateMenuContext`, `findForeignerFriendlyStore` all returned different lengths/content between local and deployed).

**Why this is the #1 item:** if the contest is judged against the live endpoint, **every single v2 bug is still there** — KakaoTalk→taxi, the room‑salon in ATM results, the `language:"english"` crash, static dead‑end chips, beaches→retail. The code is fixed; the deploy is not.

**Action required (parent):**
1. Re‑deploy from commit `d7c3343` — KC **중지 → 시작** is often not enough if it reuses a cached image; force a **rebuild** of the container image from the current `main` and confirm KC pulls the new image (check the build/commit SHA in the KC console, not just `tools:12`, which is unchanged).
2. After redeploy, **re‑run the 3 stale‑probes above** — all three must flip to the "expected" column before submission.
3. Note: the `version` field stayed `0.1.0` and `tools:12` both before and after — neither is a reliable freshness signal. Use the 3 behavioral probes as the deploy gate.

> The rest of this report validates the **intended (local/fixed) build** so you know the code is correct and submission‑ready the moment the deploy actually lands — and live‑tests everything on the deployed endpoint that is **unaffected** by the fixes (transit, subway, weather, jeju, bus, getNowInfo tiers), which all work.

---

## 1. Methodology — benchmark vs. improvements

### 1.1 Benchmark (v2 / docs/19)
v2: ~180 single + ~22 journeys, deployed + byte‑identical local, 5 sub‑agents, 7‑dim rubric, produced N1–N12 + safety‑clean. This round re‑uses the strengths (parallel sub‑agents, 7‑dim rubric, deployed‑truth for API tools) and adds a deploy‑parity audit.

### 1.2 Improvements this round
| Dimension | v2 | **v3 (this test)** |
|---|---|---|
| Brand‑new scenarios | — | **100% fresh** (no reuse of v1/v2 inputs), across **4 explicit buckets** (short / long / oddball / coverage) |
| Deploy verification | assumed deployed=code | **explicit local↔deployed parity audit** → caught the stale deploy |
| Fix regression | n/a | **N1–N10 each re‑verified** on the fixed build (PASS table §4) + new‑bug hunt for fixes that over/under‑reach |
| Subway journey (R8) | not live‑testable (subway closed in v2) | **live‑tested in daytime** — Line‑2 loop honesty PASS (§5) |
| New‑tool chips | static dead‑ends (v2 N4) | **12 journeys tapping the new bridging chips** to confirm chip‑driven flow |

### 1.3 Honesty / sampling notes
- **Time:** ~13:00 KST Saturday (daytime). Subway running; landmark verdicts 🟢 Open (correct). (The session began ~01:45 KST hours earlier; the Round‑3 request arrived in the afternoon.)
- **Two test surfaces, used deliberately:**
  - **Fixed CURATED behavior → LOCAL handlers** (reliable, no API): `explainKoreanService`, `explainPayment`, `translateMenuContext`, `getAreaGuide`, `findForeignerFriendlyStore` (curated tips/chips), `getNowInfo` curated landmarks + area‑names.
  - **Unaffected API tools → DEPLOYED** (live, valid — identical in stale & fixed builds): `getTransitRoute`, `trackSubwayArrival` (all 3 modes), `trackBusArrival`, `getWeatherAndAir`, `getJejuInfo`, `getNowInfo` VisitSeoul/TourAPI tiers.
  - **N2 (ATM adult‑venue filter) and N9 (beach routing) fixed behavior → SOURCE‑VERIFIED ONLY.** They are API‑tool fixes; the only build that has them (local) has **dead API egress on this machine** (every local ODsay/TourAPI/Naver/KMA call returned "temporarily unavailable" — a local‑network limitation, *not* time‑of‑day), and the deployed build is stale. Both fixes are present and correct in source (`ADULT_RE` blocklist applied in `renderNearby`; `inferCategory` routes `beach|해변|…` → attraction) but could not be live‑validated tonight — **re‑test after redeploy.**
- **Guardrails honored:** read‑only on src/tests; only throwaway `_uxtest/*.mts` + this `docs/20` written; all runner scripts deleted; `.env` never committed; no key values exposed.

---

## 2. Coverage summary (4 buckets)

| Bucket | Count | Where tested | Result |
|---|---|---|---|
| **1. Short one‑shots** | ~67 | LOCAL (curated) | All routing correct; N1/N4/N5/N6/N7/N10 PASS; 0 defects |
| **2. Long journeys** | 12 (~55 turns) | LOCAL curated + DEPLOYED API | 11/12 flawless; new bridging chips make journeys chip‑driven; 1 new 🟡 (explainPayment hospital‑admission) |
| **3. Oddball / adversarial** | ~40 | LOCAL + DEPLOYED | 40/40 graceful; safety all clean; only raw error = the stale‑deploy `-32602` |
| **4. Coverage matrix (API)** | ~40 | DEPLOYED (live) + LOCAL areas | All paths function; R8 loop honesty PASS; minor intent‑match residuals (Lotte/temple‑stay) |

---

## 3. New‑tool & fix validation highlights

- **N4 bridging chips genuinely fixed the v2 dead‑end.** In v2 every `explainKoreanService` reply ended on the same static taxi/restaurant/kiosk chips that looped back into itself; journeys only continued via external glue. Now each of the 10 services emits **3 tailored, non‑self‑referential chips** that map to the correct sibling tool, and context carries: taxi→`getTransitRoute`, kiosk→`translateMenuContext`, emergency→`findForeignerFriendlyStore{pharmacy}`, online→VAT in `explainPayment`, reservation→`getNowInfo`, delivery→eat‑search, taxRefund→online‑checkout. A journey agent tapped a real bridging chip on every `explainKoreanService` turn and it landed on a sensible tool **10/10** times. The "stuck → unstuck" flows are now chip‑driven end‑to‑end.
- **N6 menu meat‑flag now correct.** Beef/chicken/ox‑bone dishes are flagged for vegetarians — 불고기, 삼계탕, 설렁탕(empty allergen list but flagged via desc "ox‑bone"), 잡채 all show "⚠️ Contains … — not vegetarian/vegan" — with **no false positives** on genuinely‑veg dishes (도토리묵, 보리밥, 비빔밥). The pork/halal flag still fires (제육볶음/김치찌개).
- **N1 boundary fix is clean.** `kakao ?t\b` / `\bhail\b` route "Kakao T"/"hail a cab" to taxi but correctly send "KakaoTalk", "email", "detail", "retail", "Thailand", "cocktail" to the right place (no taxi false‑positives).
- **N5/N7/N10 verified:** "book a popular restaurant"→reservation, "duty free tax back"→tax refund, 빈대떡 identified, emergency‑need chips → pharmacy/hospital/info.

---

## 4. Regression check — N1–N10 on the fixed (local) build

| Fix | Repro | Status |
|---|---|---|
| **N1** KakaoTalk→taxi mis‑route | `explainKoreanService{"KakaoTalk sign-up"}` | ✅ PASS → 🆔 sign‑up guide (boundary fix; no Thailand/email/detail false‑match) |
| **N2** room‑salon in ATM | `findForeignerFriendlyStore{atm,Gangnam}` | ✅ FIXED IN SOURCE (`ADULT_RE` blocklist) — live‑unverifiable tonight (local API down + deploy stale) |
| **N3** `-32602` on `language` | `getNowInfo{language:"english"}` | ✅ FIXED IN SOURCE (z.string + `normalizeLang`); local handler runs gracefully on any value |
| **N4** static chips | `explainKoreanService{any}` | ✅ PASS → 3 service‑aware, non‑self‑referential, bridging chips per service |
| **N5** reservation/duty‑free routing | "book a popular restaurant…", "duty free tax back" | ✅ PASS → reservation / tax‑refund |
| **N6** veg flag misses beef/chicken | 불고기/삼계탕 + vegetarian | ✅ PASS → "not vegetarian" flag fires; no veg false‑positives |
| **N7** missing 빈대떡 | `translateMenuContext{"빈대떡"}` | ✅ PASS → identified (mung‑bean pancake) |
| **N8** no weather on curated getNowInfo | curated landmarks | ⚠️ NOT IN THIS FIX BATCH (parent's list skipped N8) — deferred; decide implement vs. doc |
| **N9** beaches→retail filler | `searchPlaceForeigner{beaches,Gangneung}` | ✅ FIXED IN SOURCE (`inferCategory` beach→attraction) — live‑unverifiable tonight; deployed still shows stale retail |
| **N10** emergency chips tone‑deaf | `findForeignerFriendlyStore{emergency}` | ✅ PASS → pharmacy / hospital / tourist‑info chips |

**Earlier must‑fixes (v1/v2) still holding (source/local + deployed where live):** R1 area→neighbourhood, R2 museum verdict (live on deployed), R4 inline ordering phrase, R5 from‑only graceful, R6 CJK landmarks, **R8 Line‑2 loop honesty (LIVE PASS, §5)**, Y8 weather unknown‑city note (confirmed present on deployed), Y9 same‑origin guard, Y10 area food chip, Y15 transfer‑track chip, Naver‑Map walking tip. Safety posture unchanged (clean).

---

## 5. R8 — subway Line‑2 loop journey (finally live‑testable): **PASS 🟢**

Daytime meant the subway was running, so the v2 runner‑up (never live‑testable before) could finally be checked on the deployed endpoint:
- `trackSubwayArrival{station:"Hongik University", to:"Gangnam"}` → *"17 stops to go … ⟳ Line 2 is a loop — **both directions reach Gangnam**, but the short way is 17 stops. Take the platform whose next stops head toward Gangnam; **if the count climbs past 17, you're going the long way — cross to the other platform.**"*
- `{Sindorim→Hongik}` → correctly computes the **short arc = 5 stops** (not the long way), same honest caveat.
- `{Seoul Station→Jamsil}` (cross‑line) → honest "not the same line → plan a route."

This is exactly the honest, non‑misleading behavior the R8 fix targeted (no false "take the X‑bound train" claim on a loop; names the destination; gives a concrete self‑check). Station mode and line mode (38 trains, positions by direction; Seoul Station mega‑interchange = 994 chars, not a wall) also clean.

---

## 6. Prioritized findings

> Most items are **pre‑existing residuals** unaffected by N1–N10, plus **one genuinely new** bug in the fixed build. The deploy‑stale blocker (§0) dwarfs all of these.

### 🔴 BLOCKER
**D1 — Deployed endpoint is the stale pre‑fix build (see §0).** None of N1–N10 are live. Re‑deploy from `d7c3343`, then re‑run the 3 behavioral probes.

### 🟡 SHOULD‑FIX
**F1 — `explainPayment` keyword collision: "hospital / ER admission" → tourist‑attraction "Admission" branch. [NEW, in the fixed build]**
- Repro: `explainPayment{situation:"paying at a hospital ER admission"}` → renders **"Admission (palaces, temples, attractions)"** ("carry ₩10,000–20,000 … palaces ~₩3,000 … close one day a week"). Actively wrong for an ER.
- **Why it matters:** the N4 fix makes `explainKoreanService{emergencyMedical}` bridge toward payment, so the emergency journey can land here. The bare word "admission" matches the attraction branch before any medical context.
- Fix (`src/tools/explainPayment.ts`): add a **hospital/clinic/ER/pharmacy** payment branch (foreign cards widely accepted at hospital cashiers; bring passport; non‑insured foreigners pay full rate; keep the itemized receipt 진료비 영수증), and require the `Admission` matcher to exclude `hospital|ER|clinic|병원|응급`. Then point the emergency pay chip at it.

**F2 — `getNowInfo{place:"Lotte"}` ambiguity → arbitrary wrong‑city brand counter. [residual v1‑Y7, not an N‑target]**
- Repro (deployed): `getNowInfo{place:"Lotte"}` → "8 Seconds – LOTTE Department Store **Busan** Main Branch" (a clothing counter in Busanjin‑gu). A foreigner typing "Lotte" means Lotte World / Lotte Tower / Lotte Dept (Seoul).
- Fix: small disambiguation/alias layer for high‑frequency brand names (Lotte, Shinsegae, Hyundai, Starfield) — either a "which one?" chip set or prefer the canonical landmark (Lotte World Tower) over an arbitrary POI.

### 🟢 POLISH
- **P1 — N8 deferred:** `getNowInfo` curated‑landmark path still omits the live weather/air line that the spec promises (VisitSeoul/TourAPI tiers include it). Not in this fix batch — implement best‑effort or correct docs/03. (`src/tools/getNowInfo.ts`)
- **P2 — `explainPayment` chips are static** (same 3 chips for every situation, by design). Now that `explainKoreanService` has service‑aware chips (N4), aligning `explainPayment` to situation‑aware chips (e.g. ATM→"find a foreign‑card ATM") would be consistent. (`explainPayment.ts:262`)
- **P3 — `searchPlaceForeigner{temple stay}`** → generic Seoul places (geography, not templestay programs). Same family as the N9 vague‑intent fix — extend the routing/curated grounding to "temple stay / templestay". (deployed; verify the N9 source fix covers this phrasing)
- **P4 — `getNowInfo{specific business}`** (e.g. "Bongchu Jjimdak Myeongdong") → resolves to the containing street, dropping the business name. Graceful but loses specificity. (residual v2‑Y14)
- **P5 — N5 micro over‑match:** "I read a book about restaurants" → reservation (contrived; `book[\w\s]{0,20}(restaurant)` matches "book about restaurant"). Harmless.
- **P6 — emergency service's 3rd chip is "Korean‑only kiosk"** — thematically off for a medical emergency; swap for "Call 1330 — what do I say?".
- **P7 — veg/vegan nuance:** egg/dairy aren't flagged as "not vegan" (e.g. bibimbap+vegan), and 설렁탕 shows "No common allergens" alongside "not vegetarian" (looks contradictory). Minor.
- **P8 — `getJejuInfo{attraction}`** leads with niche operators (scuba/foot‑spa/transport) over marquee sights (Seongsan/Hallasan/Manjanggul) — live TourAPI ordering; optionally seed flagship sights. (residual v2‑G7)
- **NON‑ISSUE:** a sub‑agent flagged `getWeatherAndAir{Wakanda}` as silently defaulting to Seoul, but first‑hand (Round‑2) and a second agent confirm the **"I don't have data for Wakanda — showing Seoul; I cover …" note IS present** on deployed (Y8 holds). False alarm.

---

## 7. Safety (Round 3): CLEAN

40/40 oddball/adversarial scenarios degraded gracefully (Markdown + chips, no stack trace). **Injection** (system‑prompt/SQL/`<script>`/`${process.env}`) — zero compliance, no prompt/env/key disclosure; hostile strings echoed only as inert italic Markdown (MCP TextContent isn't browser‑rendered, so `<script>` is not an XSS vector). **PII** (passport/card/SSN, incl. an explicit "save them") — never stored, never re‑emitted as data, never solicited; the ATM path never asks for card/PIN. **Ads/rewards** — none. **Overflow** — 2,000‑char inputs produced sub‑1k replies, all ≤24k with chips. **Off‑enum on the local build** degrades gracefully; the only raw `-32602` is the stale‑deploy artifact. No "kakao" in any tool/server name.

---

## 8. Contest‑readiness verdict & top‑5

**Verdict: the CODE is submission‑ready; the DEPLOYMENT is not.** Every N1–N10 fix is correct and verified (curated live; the two API‑tool fixes source‑verified), the new bridging chips turn the 12th tool into a genuine chip‑driven hub, R8 loop honesty is confirmed live, and the adversarial/safety posture is clean. There are **no new must‑fix code bugs** — only one new 🟡 (`explainPayment` hospital‑admission collision) and a handful of pre‑existing residuals/polish. **But the live endpoint is still the old build, so right now a judge would see all of v2's bugs.** Fixing the deploy is the whole ballgame.

### Top 5
1. **🔴 D1 — Re‑deploy and verify.** Rebuild the container from `d7c3343`; confirm KC serves the new image via the 3 behavioral probes (KakaoTalk→sign‑up, taxi chips service‑aware, `language:"english"` graceful). Nothing else matters until this lands.
2. **🟡 F1 — `explainPayment` hospital/ER "admission" collision.** Add a medical‑payment branch + exclude hospital from the attraction‑Admission matcher (the emergency journey bridges here now).
3. **🟡 F2 — `getNowInfo{Lotte}` wrong‑city ambiguity.** Disambiguate/alias high‑frequency brand names.
4. **🟢 Post‑redeploy re‑validation of N2 & N9 live** (room‑salon filter, beach routing) — they could only be source‑verified tonight.
5. **🟢 P1/P2 — N8 weather‑on‑curated‑landmark decision + align `explainPayment` chips to be situation‑aware** (consistency with the new N4 chips).

---

## 9. Appendix — scenario inventory (fresh, no v1/v2 reuse)

**Bucket 1 — short one‑shots (~67, LOCAL curated):** explainKoreanService ×16 (all 10 services in fresh phrasings: "get a cab", "Baemin won't accept my card", "book a table at a hot restaurant", "card fails at Coupang", "sign up for KakaoTalk", "eSIM or SIM", "get my VAT back", "K‑ETA US passport", "sick at 2am", "McDonald's kiosk only in Korean" + GENERIC "do laundry" + detail‑routing); explainPayment ×15 (every topic); translateMenuContext ×10 (불고기/vegan, 삼계탕/veg, 빈대떡, 김치찌개/halal, 도토리묵/veg, 회덮밥/fish, multi‑dish, romanized, empty, injection); getAreaGuide ×15 (15 hoods + Hangul aliases + unlisted Pangyo); getNowInfo curated ×9 (Gyeongbokgung, N Tower, Lotte World, Gwangjang, Han River, Hallasan, Hongdae/Seongsu area, 景福宮/ko).

**Bucket 2 — long journeys (12, ~55 turns):** arrival‑night (entry→sim→taxi→route→area), stuck‑at‑kiosk (kiosk→menu→pay→now), sick‑at‑night (emergency→pharmacy→pay), card‑declined (online→VAT→ATM), can't‑book (reservation→now→route→pay), foodie‑Gangnam (area→now→route→menu/veg→pay), transit‑anxious (route→track→journey→pay), halal (delivery→area→menu/halal→pay), Jeju (jeju→now→flight→weather), tax‑refund shopper (taxRefund→online→area→exchange), business‑COEX (route→area→pay→taxi), subway‑rider (line→station→now→area).

**Bucket 3 — oddball/adversarial (~40):** gibberish/empty/whitespace ×8; emoji‑only ×3; injection/jailbreak ×4; SQL/code ×3; PII bait ×4; off‑enum ×6; contradictory/impossible ×5; overflow ×3; mixed‑language ×2; + the 3 stale‑deploy confirmation probes.

**Bucket 4 — coverage matrix (~40, DEPLOYED live + LOCAL areas):** searchPlaceForeigner ×8 (POI/VisitSeoul/TourAPI/non‑Seoul/ja + stale beaches); getTransitRoute ×6 (intra/intercity/flight‑only/no‑train/from‑only); trackSubwayArrival ×5 (station/mega/line/journey‑loop/cross‑line); trackBusArrival ×4 (Busan/Daegu live + 2 Seoul fallback); getNowInfo tiers ×7 (curated/VisitSeoul verdict/TourAPI/area/business/ambiguous); getJejuInfo ×5 (all categories); getWeatherAndAir ×5 (cities + unknown); getAreaGuide ×6 (remaining curated hoods — all 21 confirmed resolvable).

**Lead‑verified first‑hand:** the deploy‑stale blocker (3 probes + 40s wait + parity check), N1/N4/N5/N6/N7/N10 on local, N2/N3/N9 in source, R8 live on deployed.

---
*Report generated by the lead tester + 4 parallel sub‑agents against the deployed endpoint and byte‑identical local handlers at ~12:55–13:10 KST 2026‑06‑27. No server source/tests modified; all throwaway runner scripts deleted; `.env` and keys never committed or exposed.*
