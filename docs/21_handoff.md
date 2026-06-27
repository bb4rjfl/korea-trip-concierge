# 21. 핸드오프 — 2026-06-27 (새 세션 진입점, 아주 풍부한 맥락판)

> **새 세션은 이 문서를 가장 먼저, 끝까지 읽어라.** 그다음 `CLAUDE.md` → `docs/07_progress.md`(SSOT) → `docs/06_decision_log.md`(D-001~D-016) → `docs/03_tool_contracts.md`. 이 문서는 **요약이 아니라 맥락 전수**가 목적이라 길다. 직전 핸드오프 docs/16은 D-014까지의 스냅샷이고, **이 문서가 그 이후(VisitSeoul·UI/UX 3사이클·신툴·페인포인트 리서치)를 전부 담은 최신본**이다.

---

## 0. 한 줄 상태
**Korea Trip Concierge** — 방한 외국인용 **12-tool MCP 서버**(TS+Node22, Streamable HTTP, stateless). 카카오 Agentic Player 10 출품작, 목표=대상. **KC에 배포·Active, 최신 빌드 `2429b18` 라이브 검증 완료(12툴, 전 소스 true).** UI/UX 3사이클(v1/v2/v3) 엄격 테스트 통과, 발견된 버그 전부 수정·배포. **~190 tests green.** 심사요청은 합의대로 보류(서울버스 전파·전체검증 전).

---

## 1. 무엇을 만들고 있나 (제품 정체성)
방한 외국인이 한국에서 막히는 지점(교통·결제·**본인인증/시스템 장벽**·장소탐색·메뉴·날씨)을 **영어로 구조화**해 풀어주는 MCP 서버. 차별점은 **"외국인이 못 푸는 한국 특수맥락"**을 실데이터 + 큐레이션으로 제공하고, **사용자가 길게 안 써도 칩(버튼)을 눌러 여정을 이어가게** 설계한 것. 본선 데모/투표의 핵심은 **"칩으로 끊김없이 이어가는 여정"**.

**12 tools**: searchPlaceForeigner, findForeignerFriendlyStore, getTransitRoute, trackBusArrival, trackSubwayArrival, explainPayment, **explainKoreanService**(12번째, D-016), getAreaGuide, translateMenuContext, getNowInfo, getJejuInfo, getWeatherAndAir.

---

## 2. 배포 상태 + ⭐ 새로 생긴 "빌드 신선도 신호" (반드시 숙지)
- KC(PlayMCP in KC)에 **컨테이너 이미지(ghcr 비공개)로 Active**. ID 638, namespace `kbm-u-4961514721`.
- Endpoint: `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp` · 헬스: 끝의 `/`.
- **🆕 헬스 응답에 `build` 필드 추가** = 배포된 커밋 SHA 앞 7자(`src/server.ts`의 `build: ENV.GIT_SHA.slice(0,7)`). **GIT_SHA는 빌드 시 주입**(deploy-image.yml가 `--build-arg GIT_SHA=$(git rev-parse HEAD)` → Dockerfile ARG/ENV). **이게 v3 테스트의 "재배포가 안 먹었다" 블로커 때문에 추가됨.** 이제 재배포 후 `GET /`의 `build`를 `git rev-parse --short HEAD`와 비교하면 **신선도를 1초에 확인** 가능. (예전엔 version 0.1.0·tools 수가 안 바뀌어 신선도 확인이 불가능했음.)
- **재배포 흐름**: ① 로컬 수정→커밋→`git push origin main`(= Actions `deploy-image` 자동 빌드, src/scripts/package/Dockerfile 변경 시) ② 빌드 성공 후 **사용자가 KC 콘솔 → 서버 상세 → 중지 → 시작**(새 `latest` 재pull) ③ **`GET /`의 `build`가 새 SHA인지 확인** → 다르면 KC가 캐시 이미지 재사용한 것이니 재시도/재등록.
- **⚠️ 교훈(v3)**: 단순 중지→시작이 **캐시 이미지를 재사용**해 stale일 수 있다. `build` SHA로 반드시 검증. 이번엔 2429b18로 정상 전파 확인됨.
- **⚠️ ODsay egress IP 주의**: getTransitRoute(ODsay)는 등록 IP 제한. KC egress=`210.109.82.101`를 lab.odsay.com Server IP에 등록해 동작 중. **KC 재시작으로 egress IP가 바뀌면 getTransitRoute 타임아웃** → `src/server.ts`에 임시 `/egress-ip` 진단(api.ipify.org) 다시 심고→push→재배포→`curl .../egress-ip`로 새 IP 확인→ODsay에 추가→진단 제거. (지금까진 재시작해도 IP 유지됨.)
- **⚠️ getTransitRoute 콜드스타트**: 재시작 **직후 첫 호출**은 ODsay 3외부콜 체인+빈 캐시로 2.5s 타임아웃 떠서 "Couldn't reach routing service"가 한 번 나옴 → 두 번째부터 정상. 버그 아님(재시도 칩이 받침). 데모 첫 액션이 길찾기면 알아둘 것.

