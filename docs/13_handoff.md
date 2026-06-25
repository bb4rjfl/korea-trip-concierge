# 13. 핸드오프 — 2026-06-25 (배포 진행 중, 새 세션 진입점)

> **새 세션은 이 문서를 먼저 읽고**, 이어서 `CLAUDE.md` → `docs/00_service_overview.md` → `docs/07_progress.md`(SSOT) 순으로 보라.
> 지금 상황은 **KC 배포의 마지막 단계(키 주입)** 중간이다. 아래 §1이 가장 중요.

---

## 0. 한 줄 상태
**Korea Trip Concierge** — 방한 외국인용 **11-tool MCP 서버**(TS+Node, Streamable HTTP, stateless). 카카오 Agentic Player 10 출품작. 코드·테스트 완성(99 tests green), **KC에 배포돼 Active**, 지금은 **배포 이미지에 API 키를 주입하는 마지막 단계** 진행 중.

---

## 1. ⭐⭐ 배포+키주입 완료(B2 DONE) — 다음 = PlayMCP 등록

### ✅ 현재 배포 상태 (2026-06-25 갱신)
- KC에 **컨테이너 이미지(ghcr 비공개)로 재등록·Active**. **ID 638**, namespace `kbm-u-4961514721`.
- Endpoint: `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp`
- **키 주입 성공** → 헬스체크 `/`의 `sources` **전부 true**(tour/bus/transit/subway/jeju/naver/foursquare). 라이브 검증: searchPlaceForeigner(TourAPI 경복궁 실데이터)·getWeatherAndAir(Seoul 21°C/PM10 12 실데이터) ✅.
- B2 경로 완료: GitHub Secrets → `deploy-image.yml` → 비공개 ghcr `ghcr.io/bb4rjfl/korea-trip-concierge:latest` → KC가 PAT(read:packages, `ghp_s0fb…`)로 pull.
- **재배포 방법**: 로컬 수정 → push → Actions `deploy-image` Run → KC 상세 중지→시작(또는 재등록). 운영(KC)/로컬 개발 독립.

### 👉 다음 단계 = PlayMCP 등록 (docs/14 §3)
1. PlayMCP 콘솔(`playmcp.kakao.com`) → 새 MCP 서버 등록 → MCP Endpoint에 위 URL 입력 → **"정보 불러오기"**(성공해야 함).
2. 정보 입력 → **"임시 등록"**(아직 심사요청 X) → **"MCP 상세 미리보기" → "도구함에 추가"**.
3. **AI채팅**(또는 Claude 커넥터)으로 테스트 + 대화예시 3개(docs/09) 확인.
4. 테스트 OK → **"심사 요청"**(≤7/7) → 승인 → **"전체 공개"** → 상세 URL → 비즈폼 응모(≤7/14).

