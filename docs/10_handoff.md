# 10. 핸드오프 — API 키 발급 이후 진행 전체 정리 (메인 개발 이관용)

> 작성: 2026-06-25 (새벽 세션). 최초 API 키 발급 가이드(docs/08) 작성 → 키 발급 → 실연동 검증/구현까지의 전체 맥락.
> 이 문서 하나로 다른 환경(카카오 MCP 대회용 kpass 채팅방 등)에서 **메인 개발을 이어받을 수 있도록** 자기완결적으로 정리.
> SSOT 진행상황은 `docs/07_progress.md`, 규칙은 `docs/01`, 키 발급법은 `docs/08`.

- **Repo**: https://github.com/bb4rjfl/korea-trip-concierge (public, main, 루트 Dockerfile)
- **스택**: TypeScript + Node 22, MCP SDK 1.29, Streamable HTTP(stateless), express 5, 진입점 `src/server.ts`
- **로컬 검증**: `npm run build` (naming lint + tsc), `npm test` (vitest), `scripts/verify-live.ts` (실 API 호출 점검)
- **현재 상태**: **10개 툴, 70개 테스트 green**. 5개 외부 소스 실데이터 검증 완료.

---

## 1. 데이터 소스 & API 키 전체 (.env)

| .env 변수 | 발급처/포털 | 쓰는 소스코드 | 상태 |
|---|---|---|---|
| `TOUR_API_KEY` | data.go.kr 한국관광공사 영문(EngService2) | `lib/sources/tourapi.ts` | ✅ 검증 |
| `BUS_API_KEY` | data.go.kr (계정 단일 키 — 아래 다수 API 공용) | tago/weatherair | ✅ 검증 |
| `TRANSIT_API_KEY` | ODsay LAB | `lib/sources/odsay.ts` | ✅ 검증 |
| `JEJU_API_KEY` | VisitJeju (api.visitjeju.net) | `lib/sources/jeju.ts` | ✅ 검증 |
| `SUBWAY_API_KEY` | 서울 열린데이터광장(data.seoul.go.kr) | (미구현) | ⏳ 키OK, 새벽 데이터0 |
| `KAKAO_REST_API_KEY` | 카카오 Developers (Local API) | (미구현) | ⏳ 콘솔 카카오맵 ON 필요 |
| `PORT` | 8080 | server | — |

> ⚠️ **`BUS_API_KEY` = `TOUR_API_KEY` 값 동일**(같은 data.go.kr 계정 키). data.go.kr API는 활용신청만 API별로 따로 하면 한 키로 호출됨. 이 키로 활용신청 완료된 API: TourAPI 영문 / TAGO 버스(도착·정류소·노선·위치·고속) / 서울 버스(정류소·도착·위치·노선) / 기상청 날씨(단기·중기·기상특보·관광지날씨) / 에어코리아 대기오염.
> ⚠️ 카카오는 **REST API 키만** 사용. Admin/Native/JS 키는 보안상 미저장.
> ⚠️ `.env`는 `.gitignore` 포함 — 커밋 금지. 키는 KC 배포 시 환경변수로 주입.

---

## 2. 등록된 툴 10개 (이름에 `kakao` 금지 규칙 준수)

**지식형(키 불필요, 즉시 동작)**
1. `explainPayment` — 한국 결제(T머니/해외카드 등) 영어 설명
2. `getAreaGuide` — 지역 가이드(명동/성수 등)
3. `translateMenuContext` — 메뉴 번역 + 알레르기 플래그

**API 연동형(실데이터 검증 완료)**
4. `searchPlaceForeigner` — TourAPI 영문 키워드 장소검색
5. `findForeignerFriendlyStore` — TourAPI 기반 외국인 친화 매장
6. `getNowInfo` — TourAPI 운영시간 + 한국시각 go/no-go
7. `getTransitRoute` — ODsay 대중교통 경로(지하철+버스+도보, 요금/시간)
8. `trackBusArrival` — TAGO 전국 실시간 버스(서울 제외, `city` 입력 필요)
9. `getJejuInfo` — VisitJeju 제주 관광(영어, category 관광지/맛집/축제/쇼핑/숙박/테마)
10. `getWeatherAndAir` — 기상청 단기예보 + 에어코리아 미세먼지(도시별, 마스크 권고)

---

## 3. 이번 세션에서 한 것 (최초 키 발급 이후)

**기존 5개 API 툴 실연동 — 라이브 버그 수정**
- TourAPI: EngService2 GW가 `listYN` 거부 → 제거. 필드 전수 일치 확인.
- TAGO: 서비스 철자가 실제로는 **`Inqire`**(오타가 진짜 스펙) `BusSttnInfoInqireService`/`ArvlInfoInqireService`. 정류소검색 `cityCode`+`nodeNm` 필수, 응답에 citycode 없음→주입. 도시명(영/한)→코드 매핑(getCtyCodeList+별칭).
- ODsay: `ApiKeyAuthFailed`는 **키 문자열 오타**(l↔I)였음. 정정 후 25개 경로 정상.

