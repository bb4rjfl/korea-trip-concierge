# 00. 서비스 오버뷰 (Korea Trip Concierge 총정리)

> 이 서비스가 **무엇이고 / 어떻게 작동하고 / 어떻게 사용자에게 닿고 / 사용자가 무엇을 어떤 모양새로 쓰는지**를 한 문서로.
> 처음 보는 사람(또는 Claude Code)이 전체 그림을 잡는 진입 문서. 규칙은 `01`, 제품 스펙은 `02`, 계약은 `03`.

---

# Part A. 서비스 총정리

## A-1. 한 문장
> **방한 외국인이 한국에서 막히는 4가지(장소 찾기·외국인 친화 매장·대중교통·결제)를, 카카오톡 안에서 영어로 대화하며 푸는 AI 비서.**

앱을 따로 깔지 않는다. 사용자는 **채팅으로 영어로 물어보면**, 뒤에서 우리 서버가 한국의 실시간/공공 데이터를 구조화해 답을 만들어 준다.

## A-2. 누구를 위해, 무엇을
- **1차 사용자**: 방한 외국인 (디지털 장벽으로 재방문을 망설이는 층)
- **2차 사용자**: 외국인 지인을 안내하는 한국인 (본선 투표 모수 확장)
- **해결하는 막힘(핵심 4종 + 생활정보 확장)**: 🗺️ 장소 탐색 · 🏪 외국인 친화 매장 · 🚌 대중교통 · 💳 결제 (+ 🌤️ 날씨/미세먼지 · 🌴 제주 특화)
- **핵심**: T머니·환승·해외카드 가능 매장·실시간 버스·미세먼지처럼 **외국인이 검색만으로 못 푸는 "한국 특수 맥락"** 을 영어로 실시간 정리.

## A-3. 사용자에게 닿는 경로 (제공 방식)
우리는 **앱이 아니라 "MCP 서버"** 를 만든다.

```
┌─────────────┐   영어로 질문    ┌──────────────────┐
│   사용자     │ ───────────────▶ │ 카카오 대화 창      │   ← 사용자가 보는 곳
│ (외국인)     │ ◀─────────────── │ (PlayMCP AI채팅 /  │     (카카오톡/Kakao Tools)
└─────────────┘   답변+선택지칩    │  본선: Kakao Tools) │
                                  └─────────┬────────┘
                                            │ ① LLM이 "이 질문엔 어떤 도구?" 판단
                                            ▼
                                  ┌──────────────────┐
                                  │   LLM (카카오 측)  │  ← 우리 서버를 "도구 묶음"으로 연결
                                  └─────────┬────────┘
                                            │ ② 도구 호출 (MCP 프로토콜, HTTP)
                                            ▼
                          ┌────────────────────────────────┐
                          │  우리 MCP 서버                   │  ← 우리가 만든 것
                          │  korea-trip-concierge (KC 배포)  │     (11개 도구)
                          └─────────┬──────────────────────┘
                                    │ ③ 필요 시 외부 데이터 조회
                                    ▼
                          ┌────────────────────────────────┐
                          │ 공공 API (실시간 버스·관광·경로)  │
                          └────────────────────────────────┘
```

**용어 정리:**
- **MCP (Model Context Protocol)**: LLM이 외부 도구·데이터에 접근하는 **표준 규약**. 우리는 "도구 묶음"을 이 규약으로 제공.
- **PlayMCP**: 카카오의 **MCP 서버 등록·노출 플랫폼**. 등록하면 카카오 사용자에게 노출.
- **KC (카카오클라우드)**: 우리 서버 코드가 **돌아가는 호스팅**. public GitHub repo → KC가 Docker로 빌드·기동.
- **Kakao Tools (본선)**: 카카오톡 안에서 도구를 쓰는 본선 노출 채널.

→ 우리가 만드는 것 = **"카카오톡 속 LLM이 부를 수 있는, 한국 여행 전문 도구 11개".**

