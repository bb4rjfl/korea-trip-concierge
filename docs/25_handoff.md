# 25. 핸드오프 — 2026-06-29 작성 / 2026-06-30 갱신 (새 세션 진입점, 아주 풍부한 맥락판)

> **새 세션은 이 문서를 가장 먼저, 끝까지 읽어라.** 그다음 `CLAUDE.md` → `docs/07_progress.md`(SSOT) → `docs/06_decision_log.md`(D-001~D-036) → `docs/03_tool_contracts.md`. 이 문서는 **요약이 아니라 맥락 전수**가 목적이라 길다. **§0.5(최신 갱신, D-027~D-036)를 먼저 읽고** 그다음 본문(D-026까지의 풍부한 맥락)으로.

---

## 0. 한 줄 상태
**Korea Trip Concierge** — 방한 외국인용 **13-tool MCP 서버**(TS+Node22, Streamable HTTP, stateless). 카카오 Agentic Player 10 출품작, 목표=대상. **KC 배포 Active, 현재 라이브 빌드 `b6fa935`(D-036까지).** v6 300-시나리오 게이트 GO + 이후 D-027~D-036 강화·라이브검증 완료. **263 tests green.** 심사요청은 합의대로 보류(사용자 결정 대기, 재촉 금지).

---

## 0.5 최신 갱신 (2026-06-30, D-027~D-036) — **새 세션은 여기부터**

직전 세션(이 문서 본문, D-026까지) 이후 두 세션에서 한 일. 전부 커밋·푸시·라이브 검증됨.

- **A+B+C+TourAPI (D-027~D-030)**: **A** 서울버스↔여정 통합(getTransitRoute 버스칩에 하차정류소 적재→trackBusArrival 원탭; dropOffStop optional + 서울 **노선위치 모드** `getBusPosByRtid`). **B** 코스 **Phase 3**: **경주**(4번째 도시·11스팟)+부산/제주 스팟 추가(총 76)+**페르소나 10**(nightlife/nature/solo/budget 추가). **C** 템플스테이 큐레이션 프라이머(P3). **D-027 TourAPI** 법정동 변경공지 = areaCode 미사용이라 **영향 없음**(코드 무변경).
- **🟢 칩 렌더링 대발견 (D-031~D-033)**: 사용자가 카카오톡 스크린샷(getAreaGuide 칩 누락) 공유 → **playmcp.kakao.com AI채팅을 직접 구동(Chrome/컴퓨터유즈, 강상호 로그인)해 실측**. **카카오 호스트 LLM이 우리 TextContent를 paraphrase(재작성)하며 "Tap to continue" 칩 푸터를 통째로 떨어뜨림**을 입증(Response탭 raw엔 있는데 사용자 답변엔 없음). 단 **구체적 링크/사실은 유지**. → **수정**: footer에 **조합 LLM용 명시 지시문**(`_(Assistant: you MUST end your reply with the following as tappable next-step questions, verbatim)_`) 추가 → **칩이 라이브에서 생존**(getAreaGuide·recommendTripCourse·searchPlaceForeigner 전부 확인). **이게 핵심 차별점(칩 여정)의 예선 surface 생존 해법.**
- **맵 링크 (D-032)**: 장소·동네·now 응답에 **네이버+카카오맵 딥링크**(`maplinks.ts`). 호스트가 링크 1개만 남기는 경향 + 대회 네이티브라 **카카오맵 우선**. 라이브 클릭링크 확인.
- **맥락 칩 통일 (getAreaGuide D-031 / searchPlaceForeigner D-035)**: 칩을 **동네명 박힌 자연어 질문**으로("How do I get to {area}?"·"Guide me around {area}"·"{area} course for my style?"). 도시 가드(get to Seoul? 방지). 라이브 확인(Seongsu/Insadong/Hapjeong).
- **서울 도보해설관광 (D-034)**: 서울시 공식 **무료·7개언어 도보해설관광**(dobo.visitseoul.net, ~50코스, 1일2회) 큐레이션 프라이머(`guidedTourLead`, 템플스테이 패턴) + recommendTripCourse **서울 역사/문화 코스에 🚶칩**. 라이브 확인.
- **콜드스타트 예열 (D-036)**: 라이브에서 **재배포 직후 첫 POI(카페/맛집) 쿼리가 2.5s 타임아웃** 발견(TLS/DNS 콜드) → `warmup.ts`가 부팅 때 8개 외부 origin 커넥션 예열. p99<3s라 타임아웃 상향 불가 → 예열이 정답.
- **부수 발견(코드무변경)**: 사용자 테스트 도구함에 **카카오맵 MCP가 같이** 담겨 일반 장소쿼리는 그쪽으로 라우팅("외국인 친화"쿼리는 우리). **대회 제출=우리 MCP 단독**이라 실사용자엔 경쟁 없음.
- **카카오 대회/배포 사실 재확인**: 도구함 추가만으로 **심사 전에도 본인 카톡/플레이그라운드에서 사용 가능**(스크린샷이 그 상태). 일반 공개 = 심사승인+"전체공개"+비즈폼. 예선=PlayMCP AI채팅(TextContent), 본선=Kakao Tools(Widget=진짜 버튼).
- **🔧 새 세션 워크플로우**: 라이브 칩/링크 검증은 **playmcp.kakao.com AI채팅을 Chrome MCP로 직접 구동**(강상호 로그인 상태)이 가장 현실적. 연결 MCP 직접호출은 raw 출력(호스트 재작성 전)이라 칩 생존은 못 봄 — UI로 봐야 함. (단 POI 헬스 등은 연결 MCP로 충분.) ⚠️ 컴퓨터유즈로 카톡 직접구동은 개인 대화방 오발송 위험으로 지양.
- **다음**: 남은 폴리시/콘텐츠(아래 §10). 핸드오프 본문(§1~§16)은 D-026까지의 풍부한 맥락 — 그대로 유효.

