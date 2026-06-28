# 07. 진행 상황 (Progress) — 단일 진실 소스(SSOT)

> 세션 간 연속성. `/handoff`로 갱신. CLAUDE.md "현재 상태"와 어긋나면 이 파일 기준.
> 최종 갱신: 2026-06-26

## 마일스톤
- [x] 공모전 규칙·심사정책 정독 및 문서화 (docs/01)
- [x] 아이디어 통합 확정 (docs/02, D-001)
- [x] 푸시→조회 결정, 선택지 UX 결정 (D-002, D-003)
- [x] 통합 툴 스펙 8개 정의 (docs/02, 03)
- [x] 언어/런타임 확정 → **프로젝트 초기화 완료** (TS+Node, MCP SDK 1.29, Streamable HTTP, stateless) (D-004)
- [x] 공통 `buildChoiceFooter()` + 24k 가드 + 네이밍 린트 + http(timeout)/cache 레이어
- [x] 8개 툴 **계약 등록 완료** (name/description/inputSchema/annotations 5종). 지식툴 3종(explainPayment/translateMenuContext/getAreaGuide) **실동작 구현**
- [x] 로컬 검증: build·naming lint 통과, vitest **52개 통과**, 서버 기동 후 initialize/tools.list/tools.call end-to-end 확인
- [x] Dockerfile(linux/amd64, 루트) 작성
- [x] **실연동 소스 클라이언트 3종** 구현: `src/lib/sources/tourapi.ts`(searchKeyword2/detailIntro2), `tago.ts`(TAGO 실시간 버스: 정류소검색+도착정보), `odsay.ts`(경로). 모두 파서(단일객체/빈응답 처리)+TTL캐시+timeout, 픽스처/mock 테스트.
- [x] **8개 툴 전부 연동 코드 완성** — 지식툴 3종 실동작 + API툴 5종(searchPlaceForeigner/findForeignerFriendlyStore/getNowInfo→TourAPI, trackBusArrival→TAGO, getTransitRoute→ODsay+TourAPI지오코딩). 모두 키 가드/친화 에러+재시도 칩.
- [x] **대화 예시 3개** 작성 (docs/09)
- [x] **API 키 발급 상세 가이드** 작성 완료 (docs/08, 별도 세션)
- [x] **public GitHub repo 생성+푸시**: https://github.com/bb4rjfl/korea-trip-concierge (main, .gitattributes LF 정규화, 시크릿 미포함)
- [x] **데이터 소스·API 키 발급** (사용자) — BUS/TOUR(동일 data.go.kr 키)/TRANSIT(ODsay) 발급 → `.env` 저장 완료
- [~] 키 발급 후 실응답으로 각 소스 파서 필드 검증(`scripts/verify-live.ts`) — **TourAPI ✅완료**, **TAGO ✅(비서울 전국 실데이터 동작, 도착필드만 낮시간 재확인)**, **ODsay ❌(ApiKeyAuthFailed)**, **서울 버스 ⏳(활용신청 대기)**
- [x] **점검/하드닝**: `.env` 로더 추가(`loadEnv.ts`, server 최초 import) + env를 live getter로 — 키 인식 end-to-end 검증. 잘못된 JSON 에러 핸들러. repo 위생(루트 중복문서 01~07 제거, settings.local.json untrack). 지식툴 데이터 보강(지역+4/메뉴+6/결제+2).
- [x] **카카오 규칙 자가점검(docs/01 §8)** 통과 — 위반 0 (Inspector 정식만 배포 후 대기)
- [ ] MCP Inspector 정식 통과 확인 (로컬 curl은 통과)
- [ ] KC Git 소스 빌드(이 repo, 루트 Dockerfile) → Active → Endpoint URL
- [ ] public Git repo 푸시
- [ ] KC Git 소스 빌드 → Active → Endpoint URL
- [ ] PlayMCP 임시등록 → 도구함 테스트 → 대화예시 3개
- [ ] /check 통과 → 심사요청(≤7/7) → 전체공개 → 비즈폼 응모(≤7/14)

## 🚀 배포 상태 (2026-06-25) — 새 세션은 docs/13_handoff.md 먼저
- ✅✅ **KC Active + 키 주입 완료(B2)** — 컨테이너 이미지 등록(ghcr 비공개), **ID 638**, namespace `kbm-u-4961514721`, Endpoint `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp`.
  - 헬스체크 `/` → **`sources` 전부 true**(tour/bus/transit/subway/jeju/naver/foursquare). 라이브 툴 호출 검증: searchPlaceForeigner(TourAPI 경복궁 실데이터)·getWeatherAndAir(Seoul 21°C/PM10 12 실데이터) ✅.
  - B2 경로: 키 → GitHub Secrets → `.github/workflows/deploy-image.yml` 빌드 → 비공개 ghcr `ghcr.io/bb4rjfl/korea-trip-concierge:latest` → KC가 PAT(read:packages)로 pull해 컨테이너 등록.
  - 재배포: 코드 수정 → push → Actions `deploy-image` Run → KC 상세에서 중지→시작(또는 재등록). 운영(KC)과 로컬 개발 독립.
- 🔴 키 커밋 금지(B1 차단됨). 채팅 노출키(NAVER_SECRET·FOURSQUARE·SEOUL계열) + PAT(`ghp_s0fb…`)는 전체공개/심사 전 재발급 권장.
- **다음**: PlayMCP 등록(Endpoint 입력→정보불러오기→**임시등록**→도구함→AI채팅/Claude커넥터 테스트→대화예시 docs/09)→**심사요청 ≤7/7**→전체공개→비즈폼 ≤7/14. (docs/14 §3)

### 🧪 KC 라이브 전수 점검 (2026-06-25, 키 주입 후) — ✅ 11/11 정상
- ✅ **11툴 전부 실데이터 동작**: searchPlaceForeigner(Naver)·findForeignerFriendlyStore(Foursquare 명동)·getTransitRoute(ODsay 서울역→강남 33min/₩1,650)·trackBusArrival(TAGO 부산 서면 실시간)·trackSubwayArrival(서울 지하철)·explainPayment·getAreaGuide·translateMenuContext·getNowInfo·getJejuInfo(VisitJeju)·getWeatherAndAir. (한글 인자는 UTF-8 파일로 검증 — 셸 직접입력은 mojibake 주의)
- ✅ **getTransitRoute(ODsay) 해결**: KC egress IP가 ingress와 다름(egress=`210.109.82.101`). 임시 `/egress-ip` 진단 엔드포인트로 추출 → lab.odsay.com Server IP에 등록 → 라이브 정상. **`/egress-ip` 진단은 제거 완료**(이번 배포). egress IP 변경 시 다시 심어 재추출→ODsay 갱신.
- ✅ **지하철 위치 추가(D-012)**: trackSubwayArrival에 `line` 모드 통합(realtimePosition OA-12601). line 입력 시 노선 전체 열차 실시간 위치(현재역·종착·상태·급행·막차), station 입력은 기존 도착정보. **툴 11개 유지**. 라이브 검증(2호선 39열차) + 테스트 102 green. ⏳ KC 재배포 필요(아래).
- 🟡 translateMenuContext 사전에 `부대찌개`(army stew) 미등록 = 콘텐츠 보강 후보. (+ 큐레이션 fallback을 "가장 가까운 항목 제안"으로 개선 아이디어)

