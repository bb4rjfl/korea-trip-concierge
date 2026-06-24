# 03. 툴 입출력 계약 (Tool Contracts)

> 구현의 단일 기준. 각 툴은 카카오 규칙(01) 준수: 영문 description(≤1024, 서비스명 포함), annotations 5종, Markdown 응답(≤24k).
> description은 예시이며 구현 시 1,024자 이내로 다듬는다. 모든 응답 끝에 **다음 액션 선택지**(04) 포함.

공통 annotations 가이드:
- 조회/읽기 전용 툴: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`(외부 데이터), `title`: 사람이 읽을 이름.
- 외부 실시간 데이터 호출 툴은 `openWorldHint: true`.

---

## 1. `searchPlaceForeigner`
- **title**: "Search Places for Foreign Visitors"
- **description(영문)**: "Recommends places in Korea based on a foreign visitor's natural-language intent, weighting foreigner-friendliness (English support, walk-in, foreign-card acceptance). Part of Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ query: string (required), area?: string, category?: string }`
- **output(Markdown)**: 장소 3~5개, 각 항목 한 줄 요약(영문)+외국인 친화 배지. 끝에 선택지.
- annotations: readOnly true / destructive false / idempotent false / openWorld true

## 2. `findForeignerFriendlyStore`  (K-Pass Finder)
- **title**: "Find Foreigner-Friendly Stores"
- **description(영문)**: "Filters nearby stores/restaurants that need no Korean phone verification, accept foreign cards, offer multilingual menus, or allow walk-in. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ area: string (required), needs?: string[] (enum: noReservationNeeded, acceptsForeignCard, hasMultilingualMenu, walkInOk), category?: string }`
- **output**: 조건 충족 매장 목록 + 충족 플래그 배지 + 지도 링크(아웃링크 허용, 상업유도 금지). 끝에 선택지(필터 토글 버튼).
- annotations: readOnly true / destructive false / idempotent false / openWorld true

## 3. `getTransitRoute`
- **title**: "Get Public Transit Route"
- **description(영문)**: "Returns public-transit routes (subway/bus) between two points in Korea with fares, transfers, and time, explained in English for foreign visitors. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ from: string (required), to: string (required), departAt?: string }`
- **output**: 1~3개 경로, 각 경로 단계·요금·소요·환승. 끝에 선택지(다른 경로/지금 출발 새로고침).
- annotations: readOnly true / idempotent false / openWorld true

## 4. `trackBusArrival`  (K-Bus Companion, 조회형)
- **title**: "Track Bus Arrival"
- **description(영문)**: "Looks up the real-time position of a specific Korean city bus and how many stops remain until the user's drop-off stop, with an English heads-up message. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ busNumber: string (required), dropOffStop: string (required), city: string (required), currentStop?: string }`
- **데이터**: 국토부 **TAGO 전국 버스도착정보**(`BUS_API_KEY`). 정류소명→cityCode+nodeId 해석 후 도착조회. ⚠️ **TAGO에 서울 미포함** → `city`로 도시 특정 필수. 서울 입력 시 별도 소스(seoul.ts, 활용신청 대기) 연결 전까지 "경로 안내 사용" 폴백.
- **output**: 남은 정거장·예상시간·하차 안내 문구(영문). **푸시 아님 — 조회**. 끝에 **[🔄 Refresh] [🚏 Am I close?]** 선택지.
- annotations: readOnly true / idempotent false (실시간 변동) / openWorld true
- ⚠️ 외부 API 타임아웃(예 2.5s)·캐싱으로 p99 3s 사수. 단 TAGO 정류소검색(디렉터리)은 6s 허용+장기캐시. 24k 가드.

