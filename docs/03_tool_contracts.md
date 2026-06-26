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
- **inputSchema**: `{ query: string (required), area?: string, category?: string, language?: enum(en,ja,zh,ko) }`
- **다국어(D-008/U4)**: `language`로 TourAPI 영/일/중간/국 서비스 전환 → 장소명·주소가 해당 언어. 키워드도 그 언어로 매칭(자국어 질의). 기본 en.
- **소스 우선순위(D-015)**: **① 서울 + 비식음** → **VisitSeoul 공식 영어 큐레이션 메인**(`src/lib/sources/visitseoul.ts`; 관광/쇼핑/문화/자연/체험/역사, 지역키워드 narrowing + `inferSeoulCategory` 카테고리, 요약 포함). VisitSeoul 빈약 시 ② 그라운딩으로 폴백. **② 식음(cat=food, 카페 포함)** → 좌표 POI(Naver/Foursquare, dish 정밀). **③ 서울 외 / VisitSeoul 미스** → TourAPI 영문 + 좌표 KorService2 로마자 보강(기존). 서울 판정=`isSeoulText`(이름 'seoul/서울' 또는 좌표 바운딩박스). VisitSeoul 미연결(키 없음) 시 자동으로 ②③만 동작.
- **output(Markdown)**: 장소 3~6개, 각 항목 한 줄 요약+친화 배지(VisitSeoul은 공식 영어요약+사진). 끝에 선택지.
- annotations: readOnly true / destructive false / idempotent false / openWorld true

## 2. `findForeignerFriendlyStore`  (외국인 필수시설 파인더 — D-013)
- **title**: "Find Foreigner Essentials"
- **description(영문)**: "Finds the foreigner essentials a visitor gets stuck on in a Korean neighborhood — currency exchange, foreign-card ATMs, pharmacies, 24h convenience stores, tourist-information centers, and foreign-card-friendly food — with curated tips on which chains and options actually work for foreigners, plus real nearby places. Part of Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ area: string (required), need?: enum(currencyExchange, atm, pharmacy, convenience, touristInfo, foreignCardDining) }` — need 생략 시 필수시설 오버뷰(메뉴).
- **데이터**: **큐레이션 지식**(D-009: 외국인에게 실제 되는 체인·옵션·방법, 키 불필요·항상 동작 = 차별점) + need별 **근처 실제 POI**(Naver/Foursquare, query=환전/ATM/약국/편의점/관광안내소/맛집). searchPlaceForeigner(일반 장소추천)와 역할 명확 구분.
- **output**: need지정→큐레이션 팁+근처 목록 [💳 결제][🚇 길찾기][🧭 다른 필수시설] / 오버뷰→6종 메뉴 [🏧 ATM][💱 환전][💊 약국][🏪 편의점]. 상업유도/리워드 금지.
- annotations: readOnly true / destructive false / idempotent false / openWorld true
- 참고: 기존 needs[] 에코방식(원천데이터 부재로 빈약)을 D-013로 폐기·재설계. ATM/환전 POI 검색에 약간 노이즈 가능(쿼리 정제 여지).

## 3. `getTransitRoute`
- **title**: "Get Public Transit Route"
- **description(영문)**: "Returns public-transit routes (subway/bus) between two points in Korea with fares, transfers, and time, explained in English for foreign visitors. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ to: string (required), from?: string, departAt?: string }` — `from` 미지정(칩에서 목적지만 온 경우)이면 "출발지 알려달라" 정중 안내로 폴백(U3).
- **output**: 1~3개 경로, 각 경로 단계·요금·소요·환승. 끝에 선택지(지하철 실시간/결제/도착지 동네).
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
- **데이터**: **큐레이션 동네가이드**(키 불필요·항상 동작). **21개 동네**(D-014로 8→21 확장): 서울 14(명동·홍대·강남·인사동·성수·이태원·북촌·동대문 + **여의도·잠실/롯데월드·익선동·을지로·삼청동·가로수길/신사**), **부산 5**(해운대·서면·광안리·남포동/자갈치·감천문화마을), **제주 2**(제주시·서귀포). `keys` 정규식에 한글 별칭 포함, 첫 매칭 우선(순서 주의).
- **output**: 동네 요약 + 스팟 3~5 + 이동 팁 + interest별 노트. 끝에 선택지(근처 필수시설/길찾기/지금가기/날씨 → 다른 툴 연결). 미수록 동네는 "실제 검색" 유도 폴백.
- annotations: readOnly true / idempotent true / openWorld true

## 7. `translateMenuContext`
- **title**: "Explain Korean Menu in Context"
- **description(영문)**: "Explains Korean menu items and dishes with cultural/spice/allergen context in English — more than literal translation. Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ menuText: string (required), allergyConcerns?: string[] }`
- **output**: 항목별 설명·맵기·알레르기 주의 영문. 끝에 선택지(주문 문장 만들기).
- annotations: readOnly true / idempotent true / openWorld false