### 📌 트랜스크립트 마이닝으로 회수한 미기록 항목 (2026-06-25) — 유실 방지
- 🔴 **비즈 정보 심사 반려 건**(별도 세션) — 카카오 비즈니스 정보 심사가 (1)사업자 정보 미확인 (2)서비스 화면 부족으로 반려됨. 해소용 서비스화면 목업 `C:\Users\user\Downloads\kpass-service-screen.png` 제작했으나 **사업자등록번호가 placeholder(000-00-00000)** → 실번호(케이커브 487-01-04137, 대표 강상호; memory `business-info`)로 교체 후 재제출 필요. 비즈폼(≤7/14) 게이트. (memory엔 일부 있으나 docs엔 없었음)
- 🟡 **보너스 미사용 역량(메모만)**: 기상특보(태풍·호우 경보, 외국인 체감↑) / 관광코스별 날씨 / TAGO 고속버스(도시간 이동) / 지하철 realtimePosition(OA-12601) 보강. 저비용·고가치 후보, 어디에도 미기록이라 여기 보존.
- 🟡 **trackBusArrival = 최약체 툴** — 서울 키 막힘 + TAGO 비서울 콜드 ~7.5s(p99 위반) + 빈응답 잦음. **서울 전파 계속 막히면 이 툴 드롭 → 10툴(권장상한)로 정리** 옵션(통폐합 1순위 searchPlace+findStore와 별개 선택지).
- 🟡 **U5 첫사용 발견성 약함** — "11개 기능인데 진입점 불명확". 한 툴이 다른 기능을 칩으로 노출하거나 description 강화 제안(미해결).
- ⬜ **2번째 제출 슬롯**(내국인용 '장보기 가격 디코더' 별도 MCP) — 순수 placeholder, 컨셉/스펙/데이터 미논의. 사용 여부 결정 대기(KC 2서버·최대 2제출).
- ⬜ **MCP Inspector 정식 통과**(배포 URL 대상) — 여전히 미실시(로컬 curl만).
- (보안 결정 기록) 카카오 Admin 키는 계정전체 권한이라 **저장·사용 거부**, REST 키만 사용.