## A-4. 작동의 3대 원리 (요약, 상세는 Part B)
1. **Stateless** — 요청마다 서버 인스턴스를 새로 만들어 처리 후 버린다. 사용자/맥락을 저장하지 않는다(맥락은 카카오 LLM이 보유).
2. **푸시 불가** → 서버가 먼저 못 부른다. "알림"은 사용자가 **[🔄 Refresh] 칩을 눌러 다시 조회**하는 방식으로 대체.
3. **버튼 없음** → 응답 끝에 **선택지 칩(2~4개)** 을 텍스트로 깔아, 사용자가 누르듯 입력하면 LLM이 다음 도구를 호출.

## A-5. 사용자가 보는 모양새
화면은 **그냥 채팅**. 한 응답 = (영어 우선 Markdown 본문 + 이모지 배지 + 사진 URL) + (맨 끝 선택지 칩). 항상 24,000자 이하.

```
🍽️ Menu, explained in context — Checking against: gluten

- Tteokbokki — chewy rice cakes in sweet-spicy gochujang.
  Spice 🌶️🌶️🌶️ hot · Allergens: gluten, soy
  - ⚠️ Contains gluten (you flagged this)

---
Tap to continue / 누르듯 골라주세요
- 🗣️ `Make an ordering sentence` — a phrase to order this
- 🌶️ `Show only non-spicy options`
- 🍜 `Find a place that serves this`
```

## A-6. 안 하는 것 (의도적 비범위)
- ❌ 실제 결제·예약 대행 · ❌ 개인정보 6종 수집 · ❌ 푸시 알림 · ❌ 광고/리워드

## A-7. 데이터 출처
| 종류 | 도구 | 출처 | 상태 |
|---|---|---|---|
| 큐레이션(우리 지식) | explainPayment, translateMenuContext, getAreaGuide | 우리가 정리한 한국 특수 지식 | ✅ 키 없이 작동 |
| 관광/매장/영업시간 | searchPlaceForeigner, findForeignerFriendlyStore, getNowInfo | 한국관광공사 TourAPI(영문) | ✅ 실데이터 검증 |
| 경로 | getTransitRoute | ODsay (+ TourAPI 지오코딩) | ✅ 실호출 동작 |
| 실시간 버스 | trackBusArrival | 국토부 TAGO (전국, 서울 별도) | ✅ 비서울 동작 / 서울 대기 |
| 실시간 지하철 | trackSubwayArrival | 서울 TOPIS swopenAPI | ✅ 키·URL 검증 / 도착필드 낮 확인 |
| 제주 관광 | getJejuInfo | VisitJeju | ✅ 영어 실데이터 |
| 날씨+미세먼지 | getWeatherAndAir | 기상청 + 에어코리아 | ✅ 실데이터 |

> **왜 실시간/공공 데이터인가**: 심사는 "LLM이 웹검색만으로 가능한 기능"을 반려한다. 실시간 버스·라이브 관광데이터·환승 경로 = LLM 혼자 못 만드는 값 = 우리의 차별성이자 반려 회피.

---

# Part B. MCP 작동 원리 (심화)

## B-1. MCP가 뭔가 — 한 단계 더
MCP는 **"LLM(클라이언트) ↔ 도구 제공자(서버)" 사이의 통신 규약**이다. USB처럼, 한 번 규약을 맞추면 어떤 LLM 클라이언트든 우리 서버의 도구를 똑같이 쓸 수 있다.

- **클라이언트**: 카카오 측 LLM 런타임 (도구를 "발견"하고 "호출").
- **서버**: 우리 `korea-trip-concierge` (도구를 "선언"하고 "실행").
- **3대 원시기능(primitives)**: `Tools`(실행 가능한 함수), `Resources`(읽을 데이터), `Prompts`(프롬프트 템플릿).
  - ⚠️ **PlayMCP는 현재 Tools만 지원** → 우리는 **Tool 중심**으로 전부 설계.

## B-2. 전송 계층 (Transport) — Streamable HTTP
- 통신은 **JSON-RPC 2.0** 메시지를 **HTTP `POST /mcp`** 로 주고받는다.
- 응답은 **SSE(Server-Sent Events)** 스트림 형식으로 온다 (`event: message` / `data: {...}`).
- **Remote**: 공개 URL로 접근 가능해야 함(= KC 배포 엔드포인트).
- **우리 구현**(`src/server.ts`):
  - `POST /mcp` → 매 요청마다 새 `McpServer` + `StreamableHTTPServerTransport(sessionIdGenerator: undefined)` 생성 → 처리 → close. (**stateless**)
  - `GET /mcp`, `DELETE /mcp` → 405 (세션이 없으므로 스트림 유지/세션 종료를 지원하지 않음)
  - `GET /` → 헬스체크 JSON
  - 잘못된 JSON 본문 → 400 parse error