---

## 1. 무엇을 만들고 있나 (제품 정체성)
방한 외국인이 막히는 지점(교통·결제·**본인인증/시스템 장벽**·장소탐색·메뉴·날씨·**여행코스**)을 **영어로 구조화**해 푸는 MCP. 차별점은 **"외국인이 못 푸는 한국 특수맥락"**을 실데이터 + 큐레이션으로 주고, **사용자가 길게 안 써도 칩(버튼)을 눌러 여정을 이어가게** 설계한 것. 본선 데모/투표 핵심 = **"칩으로 끊김없이 이어가는 여정" + 페르소나별 추천 코스**.

**13 tools**: searchPlaceForeigner, findForeignerFriendlyStore, getTransitRoute, trackBusArrival, trackSubwayArrival, explainPayment, explainKoreanService, getAreaGuide, translateMenuContext, getNowInfo, getJejuInfo, getWeatherAndAir, **recommendTripCourse**(13번째, D-025).

---

## 2. 배포 상태 + build-SHA 신선도 신호 (반드시 숙지)
- KC(PlayMCP in KC)에 **컨테이너 이미지(ghcr 비공개)로 Active**. ID 638, namespace `kbm-u-4961514721`.
- Endpoint: `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp` · 헬스: 끝의 `/`(JSON `build`/`version`/`tools`/`sources`).
- **`build` = 배포된 커밋 SHA 앞 7자**(GIT_SHA 빌드주입). 재배포마다 `GET /`의 `build`를 `git rev-parse --short HEAD`(또는 해당 커밋)와 비교해 신선도 1초 확인. version 0.1.0·tools 수는 신선도 신호 아님.
- **재배포 흐름**: ① 로컬 수정→커밋→`git push origin main`(= Actions `deploy-image` 자동 빌드, src/scripts/package/Dockerfile 변경 시; docs-only는 빌드 트리거하되 코드 무변경) ② 빌드 성공 후 **사용자가 KC 콘솔 → 서버 상세 → 중지 → 시작**(새 `latest` 재pull) ③ `GET /`의 `build` 확인.
- **✅ 지금 상태**: 라이브 `7fd81c2`(서울버스 포함) **배포·검증 완료**. 헬스 `build:7fd81c2`, 13툴, sources 전부 true. (이전 핸드오프의 "97bd63d 라이브 / 7fd81c2 미배포"는 해소됨.) 다음 재배포는 새 코드 푸시 후에만 필요.
- **⚠️ ODsay egress IP**: getTransitRoute(ODsay)는 등록 IP 제한. KC egress=`210.109.82.101`를 lab.odsay.com에 등록해 동작 중. 재시작으로 egress IP 바뀌면 getTransitRoute 타임아웃 → `src/server.ts`에 임시 `/egress-ip` 진단 심어 새 IP 확인→ODsay 갱신. (지금까진 재시작해도 유지.) 재배포 후 getTransitRoute 한 번 돌려 확인.
- **⚠️ getTransitRoute 콜드스타트**: 재시작 직후 첫 호출 1회 타임아웃 가능(재시도 칩이 받침).
- **⚠️ 도구함 "Tools 11" 표시 지연**: 콘솔 카드가 11로 보여도 커넥터/실서버는 13. "정보 불러오기" 새로고침하면 갱신.