## 🆕 데이터 소스 확장 (사용자 지시 2026-06-26, 첨부 매뉴얼 기반)
- [x] **#3 기상특보 (KMA WthrWrnInfoService/getPwnStatus)** ✅ — 현재 활성 특보(태풍/호우/폭염/강풍/풍랑/대설/한파/황사…) 영문 매핑(고정어휘, 번역 아님)해 getWeatherAndAir에 🚨 배너. BUS_API_KEY. parseAlerts 테스트.
- [x] **#2 TourAPI 국문 커버리지** ✅ — 영문 15,696 vs **국문 50,701**(서울 음식점 71 vs 1,130=16배) 확인. searchPlaceForeigner가 영어 thin 시 좌표기반 KorService2 결과를 **로마자화**해 보강. parsePlaces ko 로마자.
- [x] **#4 지하철 API** ✅ — realtimeStationArrival(도착)+realtimePosition(위치) 이미 사용·검증 중(D-012). 첨부 xls 필드와 파서 일치.
- [x] **#1 VisitSeoul** ✅ (2026-06-26, D-015) — 키 발급 → `src/lib/sources/visitseoul.ts`(공식 영어 큐레이션, 7개언어, 라이브+캐시). **searchPlaceForeigner 서울 메인 소스**(비식음 우선, 식음=POI 유지, 빈 곳 TourAPI 그라운딩) + **getNowInfo 서울 임의장소 영업시간/지하철 폴백**(C7 확장). 라이브 7/7 검증, 129 tests. ⏳ KC 재배포 필요.
- 첨부 문서 추출본: `C:\Users\user\Downloads\_ktc_docs\` (기상특보·관광공사 매뉴얼 국/영·관광코스). 관광코스별 날씨(기상청27)는 COULD 후보.

## 🗺️ 여정 UX 강화 로드맵 (사용자 지시 2026-06-25) — 순서대로
> 목적지 추천 → "어떻게 가?" → **버스+지하철 동시 제시·선택** → 선택 시 어디서 타고·언제 와·지금 어디 → **탔으면 지금 어디·언제 내려**. (stateless = 탭/Refresh 조회 모델, D-002)
- [x] **Phase 1 ✅**: getTransitRoute에 모드 라벨(🚇 Subway/🚌 Bus) + **동적 추적 칩**("Track the subway at {역}"/"Track bus {번호}") → 탭하면 추적 직결. 라이브 검증.
- [x] **Phase 2 ✅**: trackSubwayArrival에 **여정/하차안내 모드**(station+to) — `statnId`가 노선상 순차증가하는 걸 이용해 **정거장 수 = |statnId 차|**(데이터 적재 0!). 서울역→사당 7 stops, 강남→홍대 17 stops 라이브 검증. 다른노선=환승유도. trackBusArrival은 이미 하차 카운트 구현됨. **한계(메모)**: 2호선 순환 방향·여정 방면필터 MVP 미흡, 교대 등 역사전 갭→사전 보강 단계에서.
- [x] **구조·서비스 전체 점검 ✅** (서브에이전트 감사) → findStore 재설계(D-013, 외국인 필수시설 큐레이션) + getAreaGuide enum/막다른칩 수정 + getNowInfo 문서정합 + StopsInfo.forward 정리. 🔴 위반 0 확인.
- [ ] **`/check`** 카카오 규칙 최종 점검
- [x] **콘텐츠 보강 + 로마자 사전 ✅**: 메뉴 +25종(부대찌개·갈비·치킨·감자탕 등), 역사전 +교대(alias)·서울대입구·서초·방배·낙성대·봉천·신림 등 17역, 로마자 지선→Branch. **버그수정**: 여정 모드 운행外 "다른 노선" 오메시지 → "라이브 데이터 없음" 정정.
- [x] **전체 UI/UX 플로우 확인 ✅** (칩-플로우 감사 step 6) → searchPlace 카드칩 재조준
- [x] **시나리오 ~107개 점검 ✅** (5 서브에이전트 병렬, per-scenario 리포트) → 🔴 다수 발견
- [~] **🔧 시나리오 발견 수정** — 대부분 완료:
  - [x] C1 weather allSettled / explainPayment 6가이드(팁·더치·모바일페이·식당·호텔·입장) ✅
  - [x] C4 메뉴 regex 오매칭(닭갈비→치킨 등) / C5 알레르기 거짓안심 제거 / +dish ✅
  - [x] C6 searchPlace inferCategory 음식키워드 확장+concrete 쿼리(vegan ramen→라멘집) ✅
  - [x] C8 getNowInfo ja·zh 0건시 en 폴백 ✅
  - [x] **🆕 퍼지/시맨틱 이름해소 + "이거 맞나요?" 확인절차**(`src/lib/fuzzy.ts`) ✅ — 오타·대소문자·띄어쓰기 흡수(Gangnamm·Itaewan·hongik university), 애매하면 후보칩(Myungdong→[Myeongdong…]). 역·장소 적용. **인천공항 미인식 해소**(Terminal 1/International/ICN). 107 tests.
  - [x] C2 버스 정류장 EN→KO(Haeundae→해운대 등 관광정류장 맵) ✅
  - [x] C9 route 칩 출발지(흔한 출발지 칩 제공) ✅
  - [x] **🆕 도시간 이동 그라운딩**(`src/lib/intercity.ts`) ✅ — 12도시 KTX/SRT·고속버스·항공 + 예매 딥링크(코레일/SRT/코버스). 제주=항공만.
  - [x] findStore Nearby 빈행/노이즈 가드 / Naver 주소 괄호균형 / getAreaGuide interest 인정 ✅
  - [x] **C7 getNowInfo 오매칭 해소 ✅ (D-014)**: 큐레이션 랜드마크 오버레이(`src/lib/landmarks.ts`, ~27 명소)로 TourAPI 검색 전에 신뢰매칭→정확 영업시간+현재 KST로 🟢/🔴 즉시 판정. Han River→호텔, Lotte World→매장 오매칭 제거. **getAreaGuide도 8→21 동네 확장**(부산5·제주2·서울+6). 117 tests green.
  - [ ] **잔여(저severity 후속)**: C10 ODsay 정류장 로마자 무공백(분절 불가, cosmetic) / Naver 영어지역 주소·이름 로마자 일관화 / 지하철 노선제안 강화 / jeju theme 비영어·구festival 필터

## 지금 바로 다음 할 일 (Next)
1. **API 키 발급** (사용자 액션) — docs/08 가이드 따라 data.go.kr(버스 TAGO + TourAPI 영문) + ODsay. `.env`에 보관 후 `npm run dev`로 실응답 확인.
2. 키 확보 후: 각 소스의 `NOTE(verify-live)` 지점을 실응답 필드와 대조해 파서 보정(특히 TAGO nodeid/citycode, TourAPI detailIntro2 hours 필드명).
3. **KC 1차 배포**: PlayMCP in KC → Git 소스 빌드 → repo=`bb4rjfl/korea-trip-concierge`, branch=main, Dockerfile=루트 → Active → Endpoint URL 확보 → PlayMCP 임시등록 → 도구함 테스트(지식툴 3종만으로도 데모 가능).

## 블로커 / 확인 필요
- ~~ODsay 키 인증 실패~~ ✅ **해결**: 키 끝자리 `l`(소문자L)→`I`(대문자i) 오타였음. 정정 후 실호출 25개 경로 정상(지하철+버스+도보, 요금/시간 파싱 일치). getTransitRoute 실동작 확인.
- **스코프 확장 — 신규 소스 추가(사용자 결정: 전부 탑재, 툴 20개 이내)**. 키 보관 위치 .env:
  - ① 서울 버스 4종(data.go.kr, `BUS_API_KEY` 재사용) → trackBusArrival 서울 분기 채우기(seoul.ts) — **활용신청 승인됨 ✅**, 구현 대기(낮 라이브 검증)
  - ② 기상청 날씨 + ③ 에어코리아 대기오염(data.go.kr, `BUS_API_KEY` 동일 키) → **신규 툴 getWeatherAndAir 완성·실데이터 검증 ✅**(KMA 단기예보 nx/ny 격자+도시테이블, 에어코리아 시도별 PM10/PM2.5 평균·등급·마스크 권고)
  - ④ 서울 지하철 실시간(TOPIS swopenAPI, `SUBWAY_API_KEY`) → **신규 툴 trackSubwayArrival 완성 ✅**(realtimeStationArrival, 영문역명 매핑, 키·URL·봉투 라이브 검증 — 운행外 `{code:INFO-200}` 빈목록 처리). 성공 도착필드만 낮 1회 확인. (위치 realtimePosition OA-12601은 옵션)
  - ⑤ VisitJeju 제주관광(`JEJU_API_KEY`) → **신규 툴 getJejuInfo 완성·실데이터 검증 ✅**(HTTPS 필수, locale=en 영어, category c1~c6)
  - ⑥ 카카오 Local 키워드/카테고리 장소검색(`KAKAO_REST_API_KEY`) → **보류**(사용자 결정): API 승인 3~5일 소요, 가능성만 열어둠. 진행 시 이름 kakao 금지(`recommendPlaces` 등) + 콘솔 카카오맵 ON(비즈앱 전환) 선행. 참고 API: search/keyword, search/category.
  - 진행: **11개 툴**(getJejuInfo, getWeatherAndAir, trackSubwayArrival 추가), build/77 tests green.
- **🔴 서울 버스 키 미인증(블로커)**: 4종 활용신청 승인됨. 활용가이드 확인 → 엔드포인트 `http://ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId?serviceKey=&stId=`, 응답 `arrmsg1`("5분57초후[2번째 전]")·`traTime1`(초)·`rtNm`. **그러나 BUS_API_KEY·SUBWAY_API_KEY 둘 다 라이브에서 "SERVICE KEY IS NOT REGISTERED(에러30)"** (raw/encoded/대문자 동일=인코딩 무관). → ws.bus.go.kr(TOPIS)은 **별도 키 요구 또는 6/25 승인분 전파 대기**. 입력값/엔드포인트는 정상. **조치(사용자)**: 하루 후 재시도 / data.go.kr 서울버스 서비스 상세의 키·엔드포인트 안내 재확인. 인증되면 seoul.ts 즉시 구현(포맷 파악 완료). 현재 서울 입력은 경로안내 폴백.
- **TAGO getSttnNoList 지연(주의)**: 정류소명 검색이 라이브 3.8~5.8s(새벽 측정) — 기본 2.5s 초과. 디렉터리성 호출(도시/정류소)만 타임아웃 6s로 상향(캐시 1h/1d라 콜드캐시에서만 느림), 실시간 도착 호출은 2.5s 유지. **낮 시간대 재측정 권장** + p99<3s 충돌 여부 모니터.
- **TAGO 도착필드 미확인**: 새벽 측정이라 도착 0건 → routeno/arrtime/arrprevstationcnt/vehicletp 라이브 확인은 낮 시간대 1회 필요(문서 스펙과는 일치).
- **검증 완료(참고)**: TAGO 엔드포인트 철자 `BusSttnInfoInqireService`/`ArvlInfoInqireService`(Inqire), 정류소검색 `cityCode`+`nodeNm`(응답에 citycode 없음→주입), city명(영/한)→코드 매핑(getCtyCodeList+별칭). TourAPI `listYN` 제거로 정상(필드 전수 일치). 모두 코드 반영 + 테스트 57개 green.
- ~~루트의 `01~07_*.md` 중복~~ ✅ 제거 완료(정본 docs/ 단일화).
- **툴 개수(11) 유지 결정**(사용자) — 권장 10 초과지만 하드 20 이내, 각 툴 구분 뚜렷. 추후 통폐합 시 1순위 후보는 searchPlaceForeigner+findForeignerFriendlyStore.
- **TourAPI 검색 적합성(낮 튜닝)**: searchKeyword2가 TITLE 매칭이라 "Gyeongbokgung"→인근 매장 등 정확도 한계. 카테고리 추론+키워드 폴백+타이틀 정제로 1차 개선(라이브 확인). 더 정밀하려면 areaCode 매핑/areaBasedList 검토.
- **TourAPI 콜드 지연**: 간헐적으로 2.5s 초과(findForeignerFriendlyStore 타임아웃 1회 관측). 재시도 1회 존재하나 p99 영향 낮 시간 모니터.
- 카카오맵 직접연동 가능 여부(선택, 필수 아님)
- 본선 Kakao Tools의 Widget/elicitation/푸시 지원 범위 (본선 단계 확인)