## B-3. 한 세션의 생애주기 (실제 메시지)
우리 서버를 로컬에서 검증했을 때 실제로 오간 메시지다.

**① initialize — 규약/버전 핸드셰이크**
```jsonc
// 요청 (클라이언트 → 서버)
{"jsonrpc":"2.0","id":1,"method":"initialize",
 "params":{"protocolVersion":"2025-03-26","capabilities":{},
           "clientInfo":{"name":"...","version":"1.0"}}}

// 응답 (서버 → 클라이언트, SSE)
event: message
data: {"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":"2025-03-26",
  "capabilities":{"tools":{"listChanged":true}},
  "serverInfo":{"name":"korea-trip-concierge","version":"0.1.0"}}}
```
→ 서로의 프로토콜 버전·능력(capabilities)을 합의. 우리는 "tools를 제공한다"고 알린다.
(허용 버전: **2025-03-26 ~ 2025-11-25**.)

**② tools/list — 도구 목록 발견**
```jsonc
// 요청
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}

// 응답: 11개 도구 각각 { name, description, inputSchema, annotations }
```
→ LLM은 이 목록의 **name + description + inputSchema + annotations**만 보고 "어떤 질문에 어떤 도구를 쓸지" 판단한다. 그래서 description(영문·서비스명 포함)과 스키마가 정확해야 한다.

**③ tools/call — 도구 실행**
```jsonc
// 요청
{"jsonrpc":"2.0","id":3,"method":"tools/call",
 "params":{"name":"explainPayment",
           "arguments":{"situation":"paying for the subway"}}}

// 응답: 정제된 Markdown 텍스트
{"result":{"content":[{"type":"text","text":"💳 Paying as a foreign visitor — ..."}]}}
```
→ `content`는 **TextContent(Markdown)만** 사용(PlayMCP 보장 타입). 24k 초과 금지.

## B-4. LLM은 어떻게 "도구를 고르는가"
사용자 문장 → LLM이 tools/list의 메타데이터와 대조해 **가장 맞는 도구 1개(또는 연속 호출)** 를 선택하고, 문장에서 인자를 추출해 `arguments`로 채운다. 이때 **annotations 5종**이 클라이언트에게 도구 성격을 알려준다:

| annotation | 의미 | 우리 값(예) |
|---|---|---|
| `title` | 사람이 읽는 이름 | "Track Bus Arrival" |
| `readOnlyHint` | 상태를 바꾸지 않음(읽기) | 전 도구 `true` |
| `destructiveHint` | 파괴적 동작 여부 | 전 도구 `false` |
| `idempotentHint` | 같은 입력=같은 결과? | 지식툴 `true`, 실시간/검색 `false` |
| `openWorldHint` | 외부 세계와 상호작용? | 외부 API 도구 `true` |

예: `trackBusArrival`은 실시간이라 `idempotentHint:false`(같은 인자라도 결과가 바뀜) + `openWorldHint:true`. 반면 `explainPayment`는 큐레이션이라 `idempotentHint:true` + `openWorldHint:false`.

## B-5. Stateless인 이유와 결과
- 매 요청 독립 처리 → **세션·사용자 데이터 무보관** → 개인정보 안 쌓임(규칙 부합)·수평 확장 쉬움.
- 단점("내 위치 계속 추적" 불가)은 **칩 기반 재조회**로 대체(Part B-6).
- 외부 API 응답만 **단기 캐시(TtlCache)** — 사용자 상태가 아니라 **공용 데이터 캐시**라서 stateless 원칙과 충돌하지 않음. (실시간 버스 10초, 관광 5분 등)

## B-6. 성능·안정성 가드 (심사 "안정성" 축)
- **타임아웃 2.5s**(`fetchWithTimeout`) + **재시도 1회** → 외부 API가 느려도 p99 3s 사수.
- **TTL 캐시** → 반복 호출 비용·지연 절감.
- **24k 가드**(`renderMarkdown`) → 본문이 길면 잘라도 **칩은 항상 생존**.
- **친화적 에러**: 실패 시 사용자용 Markdown 에러 + [🔄 다시 시도] 칩.
- **네이밍 린트**(빌드 게이트): 서버/툴명에 `kakao` 들어가면 **빌드 실패**.