---

## 3. 13개 툴 — 각각 뭘 하고 최근 뭐가 바뀌었나
1. **searchPlaceForeigner** — NL 장소추천. 서울+비식음=VisitSeoul 공식 영어 큐레이션 메인, 식음=좌표 POI(Naver/Foursquare), 빈곳/서울외=TourAPI 그라운딩. **다도시 must-see 시딩**(D-021: "things to see in Seoul/Busan/Jeju/Gyeongju" → ⭐큐레이션 명소 리드 + CJK/가나 도시명 인식 D-022/V6-2). dish→POI, 비서울 지오코딩(findPlaceInText), 이벤트 강등.
2. **findForeignerFriendlyStore** — 외국인 필수시설(환전/ATM/약국/편의점/관광안내소/해외카드식당/응급). 큐레이션 팁 + 근처 POI. 성인업소·피자집·아트스페이스 노이즈 필터. **area optional**(N13: 누락 시 "Which area?" graceful, -32602 무).
3. **getTransitRoute** — 지하철/버스 경로 + 동적추적칩 + 네이버맵 보행팁 + intercity 그라운딩. to optional.
4. **trackBusArrival** — 비서울=TAGO 전국. **🚌 서울=`seoul.ts`(D-026, 신규!)** TOPIS 실시간(7fd81c2, 배포대기). `city` 필수.
5. **trackSubwayArrival** — 서울 지하철 3모드(station/line/journey). 한글 노선명(신분당선) 허용(V5). 05:30~01:00.
6. **explainPayment** — 결제 큐레이션 ~18상황(교통/택시/ATM/KTX/세금환급/온라인/병원/찜질방…) + **상황별 브릿지칩**(P2).
7. **explainKoreanService** — 한국 본인인증/시스템 장벽 내비 **12서비스**(택시/배달/예약/온라인/**티켓팅**/카톡가입/SIM/**은행송금**/세금환급/입국/응급/키오스크): blocker→workaround→twin앱→fallback→1330. 서비스별 브릿지칩.
8. **getAreaGuide** — **35개 동네**(서울 23/부산5/제주2/강원1/전북1) + 도시개요(Busan/Seoul). interest별.
9. **translateMenuContext** — 메뉴 해독 ~63종 + 알레르겐 + **채식/비건/할랄 플래그**(MEAT_RE 이름기반, egg/dairy 비건구분) + 한국어 식이카드.
10. **getNowInfo** — "지금 열렸나" go/no-go. 큐레이션 랜드마크 ~55(CJK별칭)→VisitSeoul→TourAPI. 공휴일·날씨1줄·Lotte 후보칩·not-found 검색칩·PII에코 slice.
11. **getJejuInfo** — VisitJeju(영어). 대표명소 시딩(P8). limit union+clamp(-32602 무).
12. **getWeatherAndAir** — 기상청+에어코리아+기상특보. 미지도시→서울폴백 명시.
13. **recommendTripCourse** ⭐신툴(D-025) — **페르소나별 추천 코스**. §5 상세.

---

## 4. 이번 세션 작업 아크 (D-017 → D-026) — 시간순, 다 기억하라
docs/21(D-016까지) 넘겨받아 **폴리시 마감 → v4/v5/v6 테스트 3사이클(→GO) → 페르소나 코스 신툴+Phase2 → 서울버스 해금·구현**까지. 단계마다 push→사용자 KC재배포→라이브검증.

