# 15. Handoff — Landmark hours overlay + Area-guide expansion (D-014)

> Session: 2026-06-26 (sub-agent). Two curated-data improvements that need **no API key** and **no new keys/secrets**. **⏳ A KC redeploy is required to make this live** (code is in the repo/branch; the running container still serves the old build).

---

## What was built

### Task 1 — Curated landmark opening-hours overlay for `getNowInfo`
- **New file**: [`src/lib/landmarks.ts`](../src/lib/landmarks.ts) — **27 curated landmarks** foreign visitors ask about most, each with: canonical name, EN+KO aliases, machine-readable hours, human `hoursLabel`, `closedDays`/`closedLabel`, a one-line note, optional lat/lng, and `city` (for the weather line).
  - Coverage: Seoul palaces & heritage (Gyeongbokgung, Changdeokgung, Deoksugung, Changgyeonggung, Jongmyo), towers/observatories (N Seoul Tower, Lotte World Tower–Seoul Sky), Lotte World Adventure, COEX Aquarium, open-air (Han River parks 24h, Bukchon, Seoul Forest, DDP, Cheonggyecheon), markets/streets (Gwangjang, Namdaemun, Myeongdong, Insadong), museums (War Memorial, Leeum), **Busan** (Haeundae, Gwangalli, Gamcheon, Jagalchi), **Jeju** (Seongsan Ilchulbong, Manjanggul, Hallasan).
  - Four hour types: explicit `Interval[]`, `"24h"`, `"daylight"` (residential/open-air), `"sunrise"`. Seasonal/variable ones flagged `approx` (label carries "~"/nuance).
  - `resolveLandmark(input)` — exact alias index first, then a **confident-only** fuzzy match via `fuzzy.resolveName` (so it never hijacks an ordinary place query). Disambiguates "Lotte World" (→ theme park) from "Lotte World Tower"/"Seoul Sky" (→ observatory).
  - `landmarkVerdict(landmark, dow, minutes)` — pure, time-injected → testable. Returns `🟢 Open now (until 18:00)` / `🔴 Closed now (opens 09:00)` / closed-day / `🟠 best by day` etc.
- **Integration**: [`src/tools/getNowInfo.ts`](../src/tools/getNowInfo.ts) — the overlay runs **before the TourAPI key guard**. A confident landmark match renders a crisp verdict from accurate hours + the existing `koreaNow()` time (extended to return minute + weekday), keeps the live weather line and chips, and returns. **No match → unchanged TourAPI fallthrough.** Needs no `TOUR_API_KEY` (works even when unconfigured).
- **Why**: TourAPI indexes iconic landmarks poorly ("Han River" → a hotel, "Lotte World" → a mall counter) and rarely returns real hours, so `getNowInfo` couldn't deliver its headline open/closed promise (review item C7). Resolved.

### Task 2 — `getAreaGuide` expansion (8 → 21 neighborhoods)
- [`src/tools/getAreaGuide.ts`](../src/tools/getAreaGuide.ts) — **+13 areas** using the exact existing `Area` shape (keys RegExp w/ Korean aliases, name, blurb, spots[], getThere, interests partial-record):
  - **Busan (5)**: Haeundae, Seomyeon, Gwangalli, Nampo-dong/Jagalchi, Gamcheon Culture Village.
  - **Jeju (2)**: Jeju City, Seogwipo.
  - **More Seoul (6)**: Yeouido, Jamsil/Lotte World, Ikseon-dong, Euljiro, Samcheong-dong, Garosu-gil/Sinsa.

---

## Tests
- **Before: 108 passed → After: 117 passed** (+9). `npm run build` (naming lint + tsc) ✅, `npm test` (vitest) ✅.
- Added in [`test/lib.test.ts`](../test/lib.test.ts): landmark resolve (canonical/alias/KO/typo), Lotte World vs Tower disambiguation, long-tail → undefined, and `landmarkVerdict` open/closed/closed-day/24h/daylight/sunrise/late-night logic.
- Added in [`test/tools.test.ts`](../test/tools.test.ts): `getAreaGuide` Busan/Jeju/KO-alias cases, and a `getNowInfo` curated-verdict test that passes **without** a TourAPI key (never degrades to "temporarily unavailable").

## Files changed
- New: `src/lib/landmarks.ts`.
- Modified: `src/tools/getNowInfo.ts`, `src/tools/getAreaGuide.ts`, `test/lib.test.ts`, `test/tools.test.ts`, `docs/03_tool_contracts.md`, `docs/06_decision_log.md`, `docs/07_progress.md`.
- Untouched: `.env`, secrets, all other tools/sources. No API keys re-issued, no deploy performed.

## Caveats
- Hours are accurate well-known values; seasonal/variable ones are `approx` (label says so). Monthly-irregular closures (Jagalchi 1st/3rd Tue, Manjanggul 1st Wed) are described in the note, not encoded in `closedDays`.
- `daylight`/`sunrise` verdicts are advisory windows, not exact gates (no sunrise-time computation).
- Fuzzy match is intentionally confident-only; very loose/ambiguous queries fall through to TourAPI by design.
- **KC redeploy needed to make it live** — rebuild the image (push → GitHub Actions `deploy-image`) and restart/re-register the KC container (see docs/13/14). The endpoint currently serves the pre-D-014 build.