---

# Part C. 11개 도구 상세 흐름

각 도구: **트리거(사용자 말) → 입력 스키마 → 서버 내부 처리 → 출력 → 칩(연결되는 다음 도구)**.
공통: 키 없으면 "🔌 미연동" 안내, 외부호출 실패 시 친화 에러+재시도 칩, 응답 끝에 칩 2~4개.

## C-1. searchPlaceForeigner — 장소 검색
- **트리거**: "quiet cafe near Hongdae with English menu"
- **입력**: `query`(필수), `area?`, `category?`(food/cafe/attraction/shopping/culture)
- **처리**: TourAPI 영문(EngService2) `searchKeyword2` 호출 (keyword = query+area, category→contentTypeId). 결과 5개로 정제(이름·주소·사진·전화).
- **출력**: 영어 장소 리스트 + 사진. *English-friendly results from Korea Tourism data*.
- **칩** → `findForeignerFriendlyStore`(해외카드 매장) / `getAreaGuide`(동네) / `getTransitRoute`(가는 길)
- annotations: readOnly✓ / idempotent✗(검색) / openWorld✓

## C-2. findForeignerFriendlyStore — 외국인 친화 매장 (K-Pass Finder)
- **트리거**: "places in Myeongdong I can walk into / use a foreign card"
- **입력**: `area`(필수), `needs?`(noReservationNeeded/acceptsForeignCard/hasMultilingualMenu/walkInOk), `category?`(기본 food)
- **처리**: TourAPI 영문에서 area의 음식점 등 조회. **정직성 원칙**: TourAPI엔 '해외카드 가능' 플래그가 없으므로, **영어로 등재된 매장(외국인 지향의 실제 신호)** 을 보여주고 요청 필터는 투명하게 표기(허위 배지 금지). 향후 큐레이션 오버레이로 결제 플래그 보강.
- **출력**: 매장 목록 + "Listed in Korea Tourism's English dataset" + 결제 확인 유도.
- **칩** → `explainPayment`(결제) / `translateMenuContext`(메뉴) / `getTransitRoute`(가는 길)
- annotations: readOnly✓ / idempotent✗ / openWorld✓

## C-3. getTransitRoute — 대중교통 경로
- **트리거**: "How do I get from Seoul Station to Seongsu?"
- **입력**: `from`(필수), `to`(필수), `departAt?`
- **처리**: 이름→좌표를 **TourAPI로 지오코딩**(top place의 mapx/mapy) → **ODsay** `searchPubTransPathT`로 경로 → 상위 1~2개 정제(지하철🚇/버스🚌/도보🚶, 노선명, 구간, 요금, 총 소요). **두 키(TRANSIT+TOUR) 모두 필요.**
- **출력**: `Option 1 — 34 min · ₩1,500` + 구간 리스트.
- **칩** → `getTransitRoute`(지금 출발 새로고침) / `explainPayment`(교통 결제) / `getAreaGuide`(도착지 동네)
- annotations: readOnly✓ / idempotent✗ / openWorld✓

## C-4. trackBusArrival — 실시간 버스 (K-Bus Companion, 조회형)
- **트리거**: "Bus 143 to Seomyeon in Busan, how close?"
- **입력**: `busNumber`(필수), `dropOffStop`(필수), **`city`(필수)**, `currentStop?`
- **처리**: **TAGO(전국)** 2단계 — ① `city`→cityCode + 정류소명→nodeId 해석 ② 도착정보 조회 → 노선번호로 필터 → **남은 정거장수 + 예상 분**. 실시간이라 캐시 10초. ⚠️ **TAGO에 서울 미포함** → 서울 입력은 "경로 안내 사용" 폴백(서울 전용 소스 활용신청 대기).
- **출력**: "🚌 Bus 143 → ... Currently 3 stops away, about 6 min". 1정거장 이하면 "🛑 Almost there".
- **푸시 아님**: 사용자가 [🔄 Refresh] 칩으로 재호출 → 매번 최신.
- **칩** → `trackBusArrival`(Refresh) / `trackBusArrival`(Am I close?) / `getTransitRoute`(내린 뒤 길찾기)
- annotations: readOnly✓ / **idempotent✗(실시간)** / openWorld✓