- **D-017 (`ad37b6b`)** v3 잔여 폴리시 마감 + 콘텐츠: explainPayment 상황칩, Hallasan 야간오라벨, 메뉴 vegan egg/dairy, P5/P6, N12(not-found 검색칩), N11(이미지 노이즈 제거); 메뉴+13·명소27→36·동네21→26·제주시딩. 라이브 27/0(프로토콜 컴플라이언스 포함=Inspector 필요분 충족).
- **D-018 (`7e1b0c8` 포함)** 콘텐츠 라운드①: explainKoreanService +콘서트/티켓팅(11서비스), 메뉴+6, 명소36→43, 동네26→29.
- **D-019 (`7e1b0c8`/`ce630d0`)** v4 테스트(docs/22, 백그라운드 에이전트, "submission-ready, fix one bug") 발견 수정: **P-V1🔴 콩국수 "broth"→"bone" 오플래그**(MEAT_RE), P-V2 이벤트 강등 + Seoul must-see 시딩, P-V3 비서울 지오코딩, P-V4 노이즈필터.
- **D-020 (`3660698`)** 완성도 라운드: 저우선 잔여(P3 temple-stay·Jamsil 면책·P4 투명안내) + explainKoreanService +은행/송금(12서비스)·explainPayment +찜질방·메뉴+6·명소43→50·동네29→32. (가입 매처 bare `account` 충돌 제거.)
- **D-021 (`9d35679`)** 콘텐츠 라운드②: 다도시 must-see 시딩(Seoul→Busan/Jeju/Gyeongju), 명소50→55, 동네32→35, 메뉴+3.
- **D-022 (`d1aadaf`)** v5 테스트(docs/23, "PASS, ship-ready", 🔴0/회귀0) 수정 5종: V1(online 자기칩 라우팅), V2(콜드 타임아웃 시드유지), V3(CJK/가나 도시), V4(도시개요 Busan/Seoul), V5(한글 노선명).
- **D-023/D-024 (`b1d927c`/`11bdba8`)** **v6 최종게이트(300시나리오, docs/24) = "GO for submission"**. 1차 partial 발견(V6-1 냉면 채식·V6-2 简济州/繁观光 CJK·V6-3 getJejuInfo limit) 수정 → 재실행 GO. 잔여 마이너(N13 area optional=12툴 전부 -32602무, N14 getNowInfo 에코 slice=PII위생, 🟢 시딩 동의어) 마무리. **인라인 ~297시나리오 GO 재확인**(백그라운드 에이전트가 호스트 프로세스 종료에 2회 죽어 인라인 배치-node로 회수).
- **실환경 MCP 테스트(중요!)**: 사용자가 PlayMCP 도구함에 서비스 담고 Claude Code 커넥터 연결 → 이 세션에 `mcp__…__koreatrip-*` 13툴 deferred. **직접 호출=카카오 실사용자 프로덕션 경로(나→도구함 프록시 playmcp.kakao.com/mcp→KC). 18콜 실측=직접 HTTP와 100% 동일.** → **가장 현실적 테스트 surface.** (메모리 `kpass-working-style`에 규칙화: 시나리오 테스트 전 허용요청.)
- **D-025 (`98a0a01`/`1f91386`)** **신툴 recommendTripCourse + Phase2**. §5 상세. BM 분석도 함께(§13).
- **D-026 (`7fd81c2`, ⏳미배포)** **🚌 서울버스 해금·구현**. §6 상세.

상세 결정 근거는 docs/06(D-017~D-026), 테스트 리포트는 docs/22(v4)/23(v5)/24(v6).

---

## 5. ⭐ recommendTripCourse (페르소나 추천 코스) — 신기능 심층
**사용자 아이디어**: "외국인은 페르소나별로 거의 무조건 하는 게 있다(20대女=피부과 시술/미용실/프로필사진관/한복; 가족=한복+경복궁/테마파크). 프로파일별 인기코스를 먼저 추천하면 좋은 발견성 UX."

- **파일**: `src/lib/sources/`가 아니라 **`src/lib/courses.ts`**(데이터+엔진, 순수·결정적·테스트락) + `src/tools/recommendTripCourse.ts`(파싱·렌더).
- **입력**(전부 z.string optional): `persona`(**조합 가능** "20s woman, foodie" → `,&+/`·and 분리), `duration`(half-day/1-day/2-day/3-day; 4+→3day 베이스), `themes`(콤마, 동의어맵), `location`(Seoul/Busan/Jeju; 그 외 대구 등=getAreaGuide steer).
- **데이터 만드는 법(사용자가 물었던 핵심)** = **빌드타임 큐레이션 + 조합엔진 + 시그니처 하이브리드**:
  1. 태깅 스팟(서울35·부산10·제주11): `{id,name,area,zone,themes,blocks,note,city}`.
  2. 7 페르소나 테마맵(beauty/family/couple/kpop/foodie/culture/GENERIC) — 조합 시 테마 인터리브.
  3. 조합엔진: 도시필터 → 테마점수 랭킹 → **존 클러스터로 동선 묶기**(이동 최소) → 시간블록(아침/점심/오후/저녁) 채움 → **슬롯별 스왑대안(↔)**. 멀티데이=존 밴드 분리(중복 없음).
  4. **시그니처 골든코스 6**(beauty/family/kpop/foodie/culture/couple, 서울 단일페르소나 1-day=손튜닝); 조합·기타기간·타도시는 엔진.
  - ⭐ **D-009 안전 핵심**: "서버가 런타임에 LLM/웹 호출 금지"지 **우리가 빌드타임에 큐레이션 만들 때 LLM 보조 쓰는 건 무관** → "엄청 풍부"가 규칙안전하게 가능. 인기패턴은 에버그린.