## 프로젝트 구조 (현재)
```
src/server.ts            Streamable HTTP stateless 진입점 (loadEnv 최초 import + 네이밍 린트)
src/lib/                 constants, env, loadEnv(.env), naming, markdown(24k), footer(칩), http(timeout), cache(TTL), responses, romanize(지명 KO→EN)
src/lib/                 constants, env, naming, markdown, footer, http, cache, responses, romanize, fuzzy, places, intercity, **landmarks(getNowInfo 큐레이션 영업시간 오버레이, D-014)**
src/lib/sources/         TourAPI, TAGO(버스), ODsay(경로), VisitJeju, weatherair(기상청+에어코리아), seoulSubway(지하철)
src/tools/               12개 툴 (types, index, *.ts) — 지식툴4 즉시동작 + API툴8 실연동. getNowInfo=랜드마크 오버레이→VisitSeoul→TourAPI 폴백, getAreaGuide=35 동네, landmarks ~55 명소(D-017/018/020/021), explainKoreanService 12서비스, searchPlaceForeigner=다도시 must-see 시딩(D-021)
src/server.ts            +툴별 타이밍 로그(S1), 헬스 키요약(S5)
scripts/lint-naming.ts   빌드 게이트 (kakao 토큰/charset/중복/개수, 3~20)
scripts/verify-live.ts   실 API 호출 점검 (키 필요)
test/                    vitest 222개 (헬퍼 + 로마자 + 퍼지 + 랜드마크 + 다국어 + 폴리시 v4 + 콘텐츠 + 지오코딩 + 다도시 must-see + 완성도 + v5/v6수정 + 전체 툴 계약 + 핸들러 스모크 + 소스 파서)
Dockerfile               linux/amd64, 루트
```