**신규 아이디어 → 신규 소스/툴 추가(사용자 제안)**
- 서울 버스(서울은 TAGO 미포함이라 별도) / 날씨·대기질(방한객 체감 큼) / 서울 지하철 실시간(경로 선택지 풍부화) / 제주 관광(비짓제주) / 카카오 Local(질의 기반 장소 추천, 일 10만 무료).
- 구현 완료: **`getJejuInfo`**, **`getWeatherAndAir`** (둘 다 실데이터 검증).

---

## 4. 알려진 quirk / 함정 (재현 방지)

- **TAGO**: 철자 `Inqire`. 서울 미포함(전국 138개 도시). `getSttnNoList` 응답 느림(3~6s) → 디렉터리 호출만 타임아웃 6s(캐시 1h). 도착 항목 필드(routeno/arrtime/arrprevstationcnt/vehicletp)는 **새벽이라 라이브 미검증**(문서 스펙 기준).
- **TourAPI**: `listYN` 금지. 엔드포인트 `apis.data.go.kr/B551011/EngService2`.
- **ODsay**: Server 플랫폼은 **요청 IP가 등록 IP와 일치**해야 함. 현재 등록 IP는 개발자 집 IP(`218.48.33.198`) — **KC 배포 시 KC outbound IP로 갱신 필요**(내 애플리케이션→설정, 최대 5개·1분 반영). apiKey는 URLSearchParams로 1회 인코딩(원본 키 그대로 저장).
- **VisitJeju**: **HTTPS 필수**(http는 fetch 실패). `locale=en`이 영어. category=c1관광지/c2쇼핑/c3숙박/c4음식점/c5축제/c6테마.
- **KMA 단기예보**: 위경도 아닌 **격자 nx/ny**(주요도시 테이블 `weatherair.ts`). base_time은 02·05·08·11·14·17·20·23시 발표.
- **AirKorea**: `sidoName`(서울/부산…), 일부 측정소 값 `-`(통신장애)→무시·평균.
- **카카오 Local**: 콘솔에서 **[카카오맵]>[사용 설정] ON** 필요(현재 403 `OPEN_MAP_AND_LOCAL disabled`). 비즈앱 전환 선행(앱아이콘 등록→사업자/본인인증→비즈 전환→카카오맵 ON).

---

## 5. 앞으로 할 일 (TODO)

**구현 남음 (낮 시간 = 실데이터 검증 가능할 때 권장)**
- [ ] **서울 지하철 실시간 툴**(신규): `SUBWAY_API_KEY`, 엔드포인트 `swopenAPI.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/N/{역명}`. 키 검증 OK, 새벽엔 데이터0. 필드 라이브 확인 후 파서 확정.
- [ ] **서울 버스**: `trackBusArrival` 서울 분기 채우기(`lib/sources/seoul.ts`). data.go.kr 서울 버스(같은 `BUS_API_KEY`). 새벽 데이터0.
- [ ] **카카오 Local 장소추천 툴**(신규, 이름 `recommendPlaces` 등): 콘솔 카카오맵 ON 후. 키워드/카테고리 검색(`dapi.kakao.com/v2/local/search/keyword.json|category.json`, 헤더 `Authorization: KakaoAK {REST}`).
- [ ] TAGO 도착 필드 + 지하철/서울버스 **낮 시간 라이브 검증**.

**정리/품질**
- [ ] 툴 개수 재검토: 현재 10개 + 위 3개 = 13개(최대 20 이내지만 권장 10 초과). 유사 툴 통폐합 검토(예: 장소검색 3종 통합 여지).
- [ ] `docs/03`(계약)/`docs/02`(스펙)에 신규 툴 반영(R-DOC).

**배포/응모 (docs/01·07)**
- [ ] MCP Inspector 정식 통과
- [ ] KC Git 소스 빌드 → Active → Endpoint URL → ODsay Server IP를 KC IP로 갱신
- [ ] PlayMCP 임시등록 → 도구함 테스트 → 대화예시 3개(docs/09)
- [ ] `/check` 통과 → 심사요청(≤7/7) → 전체공개 → 비즈폼 응모(≤7/14)

---

## 6. 다음 작업자 즉시 액션
1. (사용자) 카카오 비즈앱 전환: **앱 아이콘 등록**(완료 시) → 사업자/본인인증 → 비즈 전환 → **카카오맵 사용 설정 ON** → 알려주면 `recommendPlaces` 구현.
2. (개발) 낮 시간에 `npm run dev` + `scripts/verify-live.ts`로 서울 지하철/버스 실응답 확인하며 툴 구현.
3. (개발) 위 둘 끝나면 KC 1차 배포 경로 진입.