- **출력**: `🗺️ {기간} {도시} course — for a {조합 페르소나}` + Themes줄 + 일자/시간블록별 스톱(↔스왑) + 면책("not ads") + 칩(now/route/menu·find·service/remix).
- ⚠️ **시술/의료(dermainfo) 항목은 info-only**(특정병원 지목·예약대행 X = 의료법 유인·알선 회피).
- **라이브 검증됨**(build 1f91386): K-pop 1일=시그니처, "20s woman+foodie" 2일=조합 블렌딩, Busan/Jeju/3-day/Daegu-steer 전부 정상.
- **Phase 3 후보(앞으로 하면 좋을 것)**: ① 코스에 **"이 코스 길찾기 원클릭"**(getTransitRoute로 스톱간 경로 자동) ② 부산/제주 스팟·시그니처 더 + 경주/전주 등 도시 추가 ③ 코스 항목에 **getNowInfo 영업시간 인라인**(시간블록 검증) ④ 계절/날씨 반영(실내 대안) ⑤ 페르소나 더(비건/할랄/시니어/혼행/예산) ⑥ 다국어 코스(ja/zh).

---

## 6. 🚌 서울버스 (seoul.ts, D-026) — 심층 + 다음 할 일
- **몇 주간 블로커였던 ws.bus.go.kr error30(키 전파지연)이 2026-06-29 해금**(headerCd=0). 같은 `BUS_API_KEY`(=TOUR_API_KEY, data.go.kr 64hex)로 동작.
- **구현(`7fd81c2`)**: `src/lib/sources/seoul.ts` — TOPIS 체인 **getBusRouteList(번호→busRouteId) → getStaionByRoute(routeId→정류소순서, `station`필드=stId) → getLowArrInfoByStId(stId→`arrmsg1` "15분11초후[8번째 전]" 파싱→stops/eta)**. route/stops **1h 캐시**(정적). trackBusArrival 서울분기 채움(route_not_found/stop_not_found/no_arrival+가용노선/ok). 응답=XML(itemList 래퍼, CDATA strip).
- **⚠️ 빈-itemList throttle**: ws.bus.go.kr는 **IP별 레이트리밋** — 반복호출 시 headerCd=0이지만 itemList가 빈값으로 옴. `fetchRecords`가 **빈/에러 시 3회 재시도**(빈 바디는 빠르게 와 지연 적음, route/stops 캐시 후엔 콜드만).
- **✅ 배포·검증 완료(2026-06-29 새 세션)**: 라이브 `build:7fd81c2`에서 **KC경로(연결된 MCP `koreatrip-trackBusArrival`)로 서울버스 검증** — `{city:"Seoul", busNumber:"143", dropOffStop:"신사역"}` → **"🛑 Arriving now — get ready to get off!" 실시간 동작**. 예측대로 **로컬 IP throttle과 달리 KC egress IP는 정상**. 키 미재잠금(getStationByName 강남 headerCd 0). docs/03·07·CLAUDE "배포대기"→"검증완료" 갱신함.
- **앞으로 개선/통합**: ① **getTransitRoute ↔ trackBusArrival 통합**(경로에서 버스 선택 시 바로 추적 — 여정 UX 완성) ② getArrInfoByRoute(per-route, 더 정확한 arrprevStnCnt/traTime1)로 교체 검토 ③ getBusPosByRtid(sectOrd)로 노선 전체 버스 위치 모드 추가(지하철 line 모드처럼) ④ 정류소명 영문/로마자화(arsId 5자리로 안내) ⑤ **키 재잠금 위험** — 매 세션 재탐침(`curl ".../getStationByName?ServiceKey=$BUS&stSrch=%EA%B0%95%EB%82%A8"` headerCd 0 확인).