### (완료됨) 이전 키 주입 단계
ghcr Private 확인 ✅ / Run workflow(키 포함 빌드 #2) ✅ / PAT read:packages 발급 ✅ / KC 컨테이너 재등록 ✅ / sources=true·라이브 검증 ✅.
🔴 노출키(NAVER_SECRET·FOURSQUARE·SEOUL계열)+PAT는 전체공개/심사 전 재발급 권장.

### ⚠️ 배포 후 ODsay IP
ODsay(TRANSIT) 키는 등록 IP 제한이 있을 수 있음. 현재 로컬(개발PC IP)에서만 검증됨. KC 배포 후 `getTransitRoute`가 ApiKeyAuthFailed면 **lab.odsay.com → 내 애플리케이션 → 등록 IP를 KC outbound IP로** 갱신.

---

## 2. 키 / 시크릿 (🔴 절대 커밋 금지)
- **값은 `.env`(로컬, gitignore됨 — 같은 PC라 새 세션도 `loadEnv`로 읽음) + GitHub Secrets**에 있음. **이 문서·어떤 커밋에도 값 미포함.**
- 매핑:
  - `BUS_API_KEY` = `TOUR_API_KEY` = **동일 data.go.kr 단일키**(64hex). TAGO버스·TourAPI다국어·기상청·에어코리아 공용.
  - `TRANSIT_API_KEY` = ODsay 경로
  - `SUBWAY_API_KEY` = 서울 지하철 실시간(swopenapi.seoul.go.kr 전용, 30hex)
  - `SEOUL_API_KEY` = 서울 열린데이터광장 **일반** 인증키(openapi.seoul.go.kr, 30hex) — SUBWAY와 별개
  - `JEJU_API_KEY` = VisitJeju
  - `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` = 네이버 지역검색
  - `FOURSQUARE_API_KEY` = Foursquare Places(신형 Service Key)
  - 미발급(빈값): `VISITSEOUL_API_KEY`, `KAKAO_REST_API_KEY`
- 서울 열린데이터광장 키 3개 보유(일반=SEOUL_API_KEY, 지하철=SUBWAY, 지하철서브 별도).
- ⚠️ **채팅에 노출된 키들(네이버 시크릿·Foursquare·서울)은 전체공개/심사 전 재발급** 후 `.env`+GitHub Secrets 갱신.
- 🔴 규칙: 키를 git에 커밋 금지(B1은 안전분류기에 차단됨, 옳음). 오직 **GitHub Secrets→private image(B2)**.

---

## 3. 무엇을 만들었나 (코드 현황)
- **11 tools** (`src/tools/`): searchPlaceForeigner, findForeignerFriendlyStore, getTransitRoute, trackBusArrival, trackSubwayArrival, explainPayment, getAreaGuide, translateMenuContext, getNowInfo, getJejuInfo, getWeatherAndAir. (지식툴 3종=explainPayment/getAreaGuide/translateMenuContext는 키 없이 동작)
- **소스** (`src/lib/sources/`): tourapi(다국어 en/ja/zh/ko+랭킹+반경검색), tago(TAGO 비서울 버스), odsay(경로), jeju(VisitJeju), weatherair(기상청+에어코리아), seoulSubway(지하철 실시간), **poi(네이버+Foursquare, 영문변환)**.
- **공통** (`src/lib/`): loadEnv(.env), env(live getters), naming(kakao 빌드게이트), markdown(24k가드), footer(칩), http(2.5s타임아웃), cache(TTL), responses, **romanize(romanizeHangul 일반 한글→로마자 + 역/노선/POI)**, places(큐레이션 좌표 인덱스).
- **검색 라우팅**: 한글질의→Naver(영문변환), 영어질의→Foursquare(좌표), 명소→TourAPI(랭킹). 식당=POI 우선, 명소=TourAPI.
- 검증: `npm run build`(네이밍 린트+tsc) / `npm test`(**vitest 99**) / `npx tsx`로 라이브 핸들러 호출. `scripts/verify-live.ts`도 있음.
- 배포: 루트 `Dockerfile`(linux/amd64, runtime에 키 ARG→ENV), `.github/workflows/deploy-image.yml`(ghcr 빌드·푸시).

---

## 4. 블로커 / 대기 중
- **🚌 서울 버스 = 전파 대기**: ws.bus.go.kr(TOPIS)이 모든 키에 에러30. 단 동일 BUS_API_KEY가 TAGO(apis.data.go.kr)엔 `NORMAL SERVICE`. → data.go.kr 승인(6/25)→서울TOPIS 키 동기화 대기(1~2일). 별도 등록 불필요. **풀리면 `src/lib/sources/seoul.ts` 즉시 구현**(스펙 확정: `stationinfo/getStationByName`→stId/arsId, `arrive/getLowArrInfoByStId`·`getStationByUid`→arrmsg1 "N분후[M번째 전]" 파싱). trackBusArrival 서울 분기 연결(현재 서울 입력시 경로안내 폴백).
- **🆕 VisitSeoul** 승인 대기 → **다국어 로컬 인덱스(D-010)** 구현 예정(서울 음식6369/관광/쇼핑/숙박, 7개언어). `poi.ts`에 `TODO(visitseoul)` 마킹.
- **🆕 카카오 Local** 승인 3~5일 → POI 레이어에 추가(콘솔 카카오맵 ON 선행). 툴명에 kakao 금지(데이터소스로만 사용).
- 매 세션 **서울 버스 키 재탐침** 권장(전파 확인).

---

## 5. 규칙 (필독 — 이미 docs에 있으나 핵심만)
- **R-DOC**: 코드/스펙/결정 바뀌면 **같은 변경에서** docs 갱신. `docs/06_decision_log`(D-001~D-011)·`docs/07_progress`(SSOT). 문서 갱신 없는 기능변경 금지.
- 서버/툴명 **kakao 금지**(대소문자·위치 불문, 빌드 게이트). 툴 3~20(권장10, 현재 11 유지 결정 D-006).
- 영문 description ≤1024 + 서비스명 "Korea Trip Concierge(코리아 트립 컨시어지)" 포함. annotations 5종. 응답 Markdown ≤24k. 평균100ms/p99 3s. 개인정보 6종 금지. 광고/리워드 금지.
- 데이터 전략(D-005): 실연동 지향. 그라운딩(D-009): **외부 LLM/웹검색 금지**, 큐레이션/참조데이터만. 포괄 POI=네이버/Foursquare/카카오Local.
- 🔴 **키 커밋 금지**. 노출키 재발급.
- git: 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Windows라 `git -c core.autocrlf=false commit`. PowerShell/Bash 둘 다 사용가능(구문 주의). gh CLI 인증=bb4rjfl(단 read:packages 스코프 없음 → 패키지 visibility 조회 불가).
- 결정 이력: D-004 TS런타임, D-005 실연동, D-006 11툴, D-007 TAGO+서울분리, D-008 다국어, D-009 큐레이션그라운딩, D-010 VisitSeoul로컬인덱스, D-011 Foursquare우선·서울관광식당보류.

---

## 6. 일정 (역산)
- 예선 접수 6/15~7/14. **심사요청 ≤7/7**(심사 최대7일). 승인→**전체공개**→상세URL→**비즈폼 응모 ≤7/14**(최대 2개 MCP).
- 오늘 6/25. 배포는 됐고 키 주입+PlayMCP 등록+심사요청이 남음.

---

## 7. 문서 맵
`docs/00`(오버뷰) `01`(카카오규칙·절대) `02`(제품스펙) `03`(툴계약) `04`(UX칩) `05`(작업협약) `06`(결정로그) `07`(진행SSOT) `08`(키발급가이드) `09`(대화예시3) `10`(이전 핸드오프) `11`(배포런북) `12`(로컬API신청가이드) `13`(이 문서) `14`(**PlayMCP 공식 가이드·절차** — KC배포/등록·심사·공개/Claude커넥터). 코드: `src/server.ts`(전송) `src/tools/*` `src/lib/*` `src/lib/sources/*`.

> PlayMCP **등록·심사·공개 절차**(임시등록→도구함→테스트→심사요청→전체공개→비즈폼)는 **docs/14 §3** 가 단일 기준.

---

## 8. 새 대화창 직후 할 일 (요약)
1. 이 문서 + `docs/07_progress.md` 읽기.
2. 사용자에게 **배포 마무리 §1 남은 단계**(ghcr Private 확인 → Run workflow → PAT → KC 컨테이너 등록) 안내·확인.
3. 새 Endpoint URL 받으면 `curl <endpoint>/`로 `sources` true 검증 + 툴 라이브 호출.
4. 서울 버스 키 재탐침(전파 확인).
5. 이후 PlayMCP 등록·심사요청(≤7/7), VisitSeoul/카카오Local 승인 시 연동.
