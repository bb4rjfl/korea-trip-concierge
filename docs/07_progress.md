# 07. 진행 상황 (Progress) — 단일 진실 소스(SSOT)

> 세션 간 연속성. `/handoff`로 갱신. CLAUDE.md "현재 상태"와 어긋나면 이 파일 기준.
> 최종 갱신: 2026-06-24

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
src/lib/sources/         TourAPI, TAGO(버스), ODsay(경로), VisitJeju, weatherair(기상청+에어코리아), seoulSubway(지하철)
src/tools/               11개 툴 (types, index, *.ts) — 지식툴3 즉시동작 + API툴8 실연동
src/server.ts            +툴별 타이밍 로그(S1), 헬스 키요약(S5)
scripts/lint-naming.ts   빌드 게이트 (kakao 토큰/charset/중복/개수, 3~20)
scripts/verify-live.ts   실 API 호출 점검 (키 필요)
test/                    vitest 87개 (헬퍼 + 로마자 + 다국어 + 전체 툴 계약 + 핸들러 스모크 + 소스 파서)
Dockerfile               linux/amd64, 루트
```

## 세션 로그
- 2026-06-24 (1): 프로젝트 문서 세트 생성(CLAUDE.md + docs 01~07 + 슬래시 커맨드).
- 2026-06-24 (2): 런타임 TS 확정(D-004), 데이터 전략 실연동 확정(D-005). TS MCP 서버 스캐폴드 전체 구축 — 8툴 계약 등록, 지식툴 3종 실동작, 공통 인프라(24k가드·칩푸터·네이밍린트·timeout/cache), Dockerfile. build/lint/46 tests/서버 end-to-end 검증 완료.
- 2026-06-24 (3): TourAPI(영문) 실연동 클라이언트 구현 + searchPlaceForeigner/findForeignerFriendlyStore 연결(키 가드/에러처리), 픽스처+mock 테스트(52개 통과). 대화예시 3개(docs/09) 작성. API 키 발급 상세 가이드는 별도 세션으로 분기(docs/08 작성 예정).
- 2026-06-25 (4): 남은 API 툴 3종 실연동 선작성 — tago.ts(TAGO 실시간 버스)+odsay.ts(경로) 소스 구현, trackBusArrival/getTransitRoute/getNowInfo 연결. 파서 픽스처/mock 테스트 추가(56개 통과). git 저장소 초기화 + .gitattributes(LF) + 첫 커밋 → public GitHub repo(bb4rjfl/korea-trip-concierge) 생성·푸시. docs/08 키 발급 가이드 완료 확인.
- 2026-06-25 (5): 전반 점검 후 하드닝 — (버그) `.env` 미로딩 발견·수정(loadEnv + live getter, end-to-end 검증), 잘못된 JSON 에러 핸들러. repo 위생(루트 중복문서 제거, 로컬설정 untrack). 지식툴 데이터 보강. 카카오 §8 자가점검 통과. build/56 tests green.
- 2026-06-25 (6): 서비스 오버뷰 문서 작성(`docs/00_service_overview.md`) — 총정리 + MCP 작동원리 심화(전송/생애주기/도구선택/stateless) + 8개 도구 상세 흐름 + 여정 그래프. README 문서맵·CLAUDE.md 필독순서에 00/08/09 반영.
- 2026-06-25 (7): **API 키 3종 발급·저장 + 실연동 검증**. `.env`에 BUS/TOUR(동일 data.go.kr 키)/TRANSIT(ODsay) 저장. `scripts/verify-live.ts`로 실호출 검증 → 발견·수정: (1) TourAPI EngService2 GW가 `listYN` 거부 → 제거(필드 전수 일치, 3개 툴 실동작 확인). (2) TAGO 서비스 철자 오타 `Inqire`(BusSttnInfoInqireService/ArvlInfoInqireService)로 정정. 미해결: TAGO 정류소조회 cityCode 필수+서울 미포함 재설계, ODsay ApiKeyAuthFailed(키 재확인 대기). 테스트 56개 green 유지.
- 2026-06-25 (8, 별도 세션): 스코프 확장 — VisitJeju(getJejuInfo)+기상청·에어코리아(getWeatherAndAir) 신규 툴, ODsay 키 오타 수정, TAGO 전국+서울 분기(city 필수) 재설계. 10툴/70 tests green. (D-006/D-007)
- 2026-06-25 (9, 메인 세션): 핸드오프 수신·동기화(origin 동일, 70 green 확인). **R-DOC 문서 정합화** — 코드(10툴)와 어긋난 문서 일괄 갱신: docs/03(getJejuInfo·getWeatherAndAir 계약 추가 + trackBusArrival city), docs/02(툴표 10·데이터소스 확정), docs/00(8→10 전면), docs/06(D-006/D-007), docs/07 구조 스냅샷, CLAUDE.md 현재상태, README.
- 2026-06-25 (18, 메인 세션): TAGO 워밍업(①)·needs 정직안내(②) 구현(94 tests). 전반 점검 완료(trackBusArrival이 최약체로 식별 — 서울키 막힘+TAGO 매칭난). **VisitSeoul API 검토**(서울 음식6369/관광/쇼핑/숙박, 7개언어, 4엔드포인트) → 신청 결정(폼: 사이트명 Korea Trip Concierge, URL=GitHub repo; 배포 후 KC도메인 추가). Webhook=콘텐츠변경통지용→**우리 미러링 안 하므로 미사용**. **D-010: VisitSeoul 다국어→로컬 인덱스 하이브리드 확정**(키 승인 후 구현). env에 VISITSEOUL_API_KEY 예약. 버스 키 재탐침=여전히 에러30(유지).
- 2026-06-25 (17, 메인 세션): **의도확인 되묻기 + POI 공급자 레이어**. getNowInfo: 관광지 자동부스트 제거(정확도-우선만) + 타입이 갈리는 모호 질의는 "어느 걸?" 칩으로 되묻기(라이브: "Gyeongbokgung"→되묻기, "Gyeongbokgung Palace"→진행). POI 추상화 `src/lib/sources/poi.ts`(네이버 지역검색+Foursquare, 파서 픽스처테스트, 키없으면 graceful) → findForeignerFriendlyStore가 POI 우선→TourAPI 폴백. env에 NAVER_CLIENT_ID/SECRET·FOURSQUARE_API_KEY 추가, 헬스 반영. **버스 키 재탐침=여전히 에러30**(보류). **조사결과: 서울 관광식당/모범음식점은 깨끗한 서울 영어 API 아님**(구별/LOCALDATA 한국어 행정데이터) → 외국인 타깃엔 네이버/Foursquare(영어·포괄)가 우월. 신청가이드는 별도 세션(docs/12). 94 tests green.
- 2026-06-25 (16, 메인 세션): **검색 적합성/완결성 3종(D-009)** 라이브 구현·검증. (A) `rankPlaces` 정확/관광지 우선 정렬 → getNowInfo("Gyeongbokgung")=궁궐·"N Seoul Tower"=타워(매장/투어상품이던 것 수정). (B) `src/lib/places.ts` 큐레이션 좌표 인덱스(~40 랜드마크·역) → getTransitRoute 지오코딩 **2982ms→456ms**+정확. (C) `searchPlacesNearby`(locationBasedList2 반경검색) → findForeignerFriendlyStore가 좌표 있으면 거리순 검색 → **Itaewon 식당 0건→Kervan 등 반환**. 외부 LLM/웹 그라운딩은 미사용(규칙·성능). 포괄 POI는 카카오 Local 승인 후. 92 tests green.
- 2026-06-25 (15, 메인 세션): **지하철 2호선 확인·개선 + 버스 소스 분석**. 사용자 제공 OA-15799(지하철 실시간 일괄, 2호선 장애 해결) xls 스펙 확인. 라이브 탐침: 현재 per-station `realtimeStationArrival`가 **이미 2호선(1002) 반환**(강남·홍대입구 검증) → 서버측 수정 반영됨, 코드 변경 불필요. 단 홍대입구 ~14건인데 한도 10이라 **잘림 → 0/10→0/20 상향**. formatSubwayDirection이 `(급행)` 접미사로 행/방면 파싱 실패 **버그 수정**. 역명 ~70개로 확대. 89 tests green. **버스 데이터셋 3종(OA-15067 위치/OA-15262 노선/OA-13059 영문명-2015) = 전부 data.seoul.go.kr 참조데이터, 실시간 도착 아님** → 서울 버스 도착은 여전히 ws.bus.go.kr 키(에러30) 블로커. 영문 정류장명은 도착 연동 시 로마자화에 활용 가능. 11툴 실호출: subway 42ms✅·transit(ODsay)✅·jeju·weather·search·findStore·now(+날씨)·지식툴3 모두 동작. 라이브 발견·수정: **U1 로마자화 누락**(ODsay 경로 leg·지하철 종착역 한글) → romanizeText를 경로/지하철에 적용 + 역 ~45개·노선명 패턴(N호선→Line N, 경의중앙선, AREX, 급행/출구/승강장) 추가; transit 헤더는 사용자 입력 지명 사용; translateMenu 빈줄 수정. 88 tests green. 성능: TourAPI류 1.7~2.6s(콜드), **trackBusArrival(TAGO 비서울) 7.5s 콜드=p99 위험**(정류소검색 지연, 캐시 후 빠름). 서울버스 키 미인증 진단(위 블로커).
- 2026-06-25 (13, 메인 세션): `/check` 규칙 준수 점검(FAIL 0; WARN=툴11개·p99콜드, PENDING=Inspector·배포). **배포 실행 런북 작성**(`docs/11_deployment.md`: KC Git빌드+Env키+헬스확인 → ODsay IP갱신 → Inspector → PlayMCP 등록/대화예시/심사요청 ≤7/7 → 전체공개/비즈폼 ≤7/14). 서울 버스 라이브 탐침: `ws.bus.go.kr`가 "SERVICE KEY IS NOT REGISTERED" → 6/25 승인 활성화 전파 대기 또는 별도 등록 필요 → 낮 재확인 후 seoul.ts 구현(블라인드 회피).
- 2026-06-25 (12, 메인 세션): **다국어(U4) 구현**(D-008). 사용자가 TourAPI 영·일·중간·국 4개 서비스 모두 승인 → `tourapi.ts`를 언어 파라미터화(SERVICE 분기 + 외국어/국문 콘텐츠타입 맵 + cleanTitle ko 분기). search/findStore/getNowInfo에 `language`(en/ja/zh/ko) 추가. 라이브 검증: ja "景福宮"→일본어 데이터, zh "景福宫"→중국어, ko "경복궁"→경복궁(palace) 정확 반환. 다국어 선택 테스트 추가 → **87 tests green**. (KO 콜드 1회 타임아웃=기존 TourAPI 지연 이슈, 재시도 정상.)
- 2026-06-25 (11, 메인 세션): **전반 검토 → UI/UX·구조 개선 일괄 반영 + 라이브 검증**. U1 한글지명 로마자화(`romanize.ts`, 지하철 방면/현재위치/종착역 영문화 + 버스 입력명 표시), U2 getNowInfo 실시간 날씨 통합(allSettled 부분성공), U3 경로 출발지 옵션화·정중 폴백, U5 발견성 교차칩(날씨/지하철), U6 칩 일관·과장문구 정정, U8 이미지 첫2개 제한, S1 툴 타이밍 로그, S2 notConnected 운영문구, S3 timeoutFail 헬퍼, S5 헬스 키요약. 라이브 검증 중 추가 발견·수정: TourAPI 타이틀 한글/`[..]`태그 정제(`cleanTitle`), 검색 카테고리 추론+키워드 폴백("cafe Hongdae"→0건 해결). U4(중·일)는 키 미발급으로 보류. **build/83 tests green, 서버 기동·헬스·툴콜·날씨/검색 실데이터 확인**.
- 2026-06-25 (10, 메인 세션): **서울 지하철 실시간 툴 신규** — 사용자가 OA-12764(realtimeStationArrival)/OA-12601(realtimePosition) 지정. `src/lib/sources/seoulSubway.ts`(도착 파서 + 영문역명→한글 매핑 + 노선/상태 디코드) + `trackSubwayArrival` 툴 구현. 라이브 점검: 키·URL·봉투 OK(새벽이라 `{code:INFO-200}` 빈데이터 → 정상 폴백), 성공 도착필드는 낮 확인. 픽스처 테스트 추가 → **11툴 / 77 tests green**. 툴 개수 권장10 초과 인지(통폐합 미결). docs 02/03/00/07·CLAUDE·README 동기화. 카카오 Local은 사용자 결정으로 보류.