---

## 7. 데이터 소스 & 키 (전부 `.env`=gitignore + GitHub Secrets)
`secrets-registry`(메모리, 로컬전용·값포함) 참조. 매핑:
- **`BUS_API_KEY`=`TOUR_API_KEY`**(data.go.kr 64hex): TAGO 비서울버스·**서울버스(ws.bus.go.kr, 해금됨)**·TourAPI 다국어·기상청·에어코리아·기상특보 공용.
- **`TRANSIT_API_KEY`**(ODsay): getTransitRoute. 등록IP 제한(KC egress 210.109.82.101).
- **`SUBWAY_API_KEY`**(서울 지하철 실시간), **`JEJU_API_KEY`**(VisitJeju), **`NAVER_CLIENT_ID/SECRET`**+**`FOURSQUARE_API_KEY`**(POI), **`VISITSEOUL_API_KEY`**.
- 미발급: `KAKAO_REST_API_KEY`(승인대기, 툴명 kakao 금지). `SEOUL_API_KEY`(D-011 보류).
- 🔴 **노출키 재발급 = 사용자가 "안 함" 결정(스킵)** → 재촉 금지(메모리 기록됨).

---

## 8. 작업 규칙 (어기지 말 것) + 🆕 워크플로우 규칙
- **R-DOC**: 코드/스펙/결정 바뀌면 **같은 변경에서** docs 갱신 — docs/06(결정)·07(SSOT)·03(계약). 문서 갱신 없는 기능변경 금지.
- **kakao 네이밍 금지**(서버·툴명, `src/lib/naming.ts` 빌드게이트). 카카오 Local은 데이터소스로만.
- **키 커밋 금지**(.env+GitHub Secrets만).
- **D-009 그라운딩**: 서버에서 **런타임 외부 LLM/웹검색 호출 금지**. 큐레이션/참조데이터/로마자만. (단 **빌드타임 큐레이션 제작에 LLM 쓰는 건 OK** — recommendTripCourse가 그 예.)
- **git**: 커밋 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Windows** → `git -c core.autocrlf=false commit -F -`(heredoc). **push to main = deploy-image 빌드 트리거**. gh CLI=bb4rjfl.
- **enum 지양**: 입력 z.string()+핸들러 정규화(off-value raw -32602 누출 방지). getJejuInfo limit도 union+clamp으로 전환(V6-3). **이제 12+1툴 전부 -32602 무누출**(N13 area optional 후).
- 툴 수 **13**(권장10 초과·하드20 이내, D-006 정신). 빌드 게이트 ≤20.
- **🆕 시나리오 테스트 워크플로우 규칙(사용자, 2026-06-28~29)**:
  - ⚠️ **백그라운드 Agent(run_in_background)는 호스트 Claude Code 프로세스 종료 시 같이 죽는다**(v6에서 2회 유실). 장시간 분기 불안정.
  - ✅ **가장 안정적·현실적 = 연결된 MCP 도구 직접 호출**(도구함+커넥터 연결 시 `koreatrip-*` 13툴 deferred → ToolSearch "koreatrip" 로드 → 직접 호출 = KC 프로덕션 경로, 프로세스 종료에 안 죽음). 검증됨.
  - 대안: **별도 세션(send_message)**으로 테스트 지시(프로세스 독립) — 단 자동모드에선 send_message 막힘, 사용자가 권한요청 모드 전환 필요. **인라인 배치-node**가 최후 폴백(다 막혔을 때).
  - 🔴 **시나리오 테스트 시작 전 사용자에게 허용요청 한 번**(사용자 규칙). 배포확인 probe(소수콜)는 일반 점검으로 진행 가능.
- **작업 스타일**(메모리 `kpass-working-style`): ❌심사요청 먼저 누르라 하지 말 것 · 🖱️콘솔 안내는 버튼 위치까지 · 📏측정 후 구현(API 먼저 호출해 데이터/형태 확인 — seoul.ts도 실측 후 구현) · 🌿단순/검증/대규모는 분기위임 · ✅git push/저위험 배포 상시허가.

---