## 세션 로그
- 2026-06-28 (v6 최종게이트 partial 수정, D-023): 사용자 지시로 **최종 제출 전 300시나리오 테스트** 분기 → 에이전트가 프로세스 종료로 중단(partial docs/24). 그 전 실발견 3종 수정: V6-1(냉면 소고기육수→채식플래그, broth→bone 부작용), V6-2(简 济州·繁 觀光·简 观光 CJK 시딩 완성), V6-3(getJejuInfo limit union+클램프, 마지막 -32602 제거). **+3 tests(222 green)**. ⚠️ Agent 분기가 분류기 transient로 한때 막혔다 복구. **고친 빌드 재배포 후 v6 300 재실행 예정.**
- 2026-06-28 (v5 테스트 수정, D-022): v5 분기 에이전트(build 9d35679, ~70콜)="**PASS, ship-ready**"(🔴0/🟡3/🟢4, 회귀0, 안전클린, P-V1 수정확인). 발견 5종 수정: V1(online 매처 자기칩 라우팅), V2(콜드 타임아웃 must-see 시드 유지), V3(CJK/가나 도시 인식·지오코딩), V4(getAreaGuide 도시개요 Busan/Seoul), V5(한글 노선명). docs/23. **+4 tests(219 green)**, tsc·빌드 클린. ⚠️ 도중 안전분류기 일시다운으로 Agent/Bash 한때 막혔다 복구(인프라 transient). 배포·검증 대기.
- 2026-06-27 (콘텐츠 라운드 ②, D-021): 사용자 "한 라운드 더 + 새 시나리오 테스트". **city must-see 시딩 다도시 일반화**(`cityMustSeeLead`: Seoul→Busan/Jeju/Gyeongju, 핸들러에서 Seoul/TourAPI 양쪽 prepend) → 비서울 discovery 품질↑(P-V3 보강). 명소 50→55(불국사·첨성대·수원화성·설악산·송도센트럴파크), 동네 32→35(경주·인천·속초), 메뉴 +3(한정식·백반·수육). **+3 tests(215 green)**, tsc·빌드 클린. 배포 후 새 시나리오 테스트(v5) 예정.
- 2026-06-27 (완성도 라운드, D-020): 사용자 "주어진 시간 완성도 최대화" → **저우선 잔여 마감 + 콘텐츠 추가**. 잔여: P3(temple stay→Seoul VisitSeoul, findPlaceInText 가드)·Jamsil 면책·P4(특정업소 인근거리 해소 시 투명안내). 콘텐츠: explainKoreanService **+은행/송금**(12서비스), explainPayment +찜질방, 메뉴 +6, 명소 43→50, 동네 29→32. 부수: 가입 매처 bare `account` 제거(은행계좌 충돌). **+12 tests(212 green)**, tsc·빌드 클린. 배포·검증 대기.
- 2026-06-27 (콘텐츠 라운드 ①, D-018): D-017 배포·검증(27/0) 후 사용자 지시로 **추가 콘텐츠 라운드 + v4 시나리오 테스트 동시 진행**. ① explainKoreanService **+콘서트/이벤트 티켓팅**(11서비스, Interpark Global·Klook), 메뉴 +6(닭볶음탕·쭈꾸미·양꼬치·골뱅이·김치전·번데기 +MEAT_RE silkworm/whelk), 명소 36→43(반포분수·이화벽화·별마당·서울로7017·올림픽공원·태종대·섭지코지), 동네 26→29(서촌·건대·신촌). **+4 tests(202 green)**. ② v4 테스트=백그라운드 에이전트로 분기(deployed ad37b6b 블랙박스, docs/22 작성+요약회수; send_message는 비대화형 승인불가라 Agent로 대체). v4 결과: **"submission-ready, fix one bug"**(회귀 전부 유지, 안전 클린, D-017 12/13 라이브). **v4 발견 4종 수정(D-019)**: P-V1🔴(콩국수 broth 오플래그→bone), P-V2(이벤트 강등), P-V3(비서울 지명 지오코딩+findPlaceInText), P-V4(필수시설 노이즈필터). **① + v4수정 묶어 1회 커밋·재배포**. 204 tests green.
- 2026-06-27 (v4 폴리시+콘텐츠, D-017): **새 세션 진입**(docs/21 핸드오프 + kpass3 대화 전수). 세션시작 점검: 🚌서울버스 여전히 error30(재탐침 지속), 🟢배포 `build:2429b18` 신선·12툴·8소스 true 라이브 확인. **v3(docs/20) 잔여 폴리시 마감**: P2(explainPayment 상황별 브릿지칩)·Hallasan 산 야간=closed/"residential"제거·P7(메뉴 vegan egg/dairy 플래그+설렁탕 모순)·P5(예약 "book about" 오매칭)·P6(응급칩 kiosk→route)·N12(getNowInfo not-found→검색칩)·N11(raw 이미지 마크다운 제거). **N8=라이브 정상**(Gyeongbokgung/N Tower 날씨 출력 확인)→코드 무변경. **콘텐츠 확대**: 메뉴 +13(부산·제주·명물), 명소 27→36(+CJK), 동네 21→26, 제주 대표명소 시딩(P8). **+14 tests(198 green)**, tsc·빌드 클린. 보류: P3/P4/Jamsil(저가치/회귀위험, 문서노트). 노출키 재발급=사용자 결정으로 스킵. ⏳ 재배포 필요.
- 2026-06-27: **v3 재테스트 → 🔴 배포 STALE 발견 + 배포검증 인프라 + F1/F2**. v3 분기세션(~210 신규 시나리오)이 **배포 엔드포인트가 d7c3343 미반영(구버전 서빙)**임을 3-probe로 입증(N1~N10 라이브 X) — 직접 재확인됨(KakaoTalk→택시, lang=english→-32602, 정적칩). **코드는 정상**(로컬 전부 통과). 원인: KC 중지→시작이 `:latest` 새 이미지를 안 당김(추정). **인프라 수정**: `.github/workflows/deploy-image.yml`에 GIT_SHA build-arg + `:sha-<full>` 불변태그, Dockerfile ARG/ENV GIT_SHA, env.ts GIT_SHA, **`GET /` 헬스에 `build`(짧은 SHA) 노출** → 배포 신선도 검증 가능(tools:12/version은 빌드 구분 X였음). **신규 수정**: F1 explainPayment "hospital admission"→관람료 오라우팅 → 병원/의원/약국 결제분기 추가. F2 getNowInfo{Lotte}→부산 백화점 오선택 → `landmarkSuggestions`(≥0.8 강한 모호매칭 ≥2일 때만) 후보칩. +6 tests(**184 green**). ⏳ **재배포 필수 + /build SHA로 검증.** v3 회귀: N1~N10·v1 must-fix·R8(주간 라이브) 전부 PASS(로컬 기준). 잔여 폴리시: N8(랜드마크 날씨)·explainPayment 정적칩·temple-stay 매칭.
- 2026-06-27: **UI/UX 재테스트 v2 → 신규 N-수정**. 분기세션이 ~180단발+22멀티턴(docs/19) → **v1 수정 전부 회귀유지(0 regress)**, 신툴 정확성·안전 클린. 신규 클러스터 수정: **N1** explainKoreanService "KakaoTalk"→택시 오매칭(`kakao ?t\b` 경계) + **N5** 예약·세금환급 라우팅갭. **N2** findStore ATM 결과 성인업소(룸싸롱) → 블록리스트. **N3** `language` enum "english/chinese"→raw -32602(R7 잔여) → z.string+normalizeLang, query 누락 가드. **N4** explainKoreanService 정적칩→서비스별 브릿지칩. **N6** 채식 플래그가 소/닭(삼계탕·불고기) 놓침 → 이름기반 MEAT_RE. **N7** 빈대떡 추가. **N9** beach/해변 라우팅. **N10** 응급 전용칩. +8 tests(**182 green**), tsc 클린, 라이브 검증. **잔여(저우선)**: N8(랜드마크 날씨—KMA 쿼터 transient), N11(이미지/로마자 노이즈—설계판단 보류), N12(불가장소 루프), 폴리시 G. ⏳ KC 재배포 필요.
- 2026-06-26: **외국인 페인포인트 리서치 → 신툴 + 강화 4종 (D-016)**. 4개 리서치 서브에이전트(Reddit·블로그·포럼·한국시스템장벽)가 독립 수렴 → `docs/18`. (1) **신툴 `explainKoreanService`(12번째)** — 타당성검토 에이전트 GO + 빌드레디 스펙(twin 패턴). 10서비스(택시앱/배달/예약/온라인/카톡가입/SIM/세금환급/입국서류/응급/키오스크) blocker→workaround→twin앱→fallback→1330, entryDocs 연도가드. (2) explainPayment 대확장(택시 안티스캠·T-money 심화·KTX·세금환급·온라인·ATM). (3) getNowInfo **공휴일 인식**(`src/lib/holidays.ts` 설/추석 정확날짜 검증). (4) menu 채식 플래그+한국어 카드 / findStore 응급(119/1339/1330) / transit 네이버팁. **+17 tests(174 green)**, tsc 클린·빌드 12툴 OK, 라이브 검증. docs 03/06/07/18 + CLAUDE.md. ⏳ KC 재배포 필요.
- 2026-06-26: **SHOULD-FIX 일괄 + R8 패스** (docs/17 §4 전체). R8(2호선 순환: stopsBetween 단거리 보정 + renderJourney 정직한 방향안내) + **Y1~Y22 대부분**: Y1 stale 이벤트필터(visitseoul+jeju intro/2025), Y2 식이 qualifier+caveat, Y3 museum/palace 랭킹, Y4 앵글브래킷 정리, **Y5 로마자 주소 띄어쓰기/하이픈**(Wausanro35Gil→Wausanro 35-gil, T2 보존), Y6 오타 동네 퍼지(Seongsoo→Seongsu), Y7 유틸리티 엔트리 제외, Y8 미지도시 명시, Y9 동일출발=도착 가드, Y10 동네가이드 음식칩, Y11 POI 노이즈(파이프스팸·중복·비식음 카페제거), Y12 순대 gluten+halal·pork 하드플래그, Y13 미인식 항목안내, Y15 환승 추적칩, Y17 역도착 방향캡, Y19 제주 아이코닉정렬(부분), Y20 Hallasan 오후컷오프, Y21 야간버스 표시, Y22 휴무 clip. **부수**: fuzzy 1글자 부분일치 가드(R6 가타카나 "n" 오매칭 근본수정). +28 tests(**157 green**), 라이브 검증 양호. **보류**: Y14는 matchAreaName 엄격화로 해소, Y16(부산버스 연속성, 대규모)·Y18(다국어 판정본문, 의도적)·G2~G5(설계상). ⏳ KC 재배포 필요.
- 2026-06-26: **UI/UX 240시나리오 테스트 → 🔴 수정 패스**. 분기 세션이 240개(단발 ~140 + 멀티턴 칩여정 ~100, 페르소나 12~15, 9 병렬 서브에이전트, 7차원 루브릭) 라이브 테스트 → 리포트 `docs/17_uiux_scenario_report.md`. **8개 🔴 중 R1~R7 수정 완료**(라이브 7/7 재검증, +19 tests=**148 green**):
  - **R1** getNowInfo{동네명}→엉뚱한 업소 → `matchAreaName` 동네 리다이렉트 + `pickConfidentMatch` 접두 길이가드.
  - **R2** VisitSeoul 경로 go/no-go 판정 누락 → `seoulHoursVerdict`(자유텍스트 영업시간 파서, 요일범위·시간창·자정넘김·연장영업 🟡 헤지) → renderSeoulNow에 🟢/🔴/🟡.
  - **R3** dish/모호/CJK/kid 질의가 식당으로 오라우팅 → FOOD_TERMS dish 사전 +18, inferCategory/inferSeoulCategory 관광·아이·CJK·오타 인식(+VS_CATEGORY.themepark).
  - **R4** translateMenuContext "주문 문장" 막다른 칩 → 주문표현 본문 인라인 + 칩 교체(결제).
  - **R5** getTransitRoute{from만}→raw -32602 크래시 → `to` optional + "어디로?" 우아한 프롬프트.
  - **R6** CJK 명소명 미인식 → landmarks 16곳에 번체/간체/일본어 별칭(景福宮·南山タワー 등). **부수: fuzzy.ts 1글자 부분일치 가드**(가타카나 별칭이 "n"으로 줄어 오매칭하던 버그 근본수정).
  - **R7** enum 미스(getAreaGuide interest "drinks"/getJejuInfo category) raw -32602 → z.string + 동의어 정규화.
  - **잔여**: R8(2호선 순환 방면 필터 — count는 정확, 방향 라벨링만) + 🟡 클러스터(stale 이벤트·로마자 띄어쓰기·식음 qualifier 등 docs/17 §4). ⏳ KC 재배포 필요.