## C-4b. trackSubwayArrival — 서울 지하철 실시간 (조회형)
- **트리거**: "Next train at Hongik University? / 강남역 지하철"
- **입력**: `station`(필수, 영문/한글)
- **처리**: 영문 역명→한글 매핑(주요/관광역) → 서울 TOPIS **realtimeStationArrival** 조회 → 방면별 다음 열차(노선·N분·현재위치). 캐시 10초.
- **출력**: 🚇 역 다음 열차 목록(방면 그룹). 운행外/데이터없음(05:30~01:00 밖)이면 안내.
- **칩** → `trackSubwayArrival`(Refresh) / `getTransitRoute`(경로) / `getAreaGuide`(역 주변)
- annotations: readOnly✓ / idempotent✗(실시간) / openWorld✓

## C-5. explainPayment — 결제 안내 (큐레이션, 즉시 작동)
- **트리거**: "Can I use my Visa on the subway?"
- **입력**: `situation`(필수), `cardType?`
- **처리**: 상황을 정규식으로 매칭 → 큐레이션 지식(교통/택시/시장/편의점/백화점·면세/키오스크/일반). 외부 호출 없음.
- **출력**: ✅되는 것 / ⛔안 되는 것 / 💡팁. (예: 지하철→T-money 권장, 해외카드 직접삽입 비권장.)
- **칩** → `explainPayment`(버스 결제) / `explainPayment`(키오스크) / `findForeignerFriendlyStore`(해외카드 매장)
- annotations: readOnly✓ / **idempotent✓** / **openWorld✗**

## C-6. getAreaGuide — 동네 가이드 (큐레이션, 즉시 작동)
- **트리거**: "What's Seongsu like for cafes?"
- **입력**: `area`(필수), `interest?`(food/shopping/history/nightlife)
- **처리**: 내장 동네 데이터(명동·홍대·강남·인사동·성수·이태원·북촌·동대문)에서 매칭 → 한 문단 소개 + 핵심 스팟 + 가는 법 + 관심사별 팁.
- **출력**: 동네 요약 카드.
- **칩** → `findForeignerFriendlyStore`(근처 맛집) / `getTransitRoute`(가는 길) / `getNowInfo`(지금 갈 만한지)
- annotations: readOnly✓ / idempotent✓ / openWorld✓

## C-7. translateMenuContext — 메뉴 맥락 해석 (큐레이션, 즉시 작동)
- **트리거**: "떡볶이, I'm allergic to gluten"
- **입력**: `menuText`(필수), `allergyConcerns?`(예: ['gluten','shellfish'])
- **처리**: 내장 음식 데이터(한/영 매칭)에서 항목 찾기 → 설명 + 맵기(🌶️) + 알레르기 목록. 사용자가 신고한 알레르기와 교집합이면 **⚠️ 경고**.
- **출력**: 항목별 설명 카드 (단순 번역이 아니라 맥락+안전).
- **칩** → (주문 문장 만들기) / (안 매운 것만) / `findForeignerFriendlyStore`(파는 곳 찾기)
- annotations: readOnly✓ / idempotent✓ / openWorld✗

## C-8. getNowInfo — 지금 갈 만한지
- **트리거**: "Is Gyeongbokgung worth going now?"
- **입력**: `place`(필수)
- **처리**: TourAPI `searchKeyword2`로 장소 특정 → `detailIntro2`로 영업시간/휴무 → **현재 한국 시각(KST)** + 장소 도시의 **실시간 날씨·미세먼지**(getWeatherAndAir 재사용, U2) 종합.
- **출력**: 현재 KST + 영업시간/휴무 + 늦은 시간 경고 + 🌤️ 날씨·대기질 한 줄. 과도한 단정 없이 정직하게.
- **칩** → (더 좋은 시간) / (대안 장소) / `getTransitRoute`(가는 길)
- annotations: readOnly✓ / idempotent✗(현재시각 의존) / openWorld✓