## 9. LAUNCH-CRITICAL 현황
| # | 항목 | 상태 |
|---|---|---|
| 1 | KC 재배포 신선도 | ✅ build-SHA. **라이브 `7fd81c2` 배포·검증 완료(서울버스 포함)** |
| 2 | MCP Inspector 정식통과 | ✅ **프로토콜 컴플라이언스 라이브 충족**(initialize·tools/list·tools/call·에러형식·SSE를 실경로로 반복 검증). 별도 GUI 불필요 |
| 3 | 노출키 재발급 | ⏭️ 사용자 "안 함" 결정(스킵) |
| 4 | PlayMCP 심사요청 | 🛑 **보류**(사용자 신호 대기 — 재촉 금지) |
| 5 | 비즈정보 재제출 | ⏳ 사용자 액션: 서비스화면 png 사업자번호 placeholder → **487-01-04137**(상호 케이커브, 대표 강상호; `business-info` 메모리). 비즈폼 게이트 |

---

## 10. 남은 일 / 다음 단계 (우선순위)
1. **🔴 7fd81c2(서울버스) KC 재배포 + KC경로 검증**(§6). 서울버스 키 재잠금 위험에 빠르게.
2. **서울버스 후속**(§6): getTransitRoute↔trackBusArrival 통합, 위치모드, getArrInfoByRoute 정밀화.
3. **recommendTripCourse Phase 3**(§5): 코스 원클릭 길찾기, 스팟/시그니처/도시 확대, 영업시간 인라인, 다국어.
4. **(사용자 결정 시) 심사요청** → 전체공개 → 비즈폼. **비즈정보 png 사업자번호 교체**(도와줄 수 있음).
5. 저우선 잔여: P3(temple-stay 라우팅 미세)·P4(특정업소명)·Jamsil 면책 미세 / 카카오Local 승인 대기.
6. **2번째 제출 슬롯**(미결정): 내국인용 '장보기 가격 디코더' 별도 MCP(KC 2서버·최대2제출).

---

## 11. 같이 발전시킨 아이디어 (제품 비전 — 계속 밀어라)
- **여정 UX(핵심 차별점)**: 추천→"어떻게 가?"→버스+지하철 동시제시·선택→어디서타고·언제와·지금어디→탔으면 지금어디·언제내려. getTransitRoute(동적칩)+trackBus(하차카운트, **서울 포함됨!**)+trackSubway journey+intercity. **서울버스 해금으로 이제 서울 안에서도 버스 추적 완결** → getTransitRoute↔trackBusArrival 통합이 다음 큰 그림.
- **페르소나 추천 코스(신규 차별점)**: 첫 진입 발견성("뭐하지?")을 풀고 데모 헤드라인. 조합×기간×도시×테마로 풍부. §5.
- **3대 킬러 차별점**(docs/18): A.해외카드 예측 B.본인인증 장벽 내비(explainKoreanService=헤드라인) C.공휴일 인식 open-now.
- **큐레이션 우위**: 외국인 필수시설·명소 영업시간·도시간 딥링크·twin앱·세금환급·페르소나 코스처럼 "LLM 웹검색이 신뢰성있게 못 주는" 구조화가 차별점이자 규칙안전.

---

## 12. 자잘하지만 중요한 함정/사실
- **build-SHA 신선도** — 재배포마다 `GET /` build 확인(§2). docs-only 커밋은 코드 무변경(배포해도 build 동일).
- **서울버스 IP throttle**(§6) — 로컬 반복호출 시 빈 itemList(hdr 0). KC IP는 별개. fetchRecords 3회 재시도.
- **tsx 콜드스타트** — `npx tsx -e`/scratch 실행이 2분 타임아웃 행날 수 있음(이번에 겪음). 로컬 핸들러 출력 확인은 vitest 또는 배포 후 MCP로.
- **백그라운드 Agent 사망**(§8) — 호스트 프로세스 종료에 죽음. 큰 테스트는 MCP직접/별도세션/인라인.
- **CJK 글자 구분**: 観光(ja)/觀光(繁)/观光(简) **전부 별개 글자** — 시딩 정규식에 셋 다 필요(V6-2). 济州(简)/濟州(繁)/済州(ja)도 별개.
- **MEAT_RE 교훈**: "broth"는 너무 광범위(콩국수=soy-milk broth 오탐) → "bone"으로(설렁탕=ox-bone 유지). 채식 플래그는 안전방향(과소경고 금지) — 냉면=소고기육수 명시(V6-1).
- **한글 인자 mojibake** → JSON Write로 UTF-8 파일저장 후 curl, 파싱은 node(python은 Store 스텁). curl 한글 URL인코딩(강남=`%EA%B0%95%EB%82%A8`).
- **`/mcp`=Streamable HTTP SSE** → 헤더 `Accept: application/json, text/event-stream`, 마지막 `data:` 파싱. 헬스는 `/`. **node에서 변수명 `URL` 금지**(전역 가림).
- **KST 타이밍**: `koreaNow()`(Intl). 지하철 05:30~01:00. 공휴일 `holidays.ts`.
- **테스트**: vitest, `vi.stubGlobal("fetch")` 목, 오프라인(.env 미로드 → API툴은 notConnected, 순수툴은 동작). `npm run build`=naming lint+tsc, `npm test`=vitest run. 현재 **247 tests, 9 파일**.
- **getStaionByRoute의 `station` 필드 = stId**(getLowArrInfoByStId가 받는 id와 동일, 실측확인).