- 2026-06-26: **VisitSeoul 통합 (D-015)** — 키 발급(`0ad0…526c45`, .env+대장). 라이브 전수 파악(8대분류 61카테고리, 7개언어, contents/list·info POST, 영업시간/지하철/좌표/HTML본문, 레이트리밋). 새 소스 `src/lib/sources/visitseoul.ts`(category 매핑·inferSeoulCategory·isSeoulText 바운딩박스·pickConfidentMatch·clip·stripHtml·TTL캐시). **searchPlaceForeigner**: 서울+비식음 → VisitSeoul 공식 큐레이션 메인, 식음(cat=food)은 좌표 POI 유지, VisitSeoul 빈 곳/서울 외는 TourAPI·POI 그라운딩. **getNowInfo**: 큐레이션 랜드마크 다음 서울 임의장소를 VisitSeoul 상세(영업시간/휴무/영문지하철/주소)로 판정(C7 확장). +12 tests(**129 green**), tsc 클린, **라이브 e2e 7/7**(Insadong 발견·museums·temple stay 그라운딩·vegan ramen→POI·Busan→TourAPI·Seoul City Wall Museum 시간·Gyeongbokgung 큐레이션). docs 03/06/07 + CLAUDE.md 갱신. ⏳ KC 재배포 필요. ❎ 미적용(SHOULD): getAreaGuide VisitSeoul 하이라이트, 식음 VisitSeoul 보강픽.
- 2026-06-26 (서브에이전트): **getNowInfo 랜드마크 오버레이 + getAreaGuide 확장 (D-014)**. `src/lib/landmarks.ts` 신설(~27 외국인 인기명소, 정확 영업시간·closedDays·24h/daylight/sunrise 4유형 + `resolveLandmark` 퍼지 + `landmarkVerdict` 순수함수). getNowInfo 핸들러가 TourAPI 검색 **전에** 신뢰매칭 시 현재 KST로 🟢/🔴 즉시 판정(키 불필요·API콜 0, C7 오매칭 해소). getAreaGuide 동네 8→21(부산5·제주2·서울+6, 기존 `Area` 형태). 테스트 +9(lib 랜드마크 resolve/verdict, tools 동네/getNowInfo 큐레이션) → **build+117 tests green**. docs 03/06/07 갱신. ⏳ **KC 재배포해야 라이브 반영**.
- 2026-06-24 (1): 프로젝트 문서 세트 생성(CLAUDE.md + docs 01~07 + 슬래시 커맨드).
- 2026-06-24 (2): 런타임 TS 확정(D-004), 데이터 전략 실연동 확정(D-005). TS MCP 서버 스캐폴드 전체 구축 — 8툴 계약 등록, 지식툴 3종 실동작, 공통 인프라(24k가드·칩푸터·네이밍린트·timeout/cache), Dockerfile. build/lint/46 tests/서버 end-to-end 검증 완료.
- 2026-06-24 (3): TourAPI(영문) 실연동 클라이언트 구현 + searchPlaceForeigner/findForeignerFriendlyStore 연결(키 가드/에러처리), 픽스처+mock 테스트(52개 통과). 대화예시 3개(docs/09) 작성. API 키 발급 상세 가이드는 별도 세션으로 분기(docs/08 작성 예정).
- 2026-06-25 (4): 남은 API 툴 3종 실연동 선작성 — tago.ts(TAGO 실시간 버스)+odsay.ts(경로) 소스 구현, trackBusArrival/getTransitRoute/getNowInfo 연결. 파서 픽스처/mock 테스트 추가(56개 통과). git 저장소 초기화 + .gitattributes(LF) + 첫 커밋 → public GitHub repo(bb4rjfl/korea-trip-concierge) 생성·푸시. docs/08 키 발급 가이드 완료 확인.
- 2026-06-25 (5): 전반 점검 후 하드닝 — (버그) `.env` 미로딩 발견·수정(loadEnv + live getter, end-to-end 검증), 잘못된 JSON 에러 핸들러. repo 위생(루트 중복문서 제거, 로컬설정 untrack). 지식툴 데이터 보강. 카카오 §8 자가점검 통과. build/56 tests green.
- 2026-06-25 (6): 서비스 오버뷰 문서 작성(`docs/00_service_overview.md`) — 총정리 + MCP 작동원리 심화(전송/생애주기/도구선택/stateless) + 8개 도구 상세 흐름 + 여정 그래프. README 문서맵·CLAUDE.md 필독순서에 00/08/09 반영.
- 2026-06-25 (7): **API 키 3종 발급·저장 + 실연동 검증**. `.env`에 BUS/TOUR(동일 data.go.kr 키)/TRANSIT(ODsay) 저장. `scripts/verify-live.ts`로 실호출 검증 → 발견·수정: (1) TourAPI EngService2 GW가 `listYN` 거부 → 제거(필드 전수 일치, 3개 툴 실동작 확인). (2) TAGO 서비스 철자 오타 `Inqire`(BusSttnInfoInqireService/ArvlInfoInqireService)로 정정. 미해결: TAGO 정류소조회 cityCode 필수+서울 미포함 재설계, ODsay ApiKeyAuthFailed(키 재확인 대기). 테스트 56개 green 유지.
- 2026-06-25 (8, 별도 세션): 스코프 확장 — VisitJeju(getJejuInfo)+기상청·에어코리아(getWeatherAndAir) 신규 툴, ODsay 키 오타 수정, TAGO 전국+서울 분기(city 필수) 재설계. 10툴/70 tests green. (D-006/D-007)
- 2026-06-25 (9, 메인 세션): 핸드오프 수신·동기화(origin 동일, 70 green 확인). **R-DOC 문서 정합화** — 코드(10툴)와 어긋난 문서 일괄 갱신: docs/03(getJejuInfo·getWeatherAndAir 계약 추가 + trackBusArrival city), docs/02(툴표 10·데이터소스 확정), docs/00(8→10 전면), docs/06(D-006/D-007), docs/07 구조 스냅샷, CLAUDE.md 현재상태, README.
- 2026-06-25 (23, 메인 세션): **KC 배포 성공(Active)** — Git소스빌드, 11툴 라이브검증(공개 endpoint). 키 주입 막힘 발견(KC 폼에 env란 없음, Git/이미지 둘 다). B1(키 커밋)은 안전분류기 차단=옳음. **B2 채택**: GitHub Secrets 9개 설정 + `.github/workflows/deploy-image.yml`(ghcr 빌드·푸시) 작성·키없이 빌드성공. Dockerfile에 11키 ARG→ENV. **남은 단계**(사용자): ghcr Private확인→Run workflow(키포함)→PAT→KC 컨테이너 재등록. POI 검색 라우팅(한글→Naver영문변환/영어→Foursquare), romanizeHangul, searchPlaceForeigner POI확장도 이 즈음 완료. **종합 핸드오프 docs/13 작성**. 99 tests green.
- 2026-06-25 (22b, 정정): **서울 버스 = 전파 대기로 확정**. 동일 BUS_API_KEY가 **TAGO(apis.data.go.kr)에선 NORMAL SERVICE**, **서울 ws.bus.go.kr에선 에러30**. 키는 유효 → 서울버스는 서울시 자체서버 호스팅이라 data.go.kr→서울TOPIS **키 동기화(전파)** 필요(6/25 신청, 보통 1~2일). **별도 api.bus.go.kr 등록 불필요**(앞 22 결론 정정). 전파되면 BUS_API_KEY 그대로 동작 → seoul.ts 즉시 구현.
- 2026-06-25 (22, 메인 세션): **버스 API 가이드 9종 정독 + 전 키 테스트(확정)**. TAGO=apis.data.go.kr/1613000+BUS_API_KEY(동작), 서울버스=ws.bus.go.kr(TOPIS, api.bus.go.kr 발급). 정확 Call-Back URL(getLowArrInfoByStId/getStationByUid)로 **4키(data.go.kr·서울일반·지하철·지하철서브) 전부 에러30** → 서울버스는 TOPIS 별도 등록 필요(키선택 무관). 서울키 정리: 일반=SEOUL_API_KEY(openapi 일반), 지하철 2개=swopenapi(SUBWAY로 동작). **조치(사용자): api.bus.go.kr 직접 등록 또는 data.go.kr 승인/전파 확인.** TOPIS 키 확보 시 seoul.ts 즉시 구현(스펙 확정: getStationByName→stId/arsId, getStationByUid→arrmsg).
- 2026-06-25 (21, 메인 세션): **searchPlaceForeigner POI 확장 + 스마트 공급자 라우팅**. searchForeignerPois가 키워드 언어로 공급자 선택(한글→Naver우선, 영어→Foursquare우선·좌표). searchPlaceForeigner 식당류 질의→POI(영문), 명소/쇼핑→TourAPI. 라이브: "cafe Hongdae"→Foursquare 영어카페, "강남 맛집"→Naver(로마자+한글 Western), "Gyeongbokgung"→TourAPI 궁궐. 99 tests. **버스 재탐침: ws.bus.go.kr이 BUS·SUBWAY·SEOUL 키 3종 모두 에러30** → TOPIS 등록문제(키선택 아님), api.bus.go.kr 직접등록/데이터포털 전파 필요(사용자). 열린데이터광장 Admin: 일반인증키 사용 안내(=SEOUL_API_KEY, openapi.seoul.go.kr엔 인증통과 확인).
- 2026-06-25 (20, 메인 세션): **Naver 우선 + 한글→영문 변환**(사용자 요청: 네이버가 풍부). 일반 한글 로마자 변환기 `romanizeHangul`(국어 로마자표기법) 신규 → romanizeText/romanizeStation 최종 폴백으로도 연결(잔존 지하철/버스 한글 제거: 충정로→Chungjeongro). poi.ts: `translateNaverCategory`(육류,고기요리→Korean BBQ 등) + 이름=로마자+한글병기 + 주소 로마자화(층/행정 노이즈 제거). 검색=Naver우선→Foursquare폴백, VisitSeoul 합류는 TODO(D-010). 라이브: 이태원→"Sawachamsuthwaro (사와참숯화로) — Korean BBQ". 99 tests green. (이름은 음역=발음용, 한글 병기로 간판 대조.)
- 2026-06-25 (19, 메인 세션): **POI 키 3종 반영·검증**(핸드오프). 네이버 라이브 동작(이태원 식당, 한국어). **Foursquare 신형(places-api.foursquare.com+Bearer+버전헤더) 수정**→영어 이름·카테고리 라이브검증("Ankara Picnic — Turkish Restaurant"). searchForeignerPois=**Foursquare우선→네이버폴백**(D-011). trackBusArrival 에러UX 개선(①)+bestStop. SEOUL_API_KEY getter 추가하나 관광식당/모범음식점은 구별분산·한국어·저ROI→**보류**(키 보관). 면세=TourAPI 쇼핑 재활용 권장(DUTYFREE 비움). 95 tests green. ⚠️ 노출키(네이버/Foursquare/서울) 공개 전 재발급 필요.
- 2026-06-25 (18, 메인 세션): TAGO 워밍업(①)·needs 정직안내(②) 구현(94 tests). 전반 점검 완료(trackBusArrival이 최약체로 식별 — 서울키 막힘+TAGO 매칭난). **VisitSeoul API 검토**(서울 음식6369/관광/쇼핑/숙박, 7개언어, 4엔드포인트) → 신청 결정(폼: 사이트명 Korea Trip Concierge, URL=GitHub repo; 배포 후 KC도메인 추가). Webhook=콘텐츠변경통지용→**우리 미러링 안 하므로 미사용**. **D-010: VisitSeoul 다국어→로컬 인덱스 하이브리드 확정**(키 승인 후 구현). env에 VISITSEOUL_API_KEY 예약. 버스 키 재탐침=여전히 에러30(유지).
- 2026-06-25 (17, 메인 세션): **의도확인 되묻기 + POI 공급자 레이어**. getNowInfo: 관광지 자동부스트 제거(정확도-우선만) + 타입이 갈리는 모호 질의는 "어느 걸?" 칩으로 되묻기(라이브: "Gyeongbokgung"→되묻기, "Gyeongbokgung Palace"→진행). POI 추상화 `src/lib/sources/poi.ts`(네이버 지역검색+Foursquare, 파서 픽스처테스트, 키없으면 graceful) → findForeignerFriendlyStore가 POI 우선→TourAPI 폴백. env에 NAVER_CLIENT_ID/SECRET·FOURSQUARE_API_KEY 추가, 헬스 반영. **버스 키 재탐침=여전히 에러30**(보류). **조사결과: 서울 관광식당/모범음식점은 깨끗한 서울 영어 API 아님**(구별/LOCALDATA 한국어 행정데이터) → 외국인 타깃엔 네이버/Foursquare(영어·포괄)가 우월. 신청가이드는 별도 세션(docs/12). 94 tests green.
- 2026-06-25 (16, 메인 세션): **검색 적합성/완결성 3종(D-009)** 라이브 구현·검증. (A) `rankPlaces` 정확/관광지 우선 정렬 → getNowInfo("Gyeongbokgung")=궁궐·"N Seoul Tower"=타워(매장/투어상품이던 것 수정). (B) `src/lib/places.ts` 큐레이션 좌표 인덱스(~40 랜드마크·역) → getTransitRoute 지오코딩 **2982ms→456ms**+정확. (C) `searchPlacesNearby`(locationBasedList2 반경검색) → findForeignerFriendlyStore가 좌표 있으면 거리순 검색 → **Itaewon 식당 0건→Kervan 등 반환**. 외부 LLM/웹 그라운딩은 미사용(규칙·성능). 포괄 POI는 카카오 Local 승인 후. 92 tests green.
- 2026-06-25 (15, 메인 세션): **지하철 2호선 확인·개선 + 버스 소스 분석**. 사용자 제공 OA-15799(지하철 실시간 일괄, 2호선 장애 해결) xls 스펙 확인. 라이브 탐침: 현재 per-station `realtimeStationArrival`가 **이미 2호선(1002) 반환**(강남·홍대입구 검증) → 서버측 수정 반영됨, 코드 변경 불필요. 단 홍대입구 ~14건인데 한도 10이라 **잘림 → 0/10→0/20 상향**. formatSubwayDirection이 `(급행)` 접미사로 행/방면 파싱 실패 **버그 수정**. 역명 ~70개로 확대. 89 tests green. **버스 데이터셋 3종(OA-15067 위치/OA-15262 노선/OA-13059 영문명-2015) = 전부 data.seoul.go.kr 참조데이터, 실시간 도착 아님** → 서울 버스 도착은 여전히 ws.bus.go.kr 키(에러30) 블로커. 영문 정류장명은 도착 연동 시 로마자화에 활용 가능. 11툴 실호출: subway 42ms✅·transit(ODsay)✅·jeju·weather·search·findStore·now(+날씨)·지식툴3 모두 동작. 라이브 발견·수정: **U1 로마자화 누락**(ODsay 경로 leg·지하철 종착역 한글) → romanizeText를 경로/지하철에 적용 + 역 ~45개·노선명 패턴(N호선→Line N, 경의중앙선, AREX, 급행/출구/승강장) 추가; transit 헤더는 사용자 입력 지명 사용; translateMenu 빈줄 수정. 88 tests green. 성능: TourAPI류 1.7~2.6s(콜드), **trackBusArrival(TAGO 비서울) 7.5s 콜드=p99 위험**(정류소검색 지연, 캐시 후 빠름). 서울버스 키 미인증 진단(위 블로커).
- 2026-06-25 (13, 메인 세션): `/check` 규칙 준수 점검(FAIL 0; WARN=툴11개·p99콜드, PENDING=Inspector·배포). **배포 실행 런북 작성**(`docs/11_deployment.md`: KC Git빌드+Env키+헬스확인 → ODsay IP갱신 → Inspector → PlayMCP 등록/대화예시/심사요청 ≤7/7 → 전체공개/비즈폼 ≤7/14). 서울 버스 라이브 탐침: `ws.bus.go.kr`가 "SERVICE KEY IS NOT REGISTERED" → 6/25 승인 활성화 전파 대기 또는 별도 등록 필요 → 낮 재확인 후 seoul.ts 구현(블라인드 회피).
- 2026-06-25 (12, 메인 세션): **다국어(U4) 구현**(D-008). 사용자가 TourAPI 영·일·중간·국 4개 서비스 모두 승인 → `tourapi.ts`를 언어 파라미터화(SERVICE 분기 + 외국어/국문 콘텐츠타입 맵 + cleanTitle ko 분기). search/findStore/getNowInfo에 `language`(en/ja/zh/ko) 추가. 라이브 검증: ja "景福宮"→일본어 데이터, zh "景福宫"→중국어, ko "경복궁"→경복궁(palace) 정확 반환. 다국어 선택 테스트 추가 → **87 tests green**. (KO 콜드 1회 타임아웃=기존 TourAPI 지연 이슈, 재시도 정상.)
- 2026-06-25 (11, 메인 세션): **전반 검토 → UI/UX·구조 개선 일괄 반영 + 라이브 검증**. U1 한글지명 로마자화(`romanize.ts`, 지하철 방면/현재위치/종착역 영문화 + 버스 입력명 표시), U2 getNowInfo 실시간 날씨 통합(allSettled 부분성공), U3 경로 출발지 옵션화·정중 폴백, U5 발견성 교차칩(날씨/지하철), U6 칩 일관·과장문구 정정, U8 이미지 첫2개 제한, S1 툴 타이밍 로그, S2 notConnected 운영문구, S3 timeoutFail 헬퍼, S5 헬스 키요약. 라이브 검증 중 추가 발견·수정: TourAPI 타이틀 한글/`[..]`태그 정제(`cleanTitle`), 검색 카테고리 추론+키워드 폴백("cafe Hongdae"→0건 해결). U4(중·일)는 키 미발급으로 보류. **build/83 tests green, 서버 기동·헬스·툴콜·날씨/검색 실데이터 확인**.
- 2026-06-25 (10, 메인 세션): **서울 지하철 실시간 툴 신규** — 사용자가 OA-12764(realtimeStationArrival)/OA-12601(realtimePosition) 지정. `src/lib/sources/seoulSubway.ts`(도착 파서 + 영문역명→한글 매핑 + 노선/상태 디코드) + `trackSubwayArrival` 툴 구현. 라이브 점검: 키·URL·봉투 OK(새벽이라 `{code:INFO-200}` 빈데이터 → 정상 폴백), 성공 도착필드는 낮 확인. 픽스처 테스트 추가 → **11툴 / 77 tests green**. 툴 개수 권장10 초과 인지(통폐합 미결). docs 02/03/00/07·CLAUDE·README 동기화. 카카오 Local은 사용자 결정으로 보류.