## 8. `getNowInfo`
- **title**: "Is It Good to Go Now?"
- **description(영문, 실제 코드와 일치)**: "Tells a foreign visitor whether a place is worth visiting right now using its listed opening hours and the current Korea time, with a clear go/no-go and reasons. Part of Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ place: string (required), language?: enum(en,ja,zh,ko) }`
- **데이터/로직(D-014)**: **① 큐레이션 랜드마크 오버레이 우선**(`src/lib/landmarks.ts`, ~27개 외국인 인기명소: 5대궁·종묘·N서울타워·롯데월드/타워·COEX아쿠아리움·한강공원(24h)·북촌(주간)·DDP(일부24h)·광장/남대문/명동 시장·전쟁기념관·리움·부산 해운대/광안리/감천/자갈치·제주 성산일출봉(일출)/만장굴/한라산 등). `fuzzy.resolveName` 신뢰매칭 시 **정확 영업시간 + 현재 KST**로 즉시 🟢열림/🔴닫힘 판정(24h/daylight/sunrise/구간 4유형, closedDays 우선). **키 불필요·API콜 0**(p99 보호) → C7(Han River→호텔, Lotte World→매장) 오매칭 해소. **② 서울 임의장소는 VisitSeoul 상세 폴백(D-015)**: 큐레이션 미매칭 시 VisitSeoul 키워드검색→`pickConfidentMatch`(약한 부분일치 거부)→contents/info의 영업시간/휴무/**영문 지하철안내**/도로명주소로 판정(TourAPI보다 영문 시간 풍부, C7 미해소분 메움). **③ 그래도 미스 시 TourAPI 폴백**(기존 흐름: 검색·되묻기·detailIntro2 시간). 셋 다 실시간 날씨·미세먼지 1줄 통합.
- **output**: 지금 상태(판정 헤드라인 + 영업시간 + 현재 KST 시각 + 닫는요일 + 한줄노트 + 실시간 날씨·미세먼지) + 추천 여부. 끝에 선택지(대안 시간/대안 장소). ⚠️ "crowd level"은 미구현(데이터원 없음) → 설명에서 제외(R-DOC 정합).
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

## 11. `trackSubwayArrival`  (서울 지하철 실시간, 조회형 — 3모드 D-012)
- **title**: "Track Subway Arrival"
- **description(영문)**: "Real-time Seoul subway info in English for foreign visitors. By station: next-train arrivals (line, direction, destination, minutes away). By station + destination: how many stops are left until you get off (countdown as you ride). By line: the live position of every train. Query-based (refresh to update). Part of Korea Trip Concierge(코리아 트립 컨시어지)."
- **inputSchema**: `{ station?: string, to?: string, line?: string }` — **station / (station+to) / line 중 하나**(없으면 무엇을 볼지 되묻는 칩). 우선순위: station+to(여정) → line(위치) → station(도착).
- **데이터**: 서울 TOPIS swopenAPI(`SUBWAY_API_KEY`, path 세그먼트), 3 모드:
  - **station** → `realtimeStationArrival`: 방면별 다음 열차.
  - **station+to (여정/하차안내, Phase 2)** → 두 역의 `statnId`(realtimeStationArrival, **노선상 순차증가** 검증됨)로 **정거장 수 = |statnId 차| (같은 노선일 때)**. 다른 노선이면 환승 필요 → getTransitRoute 유도. 현재역 도착열차도 함께 표시.
  - **line** → `realtimePosition`(OA-12601): 노선 전체 열차 위치(현재역·종착·상태·급행·막차). 라이브 검증(2호선 39~42열차).
  - ⚠️ 운행 05:30~01:00, 데이터없음 `{code:"INFO-200"}` → 빈 목록.
- **output**: station→[🔄][🗺️][🏙️] / 여정→정거장수+"~까지 N stops"+다음열차 [🔄 Where am I now][🏁 Arrivals at dest][🗺️ Route] / line→종착지별 위치(방면당 8대 cap) [🔄][🚉][🗺️]. **푸시 아님 — 조회**(타며 재조회로 카운트다운).
- annotations: readOnly true / idempotent false (실시간) / openWorld true
- 검증: parseArrivals/parsePositions/parseStationIds/resolveStationName/resolveLineName 테스트 락(103). **여정 모드 운행外**: statnId는 실시간 도착에서만 얻으므로 01:00~05:30엔 ids 없음 → "라이브 데이터 없음(운행 05:30~01:00)" 안내(≠"다른 노선"). **알려진 한계**: 순환 2호선 statnId 차 짧은/긴쪽 구분 약함, 방면필터 미적용(MVP).

---

## 공통 에러 처리
- 외부 API 실패/타임아웃 → 사용자 친화 Markdown 에러 + 선택지(재시도). 24k 초과 시 요약/절단.
- 인증 필요(해당 시) 없음/만료 → 401.
- 응답에 개인정보 6종 절대 미포함.