---

## 13. BM/수익화 컴플라이언스 결론 (사용자 질문 — docs/07 "수익화/BM 로드맵"에도 기록)
- **MCP 응답 내 직접 광고·예약커미션·구매유도 = PlayMCP 규칙 위반(반려)**: docs/01 §3-5 광고노출유도 금지 · §4 상업링크·구매유도·리워드 과다 반려·유료결제 필수 반려·개인정보 6종(여권/카드) 금지.
- **아웃링크는 OK(과하지 않게)** — 공식 예약페이지/후기/상담채널 담백한 연결.
- **의료(피부과/성형)는 의료법** — 환자 유인·알선(커미션 소개) 금지(법 위반). 커미션 ❌, 공식 상담채널 정보 안내는 회색~안전. 법률검토 필요.
- **결론**: 공모전 MCP는 순수 큐레이션 유지(대상에 유리). **BM은 별도 트랙**(별도 상업 앱/웹 또는 포스트-콘테스트), MCP는 funnel/쇼케이스. recommendTripCourse도 이 원칙(시술 info-only).

---

## 14. 메모리 파일 (`C:\Users\user\.claude\projects\C--Users-user-Claude-Projects-kakaomcp1-kpass\memory\`)
`MEMORY.md`(인덱스) · `business-info.md`(kpass 사업자 487-01-04137, 로컬전용) · `secrets-registry.md`(키 대장, 로컬전용·값포함) · `secrets-management-policy.md` · `delegate-to-spawned-sessions.md` · `kpass-working-style.md`(심사재촉금지·콘솔구체·측정후구현·분기위임·저위험상시허가 + **노출키 재발급 스킵** + **시나리오 테스트=별도세션/MCP직접+허용요청, 백그라운드 에이전트 사망**). ⚠️ 메모리 값은 공개 repo·MEMORY.md 인덱스에 옮기지 말 것.

---

## 15. 문서 맵
`docs/00`(오버뷰) `01`(카카오규칙) `02`(제품스펙) `03`(툴계약, D-026까지) `04`(UX칩) `05`(작업협약) `06`(결정 D-001~D-026) `07`(진행 SSOT + 수익화/BM 로드맵) `08`(키발급) `09`(대화예시3) `10~16`(이전 핸드오프) `17`(v1 R/Y) `18`(페인포인트 리서치) `19`(v2 N) `20`(v3 F) `21`(이전 핸드오프=D-016까지) `22`(v4 P-V) `23`(v5 V) `24`(v6 최종게이트 GO) **`25`(이 문서=최신 진입점)**. 코드: `src/server.ts`·`src/tools/*`·`src/lib/*`·`src/lib/sources/*`·**`src/lib/courses.ts`**.

---

## 16. 새 대화창 직후 할 일 (요약)
1. 이 문서 + `docs/07`(SSOT) + `docs/06`(D-026까지) 읽기.
2. ✅ **서울버스 배포·검증 완료**(2026-06-29 새 세션, §6). 재배포는 새 코드 푸시 후에만.
3. **서울버스 키 재탐침**(매 세션, 재잠금 위험) — `getStationByName?stSrch=강남` headerCd 0 확인.
4. 새 코드 배포 시 getTransitRoute egress IP 스팟체크(§2).
5. **본 작업**(택1, 사용자와 합의): ① 서울버스 후속/통합(getTransitRoute↔trackBusArrival, §6) ② recommendTripCourse Phase 3(§5) ③ 저우선 잔여 폴리시. (사용자 결정 시)심사·비즈폼.
6. **R-DOC 준수**, **심사요청 재촉 금지**, **시나리오 테스트 전 허용요청**, 측정 후 구현.