## C-9. getJejuInfo — 제주 특화
- **트리거**: "What can I do in Jeju? / Jeju restaurants"
- **입력**: `category?`(attraction/restaurant/festival/shopping/accommodation/theme), `limit?`(1~10, 기본 6)
- **처리**: **VisitJeju Open API**(영어, HTTPS, locale=en) 카테고리별 조회 → 이름·분류·주소·소개·전화. 전국 TourAPI에 제주가 빈약해 별도 소스로 보강.
- **출력**: 🌴 제주 항목 목록.
- **칩** → (관광지/맛집/축제) / `getTransitRoute`(이동)
- annotations: readOnly✓ / idempotent✓ / openWorld✓

## C-10. getWeatherAndAir — 날씨 + 미세먼지
- **트리거**: "How's the weather and air in Seoul today?"
- **입력**: `city?`(기본 Seoul)
- **처리**: **기상청 단기예보**(nx/ny 격자, 도시 테이블) + **에어코리아**(시도별 PM10/PM2.5 평균·등급) 병렬 조회 → 기온·하늘·강수확률 + 미세먼지 등급 + **마스크 권고**. 값 `-`(통신장애)는 무시.
- **출력**: 🌤️ 날씨·대기질 카드 + 영어 권고.
- **칩** → (옷차림) / (공기 나쁠 때 실내장소) / `getTransitRoute`(경로)
- annotations: readOnly✓ / idempotent✗(시간 변동) / openWorld✓
- 키: 기상청·에어코리아 모두 `BUS_API_KEY`(동일 data.go.kr 키).

## C-11. 도구를 잇는 "여정 그래프"
칩은 단순 버튼이 아니라 **다음 도구로의 다리**다. 자연스러운 여정:

```
getAreaGuide ──🍜──▶ findForeignerFriendlyStore ──🚇──▶ getTransitRoute ──💳──▶ explainPayment
     │                        │                                              
     └──🕒──▶ getNowInfo      └──🍽️──▶ translateMenuContext ──🗣️──▶ (주문 문장)

searchPlaceForeigner ──▶ {findForeignerFriendlyStore | getAreaGuide | getTransitRoute}
trackBusArrival ──🔄 Refresh(재호출)──▶ trackBusArrival ──🗺️──▶ getTransitRoute
```

이렇게 **한 번의 질문에서 칩만 눌러 장소→매장→교통→결제로 끊김 없이** 이어지는 것이 본선 데모/투표의 핵심 인상이다(`04_ux_interaction.md`).

---

## 참고 (현재 구현 상태)
- **11개 도구** 전부 계약·코드 완성. 지식툴 3종(C-5/6/7)은 키 없이 작동, API툴 8종은 실데이터 검증(서울 지하철 도착필드만 낮 확인 / 서울 버스 분기·카카오 Local 보류).
- 코드 위치: `src/server.ts`(전송), `src/tools/*`(도구 11), `src/lib/*`(공통: 칩·24k가드·캐시·타임아웃·네이밍린트), `src/lib/sources/*`(TourAPI·TAGO·ODsay·VisitJeju·기상청+에어코리아·서울지하철).
- 검증: `npm run build` / `npm test`(83 green) / `scripts/verify-live.ts` + 핸들러 직접 라이브 호출.
- ⚠️ 11개 = 권장 10 초과(하드 20 이내) → 유사 장소툴 통폐합 검토 중(docs/06).
- **UX/구조 하드닝(검토 반영)**: 한글 지명 로마자화(`romanize.ts`, U1), getNowInfo 실시간 날씨 통합(U2), 경로 출발지 옵션화(U3), 발견성 교차칩(U5), 이미지 수 제한(U8), TourAPI 타이틀 정제·검색 카테고리 추론(라이브 발견 수정), 헬스 키요약·툴 타이밍 로그(S5/S1).
- **다국어(U4) 구현됨**(D-008): TourAPI 장소 툴에 `language` en/ja/zh/ko — 영/일/중간/국 서비스 전환, 장소명·주소가 해당 언어(라이브 ja/zh/ko 검증). UI 라벨은 영어 유지. 방한 1·2위 중·일 시장 직접 타깃.
- 진행 상황은 `07_progress.md`(SSOT), 키 발급은 `08_api_key_issuance.md`, 데모 예시는 `09_demo_conversations.md`, 상세 핸드오프는 `10_handoff.md`.