---

## 3. 12개 툴 — 각각 뭘 하고 최근 뭐가 바뀌었나
1. **searchPlaceForeigner** — NL 의도 장소추천. **서울+비식음 = VisitSeoul 공식 영어 큐레이션 메인(D-015)**, 식음(cat=food)=좌표 POI(Naver/Foursquare), 빈 곳/서울 외=TourAPI 그라운딩. 다국어 en/ja/zh/ko. dish 사전(라우팅), 오타동네 퍼지, stale 이벤트 필터, museum/palace 랭킹.
2. **findForeignerFriendlyStore** — 외국인 필수시설(환전/ATM/약국/편의점/관광안내소/해외카드식당/**응급**). 큐레이션 팁(1330·DCC·4자리PIN) + 근처 POI. **성인업소 블록리스트**(N2). 응급 need=119/1339/1330+심야약국.
3. **getTransitRoute** — 지하철/버스 경로(요금·환승·시간) + **동적 추적칩**(보드/환승역) + **네이버맵 보행 팁** + 도시간 그라운딩(intercity) + 야간버스(N) 표시 + 동일출발=도착 가드.
4. **trackBusArrival** — TAGO 전국 버스도착(서울 제외, 서울은 폴백). `city` 필수.
5. **trackSubwayArrival** — 서울 지하철 3모드(station/line/**journey**). **2호선 순환 단거리 보정+정직한 방향안내(R8)**. 역도착 방향 캡(Y17). 운행 05:30~01:00.
6. **explainPayment** — 결제 큐레이션(상황별 카드·T-money 심화·KTX·세금환급·ATM·온라인·택시안티스캠·**병원/응급결제 F1**·팁·더치·모바일페이).
7. **explainKoreanService** ⭐신툴(D-016) — **한국 본인인증/시스템 장벽 내비.** 10서비스(택시앱/배달/예약/온라인/카톡가입/SIM/세금환급/입국서류/응급/키오스크): blocker→workaround→**twin앱**→fallback→**1330 상시**. **서비스별 브릿지 칩**(N4). entryDocs **연도가드**(2027-01-01 후 K-ETA 재필요 자동전환)+공식링크.
8. **getAreaGuide** — 21개 동네 큐레이션(서울+부산+제주), 관심사별. 음식 인터레스트→eat-here 칩(Y10).
9. **translateMenuContext** — 메뉴 해독+알레르겐+**채식/할랄 플래그**(이름기반 육류감지 N6) + **한국어 식이/주문 카드**.
10. **getNowInfo** — "지금 열렸나" go/no-go. 순서: **큐레이션 랜드마크27**(CJK 별칭 R6)→**VisitSeoul 서울 상세**(영업시간/지하철/판정 R2)→TourAPI. 동네명 리다이렉트(R1), **공휴일 인식**(holidays.ts), 브랜드 후보칩(Lotte F2), 날씨1줄.
11. **getJejuInfo** — VisitJeju(영어). stale 축제 필터+아이코닉 정렬.
12. **getWeatherAndAir** — 기상청+에어코리아+기상특보. 미지 도시→서울 폴백 명시(Y8).

---

## 4. 이번(들) 세션의 방대한 작업 아크 — 다 기억하라
직전 핸드오프(docs/16, D-014까지)에서 넘겨받아, **VisitSeoul 통합 → UI/UX 3사이클 테스트·수정 → 페인포인트 리서치 → 신툴+강화 → 배포검증**까지 진행. 시간순:

### 4-1. VisitSeoul 통합 (D-015, commit d5d0005)
- 사용자 지시: "비짓서울 api 승인 났다, 서울 콘텐츠를 풍부하게." 키 발급(`0ad0…526c45`).
- 라이브 전수 파악: base `https://api-call.visitseoul.net/api/v1`, 헤더 `VISITSEOUL-API-KEY`, **7개언어**(en/ja/zh-CN/zh-TW/ru/ms/ko), 8대분류 61카테고리, contents/list·info(POST), 영업시간/전화/도로명/**영문지하철**/좌표/HTML본문. **공식 영어 콘텐츠 = 번역불필요(D-009 안전), TourAPI 영문 빈약 약점 보완.** 레이트리밋 있음→캐싱·graceful.
- 새 소스 `src/lib/sources/visitseoul.ts`. **searchPlaceForeigner 서울 메인소스**(위 §3-1) + **getNowInfo 서울 폴백**. 라이브 e2e 검증.

### 4-2. UI/UX 테스트 v1 (docs/17) → R1~R8 + Y1~Y22 수정 (commits 741a277, 346b864)
- **240 시나리오**(단발+멀티턴, 12~15 페르소나, 분기 테스트세션). R1~R8 must-fix + Y1~Y22 should-fix **거의 전부 수정**. 핵심: R1 동네명→엉뚱업소(matchAreaName), R2 VisitSeoul 영업시간 판정(seoulHoursVerdict), R3 dish/CJK 라우팅, R4 막다른칩, R5 getTransitRoute `to` optional, R6 CJK 명소별칭(+fuzzy 1글자 가드 근본수정), R7 enum→z.string, R8 2호선 순환. Y시리즈: stale이벤트·식이qualifier·로마자띄어쓰기·오타동네·응급·공휴일 등.

### 4-3. 페인포인트 리서치 (docs/18) → 신툴 + 강화 (D-016, commit 2084ef3)
- 사용자 지시: "외국인이 온라인/SNS에 남긴 불편 다 찾아서 해소방안." **4개 리서치 서브에이전트**(Reddit·블로그·포럼·한국시스템장벽) 병렬 → **독립 수렴한 1위 페인 = 한국 본인인증/전화번호 장벽**(예약·배달·택시·결제 줄줄이 막힘).
- **3대 킬러 차별점**(4 에이전트 합의): A.해외카드 어디서 될지 예측, B.본인인증 장벽 내비, C.공휴일 인식 open-now.
- **타당성 검토 에이전트 → GO** + 빌드레디 스펙("**twin 패턴**: 카카오T→k.ride, 배민→Shuttle, 캐치테이블→CatchTable Global, 쿠팡→Global, 티켓→Klook").
- → **신툴 explainKoreanService**(B 정면) + explainPayment 대확장 + getNowInfo 공휴일(`holidays.ts`, 설/추석 정확날짜) + 메뉴 채식·findStore 응급·교통 네이버팁.

### 4-4. UI/UX 테스트 v2 (docs/19) → N1~N10 수정 (commit d7c3343)
- 신툴/강화 대상 재테스트. **v1 수정 전부 회귀 유지(0 regress).** 신규: N1 KakaoTalk→택시 오매칭(`kakao ?t\b`), N2 ATM 성인업소, N3 language enum -32602, N4 정적칩→브릿지칩, N5 라우팅갭, N6 채식 소/닭 누락, N7 빈대떡, N9 beach, N10 응급칩.

### 4-5. UI/UX 테스트 v3 (docs/20) + 배포신선도 + F1/F2 (commit 2429b18, 현 HEAD)
- **~210 단발 + 12 긴여정**, 4 버킷(짧은/긴/엉뚱/전수커버리지). **v1·v2 수정 전부 라이브 유지.** 안전 40/40 클린.
- **🔴 발견: "재배포가 안 먹었다"** — d7c3343 푸시·빌드됐으나 KC가 캐시 이미지 재사용해 stale. → **build-SHA 신선도 신호 추가**(§2)로 해결.
- 신규 🟡: **F1** explainPayment "hospital ER admission"→관광"Admission"(궁 입장료) 오매칭 → 병원/응급 결제 분기 추가(admission 앞). **F2** getNowInfo{Lotte}→엉뚱한 부산 백화점 → 후보칩 되묻기.
- 2429b18 커밋·푸시 → 사용자 재배포 → `build:2429b18` 확인 → **라이브 probe 6/6 PASS.**

---

## 5. 데이터 소스 & 키 (전부 `.env`=gitignore + GitHub Secrets)
`secrets-registry`(메모리, 로컬전용·값포함) 참조. 매핑:
- **`BUS_API_KEY` = `TOUR_API_KEY`**(data.go.kr 64hex): TAGO 비서울버스·TourAPI 다국어·기상청·에어코리아·기상특보 공용. **서울버스 4서비스도 이 키로 승인됐으나 ws.bus.go.kr 게이트웨이 전파 미완(§7).**
- **`TRANSIT_API_KEY`**(ODsay): getTransitRoute. 등록IP 제한(KC egress 210.109.82.101).
- **`SUBWAY_API_KEY`**(서울 지하철 실시간), **`SEOUL_API_KEY`**(서울 일반, D-011 보류), **`JEJU_API_KEY`**(VisitJeju HTTPS), **`NAVER_CLIENT_ID/SECRET`**+**`FOURSQUARE_API_KEY`**(POI), **`VISITSEOUL_API_KEY`**(`0ad0…526c45`).
- 미발급: `KAKAO_REST_API_KEY`(승인대기, 툴명 kakao 금지).
- 🔴 **노출키(재발급 필요, 전체공개/심사 전)**: NAVER_SECRET·FOURSQUARE·SEOUL·ODsay(TRANSIT)·PAT(`ghp_…`)·**VISITSEOUL**(채팅 노출) — 재발급 후 `.env`+GitHub Secrets 갱신.

---

## 6. 작업 규칙 (어기지 말 것)
- **R-DOC**: 코드/스펙/결정 바뀌면 **같은 변경에서** docs 갱신 — `docs/06_decision_log`(D-001~D-016), `docs/07_progress`(SSOT), `docs/03_tool_contracts`. 문서 갱신 없는 기능변경 금지.
- **kakao 네이밍 금지**(서버·툴명, 대소문자 불문 — `src/lib/naming.ts` 빌드게이트). 카카오 Local은 데이터소스로만.
- **키 커밋 금지**(안전분류기 차단됨, 옳음). 키는 `.env`+GitHub Secrets만.
- **D-009 그라운딩**: 서버에서 **외부 LLM/웹검색 호출 금지**(레이턴시·p99·"웹검색 redundancy" risk). 큐레이션/참조데이터/로마자만. (그래서 국문설명 "번역" 불가→로마자+영문카테고리, 신툴도 큐레이션+날짜표기+연도가드로.)
- **git**: 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Windows** → `git -c core.autocrlf=false commit`. 메시지는 heredoc(`git commit -F -`). **push to main = deploy-image 빌드 트리거.** gh CLI 인증=bb4rjfl.
- **툴 계약**: 영문 description ≤1024 + 서비스명 포함, annotations 5종, Markdown ≤24k, 칩 2~4개(`buildChoiceFooter`, 범위밖 throw). 평균100ms/p99 3s(외부 타임아웃 2.5s). 개인정보 6종 금지. 광고/리워드 금지.
- **enum 금지 경향**: 입력은 가급적 `z.string()`+핸들러 정규화(enum은 off-value에 raw -32602 누출 → R7/N3에서 반복적으로 당함). language/interest/category/need/service 전부 z.string로 전환됨.
- 툴 수 **12**(권장10 초과·하드20 이내, D-006 정신 계승·D-016).

### 6-1. 작업 방식 (확립됨 — 메모리 + 효과 검증됨)
- **분기-위임**(`delegate-to-spawned-sessions` 메모리): 단순/검증/독립/대규모 작업은 메인에서 직접 말고 **별도 세션/서브에이전트**로 → 자기완결적 프롬프트 → 끝나면 **`mcp__ccd_session_mgmt__send_message`로 부모 세션 보고**. **UI/UX 테스트 3사이클·리서치·타당성검토 전부 이 방식으로 처리, 매우 잘 작동.** 테스트 세션 id=`local_535df7aa-…`(재사용 가능, send_message로 새 라운드 지시). spawn_task(칩)도 가능. **리포트는 docs/NN 파일 + send_message 양쪽으로** 받게 지시(파일=보장채널).
- **키 관리**(`secrets-management-policy`): 키 주면 막지 말고 받아서 `secrets-registry`(로컬전용) 적재. 위험은 한 번 고지(재발급 권장) 후 사용자 결정대로.
- **작업 스타일**(`kpass-working-style` 메모리, 사용자가 반복 강조): ❌**심사요청 먼저 누르라 하지 말 것**(검증 끝까지 보류) · 🖱️**콘솔 안내는 버튼 위치까지 구체적으로** · 📏**측정 후 구현**(API 먼저 호출해 데이터양 확인) · ✅**git push/저위험 배포 상시허가**(매번 안 물어도 됨).

---

## 7. 🔴 LAUNCH-CRITICAL (심사요청 전 반드시) + 현황
1. **KC 재배포 신선도 검증** — ✅ build-SHA 신호 도입. 재배포마다 `GET /` build 확인.
2. **MCP Inspector 정식 통과**(배포 URL 대상 — 여태 curl/핸들러/시나리오만). **미완 — 다음 우선.** /check WARN.
3. **노출 키·PAT·VISITSEOUL 재발급** → .env+GitHub Secrets 갱신. **미완.**
4. **PlayMCP 심사 흐름**(docs/14 §3): 임시등록 완료(Online, 로고, 대화예시3) → **단 심사요청은 보류**(서울버스 전파 + 전체검증 전엔 임시등록까지). 승인→전체공개→상세URL.
5. **비즈정보 심사 재제출**(비즈폼 게이트): 서비스화면 png의 사업자번호 placeholder → 실번호 **487-01-04137**(상호 케이커브, 대표 강상호; `business-info` 메모리)로 교체 후 재제출.

---

## 8. 남은 수정 (저우선, 다음 기회) — v3 docs/20 잔여
- **N8**: getNowInfo **큐레이션 랜드마크 경로의 날씨 1줄** — 이번 배치에 안 들어감(코드엔 weatherLine 호출 있으나 KMA 쿼터 transient일 수도). **구현 여부 결정 필요.**
- **N11**: VisitSeoul **이미지 마크다운**(`![photo](긴url)`) + 로마자 띄어쓰기 잔여 노이즈 — 클라이언트가 이미지 렌더하는지에 따라 판단(텍스트surface면 드롭 고려).
- **N12**: 불가능한 장소 → "try again" 무한루프 (search 칩 제공으로 완화 가능).
- **폴리시(G)**: Hallasan "residential spot" 문구 / Jamsil 테마파크 면책 / explainPayment 칩 상황인식화(N4처럼) / 메뉴 vegan-egg 뉘앙스 / 제주 attraction 관련성.
- **docs/20 커밋** 필요(테스트 산출물, 현재 untracked).

---

## 9. 블로커 / 대기 중
- **🚌 서울버스(가장 끈질긴 블로커, 매 세션 재탐침)**: data.go.kr 서울버스 4서비스(15000314/303/332/193) BUS_API_KEY로 승인됐으나 게이트웨이 `ws.bus.go.kr` **에러30(SERVICE KEY IS NOT REGISTERED)** 지속(2026-06-27 현재도). 전수진단 완료(키유효·엔드포인트·파라미터 모두 정상=순수 게이트웨이 전파지연, 비정상적으로 김). **할 일: 매 세션 `curl "http://ws.bus.go.kr/api/rest/stationinfo/getStationByName?ServiceKey=$BUS&stSrch=%EA%B0%95%EB%82%A8"` → headerCd 0이면 풀림** → 풀리면 `src/lib/sources/seoul.ts` 구현(스펙완비: getBusRouteList→busRouteId, getStaionByRoute→정류소순서, getBusPosByRouteSt→위치, getLowArrInfoByStId→`arrmsg1`) + trackBusArrival 서울분기. 며칠 더면 data.go.kr 1566-0025/데브톡 문의. **출품 안 막음**(TAGO 비서울 정상, 서울입력=경로폴백, intercity).
- **🆕 카카오 Local** 승인 대기 → POI 레이어(툴명 kakao 금지). VisitSeoul로 상당부분 대체됨.
- **노출키 재발급**(§5/§7).

---

## 10. 같이 발전시킨 아이디어 (제품 비전 — 계속 밀어라)
- **여정 UX(핵심 차별점)**: 목적지 추천 → "어떻게 가?" → 버스+지하철 동시제시·선택 → 어디서타고·언제와·지금어디 → 탔으면 지금어디·언제내려. **칩으로 끊김없이.** getTransitRoute(동적칩)+trackBus(하차카운트)+trackSubway journey+intercity로 실현. **신툴 explainKoreanService도 브릿지칩(N4)으로 "막혔다→해결→다음행동"이 칩으로 이어짐**(v3에서 12툴이 칩-드리븐 end-to-end 확인, 10/10 랜딩).
- **3대 킬러 차별점**(docs/18): A.해외카드 예측, B.본인인증 장벽 내비(=explainKoreanService, 데모 헤드라인), C.공휴일 인식 open-now. **B가 "이건 진짜 한국여행 생존도구"를 보여주는 본선 헤드라인.**
- **큐레이션 우위**: 외국인 필수시설·명소 영업시간·도시간 딥링크·**twin앱 패턴**·세금환급·입국서류처럼 "LLM 웹검색이 신뢰성있게 못 주는" 큐레이션이 차별점이자 규칙안전.
- **did-you-mean 확인절차**: 오타·애매입력 시 후보칩(fuzzy 일반화). 더 많은 툴 확장 가능.

---

## 11. 앞으로 하면 좋을 것 (would-be-nice)
- **explainKoreanService 유지보수**: evergreen(응급·키오스크·blocker설명) / quarterly(twin앱 생존·커버리지) / yearly(세금환급 수치·**entryDocs**—2027-01-01 연도가드 작동확인). 날짜표기 항목 갱신.
- **공휴일 캘린더**: `holidays.ts` 2028+ 갱신(음력 날짜). date.nager.at/api/v3/PublicHolidays/YYYY/KR로 정확날짜.
- **콘텐츠 커버리지 확대**: getAreaGuide 더(현재21), 명소 더(현재27, CJK별칭 확대), 메뉴 더(특히 서울외), 결제/시스템장벽 서비스 더.
- **보너스 역량**: 관광코스별 날씨(기상청27 csv) / 기상특보 도시별필터 / 지하철 realtimePosition 풍부히 / 다국어 UI 라벨.
- **2번째 제출 슬롯**(미결정, 별도세션): 내국인용 '장보기 가격 디코더' 별도 MCP(순수 컨셉). KC 2서버·최대2제출.
- **N8/N11/N12/폴리시**(§8) 마무리.

---

## 12. 자잘하지만 중요한 사실/함정
- **build-SHA 신선도**(§2) — 재배포마다 `GET /` build 확인. **이게 v3의 가장 중요한 교훈.**
- getTransitRoute **콜드스타트** 첫호출 타임아웃(§2).
- **한글 인자 셸 직접입력 = mojibake** → JSON을 Write로 UTF-8 파일저장 후 `curl --data @file`, 파싱은 **node**(이 환경 `python`은 Store 스텁이라 깨짐). curl 한글은 URL인코딩(강남=`%EA%B0%95%EB%82%A8`).
- **`/mcp` = Streamable HTTP SSE** → 헤더 `Accept: application/json, text/event-stream`, 응답 `data: ` prefix 제거 후 마지막 data 파싱. 헬스는 `/`. **node로 호출 시 변수명 `URL` 금지**(전역 URL 클래스 가림→fetch 깨짐, `ENDPOINT` 등 사용).
- **KST 타이밍**: `koreaNow()`(Intl). getNowInfo 야간경고. 공휴일은 `todayKST()`.
- 서울 지하철 **05:30~01:00** → 운행外 실시간 "데이터 없음" 폴백. journey/line은 live statnId 필요.
- TAGO `getSttnNoList` 4~6s 느림(디렉터리 6s 타임아웃+장기캐시). getWeatherAndAir=allSettled(KMA 429/쿼터 빈번).
- ODsay 도시간=헛값→intercity.ts. romanizeHangul=한글→로마자(숫자주변 띄어쓰기 Y5, T2 등 영문약어 보존), fuzzy.resolveName=매칭(1글자 부분일치 가드).
- **테스트**: vitest, `vi.stubGlobal("fetch")` 목, 오프라인 실행(.env 미로드). 핸들러 async 주의(await). `npm run build`=naming lint+tsc, `npm test`=vitest run.

---

## 13. 메모리 파일 (`C:\Users\user\.claude\projects\C--Users-user-Claude-Projects-kakaomcp1-kpass\memory\`)
- `MEMORY.md`(인덱스) · `business-info.md`(kpass 사업자, 로컬전용) · `secrets-registry.md`(키 대장, 로컬전용·값포함, VISITSEOUL 추가됨) · `secrets-management-policy.md` · `delegate-to-spawned-sessions.md` · `kpass-working-style.md`(심사재촉금지·콘솔구체·측정후구현·분기위임·저위험상시허가).
- ⚠️ 메모리 값은 공개 repo·MEMORY.md 인덱스에 절대 옮기지 말 것.

---

## 14. 문서 맵
`docs/00`(오버뷰) `01`(카카오규칙) `02`(제품스펙) `03`(툴계약, D-013~016 반영) `04`(UX칩) `05`(작업협약) `06`(결정 D-001~D-016) `07`(진행 SSOT) `08`(키발급) `09`(대화예시3, 40자제한) `10~13`(이전 핸드오프) `14`(PlayMCP 공식가이드) `15`(랜드마크 핸드오프) `16`(직전 핸드오프, D-014까지) `17`(UI/UX v1 R/Y) `18`(페인포인트 리서치) `19`(UI/UX v2 N1~N10) `20`(UI/UX v3, F1/F2) **`21`(이 문서=최신 진입점)**. 코드: `src/server.ts`·`src/tools/*`·`src/lib/*`·`src/lib/sources/*`.

---

## 15. 새 대화창 직후 할 일 (요약)
1. 이 문서 + `docs/07`(SSOT) + `docs/06`(D-016까지) 읽기.
2. **서울버스 키 재탐침**(§9) — 풀렸으면 seoul.ts 구현.
3. **배포 신선도 확인**: `GET /`의 `build`가 `git rev-parse --short HEAD`와 같은지.
4. (사용자 요청 시) **UI/UX 테스트 v4** — `local_535df7aa` 세션에 send_message로 새 라운드 지시(§6-1 방식), 또는 §8 잔여(N8/N11/N12/폴리시) 마무리.
5. LAUNCH-CRITICAL(§7): Inspector 정식통과 · 노출키 재발급 · (검증 끝나면) 심사요청 · 비즈정보 — 가능하면 분기-위임.
6. **R-DOC 준수**, docs/20 커밋, 노출키 재발급 잊지 말 것, **심사요청 재촉 금지**.