## 5. `explainPayment`
- **title**: "Explain Payment Options for Foreigners"
- **description(영문)**: "Explains which payment methods a foreign visitor can actually use in a given Korean situation (transit, market, taxi, kiosk), including foreign-card and contactless caveats. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ situation: string (required), cardType?: string }`
- **output**: 가능/불가 방법 + 대안(현금/충전 등) 영문 정리. 끝에 선택지(관련 상황 더보기).
- annotations: readOnly true / idempotent true / openWorld false (큐레이션 지식 중심) — 단 실시간 요소 있으면 openWorld true

## 6. `getAreaGuide`
- **title**: "Get Neighborhood Guide"
- **description(영문)**: "Gives a concise English one-paragraph guide and top spots for a Korean neighborhood, tailored to foreign visitors. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ area: string (required), interest?: string }`
- **output**: 동네 요약 + 스팟 3~5 + 이동 팁. 끝에 선택지(근처 맛집 찾기 → 툴2 연결).
- annotations: readOnly true / idempotent true / openWorld true

## 7. `translateMenuContext`
- **title**: "Explain Korean Menu in Context"
- **description(영문)**: "Explains Korean menu items and dishes with cultural/spice/allergen context in English — more than literal translation. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ menuText: string (required), allergyConcerns?: string[] }`
- **output**: 항목별 설명·맵기·알레르기 주의 영문. 끝에 선택지(주문 문장 만들기).
- annotations: readOnly true / idempotent true / openWorld false

## 8. `getNowInfo`
- **title**: "Is It Good to Go Now?"
- **description(영문)**: "Tells a foreign visitor whether a place is worth visiting right now using opening hours, crowd level, and weather. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ place: string (required) }`
- **output**: 지금 상태(영업시간 + 현재 KST 시각) + 추천 여부. 끝에 선택지(대안 시간/대안 장소). (혼잡/날씨는 향후 보강 — 현재 시간 기반.)
- annotations: readOnly true / idempotent false / openWorld true

## 9. `getJejuInfo`  (제주 특화)
- **title**: "Jeju Island Info"
- **description(영문)**: "Gives a foreign visitor English travel info for Jeju Island — attractions, restaurants, festivals, shopping, or accommodations — from the official VisitJeju data, with names, addresses, and short intros. Part of Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ category?: enum(attraction, restaurant, festival, shopping, accommodation, theme), limit?: number(1~10, 기본 6) }`
- **데이터**: **VisitJeju Open API**(`JEJU_API_KEY`). ⚠️ HTTPS 필수, `locale=en`(영어), category c1관광지/c2쇼핑/c3숙박/c4음식점/c5축제/c6테마. 전국 TourAPI에 제주가 빈약해 별도 소스로 보강.
- **output**: 제주 항목 목록(이름·분류·주소·소개·전화). 끝에 선택지(관광지/맛집/축제/이동).
- annotations: readOnly true / idempotent true / openWorld true

## 10. `getWeatherAndAir`  (현지 생활정보)
- **title**: "Weather & Air Quality"
- **description(영문)**: "Gives a foreign visitor the current weather forecast and fine-dust (PM10/PM2.5) air quality for a Korean city, with a plain-English advisory (e.g. whether to wear a mask). Part of Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ city?: string (기본 Seoul) }`
- **데이터**: **기상청 단기예보(KMA)** + **에어코리아 대기오염**(둘 다 `BUS_API_KEY` 동일 data.go.kr 키). ⚠️ KMA는 위경도 아닌 nx/ny 격자(도시 테이블), AirKorea 값 `-`(통신장애)는 무시.
- **output**: 기온·하늘·강수확률 + PM10/PM2.5 등급 + 마스크 권고(영문). 끝에 선택지(옷차림/실내장소/경로).
- annotations: readOnly true / idempotent false (시간 변동) / openWorld true

---

## 공통 에러 처리
- 외부 API 실패/타임아웃 → 사용자 친화 Markdown 에러 + 선택지(재시도). 24k 초과 시 요약/절단.
- 인증 필요(해당 시) 없음/만료 → 401.
- 응답에 개인정보 6종 절대 미포함.
