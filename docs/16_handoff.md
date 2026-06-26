# 16. 핸드오프 — 2026-06-26 (새 세션 진입점, 풍부한 맥락판)

> **새 세션은 이 문서를 가장 먼저 읽어라.** 그다음 `CLAUDE.md` → `docs/07_progress.md`(SSOT) → `docs/06_decision_log.md`(D-001~D-014) → `docs/03_tool_contracts.md`. 이 문서는 요약이 아니라 **맥락 전수**가 목적이라 길다. 끝까지 읽어라.

---

## 0. 한 줄 상태
**Korea Trip Concierge** — 방한 외국인용 **11-tool MCP 서버**(TS+Node, Streamable HTTP, stateless). 카카오 Agentic Player 10 출품작, 목표=대상. **KC에 배포·Active, 키 주입 완료, 직전 대배치까지 라이브 검증 12/12 PASS.** 단 **D-014(명소 영업시간 오버레이 + 동네 8→21)는 커밋·푸시·이미지빌드 됐으나 아직 KC 미배포 → 재배포 1회 필요.** 117 tests green.

---

## 1. 무엇을 만들고 있나 (제품 정체성)
방한 외국인이 한국에서 막히는 지점(교통·결제·인증·장소탐색)을 **영어로 구조화**해 풀어주는 MCP 서버. 차별점: "한국 특수 맥락"(T머니/환승/해외카드 매장/실시간 버스·지하철/외국인 필수시설/도시간 이동)을 실데이터+큐레이션으로 제공하고, **사용자가 길게 안 써도 칩(버튼)을 눌러 여정을 이어가게** 설계.

**11 tools**: searchPlaceForeigner, findForeignerFriendlyStore, getTransitRoute, trackBusArrival, trackSubwayArrival, explainPayment, getAreaGuide, translateMenuContext, getNowInfo, getJejuInfo, getWeatherAndAir.

---

## 2. 배포 상태 (⭐ 재배포 방법 숙지)
- KC(PlayMCP in KC)에 **컨테이너 이미지(ghcr 비공개)로 Active**. ID 638, namespace `kbm-u-4961514721`.
- Endpoint: `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp` · 헬스: 끝의 `/` (sources 7개 boolean).
- **키 주입(B2)**: 키 → GitHub Secrets(암호화) → `.github/workflows/deploy-image.yml`가 build-args로 주입 → 비공개 ghcr `ghcr.io/bb4rjfl/korea-trip-concierge:latest` → KC가 PAT(read:packages, `ghp_s0fb…`)로 pull. **ghcr 패키지는 반드시 Private 유지**(키 구워짐).
- **재배포 흐름**: ① 로컬 코드 수정→커밋→`git push origin main`(= Actions `deploy-image` 자동 빌드, src/scripts/package/Dockerfile 경로 변경 시) ② 빌드 성공 후 **KC 서버 상세 → 중지 → 시작**(새 `latest` 재pull). 운영(KC)/로컬 개발 독립. *(사용자가 KC 콘솔 직접 조작. 새 세션이 `gh workflow run` 직접 트리거는 안전분류기에 막힐 수 있으니 `git push`로 자동 트리거가 안전.)*
- **🔴 지금 당장**: D-014 이미지는 빌드됨, KC 미배포 → **사용자에게 KC 중지→시작 안내**해서 D-014 라이브화.
- **ODsay egress IP 주의**: getTransitRoute(ODsay)는 등록 IP 제한. KC egress=`210.109.82.101`를 lab.odsay.com Server IP에 등록해 동작 중. **KC 재시작으로 egress IP가 바뀌면 getTransitRoute가 타임아웃** → `src/server.ts`에 임시 `/egress-ip` 진단(api.ipify.org 호출) 다시 심고→push→재배포→`curl .../egress-ip`로 새 IP 확인→ODsay에 추가→진단 제거. (현재 `/egress-ip`는 제거된 상태.)

---

## 3. 이번 세션에 한 일 (방대 — 다 기억하라)
직전 세션에서 "키 주입 마무리"를 넘겨받아 시작 → KC 컨테이너 재등록으로 키주입 완료(sources 전부 true) → **시나리오 대점검 + 대규모 수정 + 데이터소스 확장 + 콘텐츠 확대**까지 진행.

### 3-1. 시나리오 점검 → 발견 → 수정
- **107개 시나리오를 5개 서브에이전트 병렬로 라이브 실행** per-scenario 평가 → 🔴 다수 발견. (교통·결제·메뉴·장소·복합여정 카테고리별)
- 수정 완료(시나리오 코드 C1~C10):
  - **C1** getWeatherAndAir `Promise.all`→`allSettled` (KMA 429/쿼터로 죽어도 미세먼지·특보는 표시).
  - **C2** 버스 정류장 영어입력→한글 변환(`tago.ts` `toKoreanStop`: Haeundae→해운대 등 관광정류장 맵).
  - **C4** translateMenuContext 정규식 부분일치 오매칭 수정(닭갈비→"치킨"만, 회덮밥/양념치킨 중복 제거; lookbehind/lookahead). 
  - **C5** 알레르기 "거짓 안심" 제거(dairy 등 미추적 토큰은 "추적 안 함" 명시) + vegetarian/halal 숨은육수 경고 + 순서보존 + dish +30종(부대찌개·갈비·치킨·감자탕·아구찜·도토리묵…).
  - **C6** searchPlaceForeigner `inferCategory` 음식키워드 대폭 확장 + concrete 키워드 전달("vegan ramen"→실제 라멘집, 이전엔 신발가게).
  - **C7** getNowInfo 명소 오매칭(Han River→호텔, Lotte World→매장) → **D-014 큐레이션 랜드마크 오버레이로 해소**(아래).
  - **C8** getNowInfo ja/zh 0건 시 en 폴백.
  - **C9** getTransitRoute "출발지 어디?" 프롬프트에 흔한 출발지 칩(Seoul Station/Incheon Airport/내 동네).
  - **C10**(잔여) ODsay 버스 정류장명 로마자 무공백("Donggyodong…bangmyeon") — 한국어 분절 필요, cosmetic, 미해결.
- 부수: findStore Nearby 빈행/노이즈 가드, Naver/Foursquare 주소·이름 로마자 일관화(괄호균형, 순수한글만 로마자), 제주 비영어·구축제 필터, getAreaGuide interest 인정.

### 3-2. 신규 라이브러리 (재사용 인프라)
- **`src/lib/fuzzy.ts`** — 오타/대소문자/띄어쓰기 흡수(normalize+Levenshtein+similarity) + `resolveName`(exact/suggest/none). **"이거 맞나요?" 확인 절차**의 토대. 역(`resolveStationFuzzy`)·장소(`resolvePlaceCoord` 퍼지폴백)에 적용. **인천공항 미인식 해소**(Terminal 1/International/ICN). trackSubwayArrival은 애매하면 후보 칩 제시(Myungdong→[Myeongdong/Gangdong/Chang-dong]).
- **`src/lib/intercity.ts`** — **도시간 이동 그라운딩**. 서울↔부산 등 12도시 감지 → KTX/SRT·고속버스·항공 안내 + 예매 딥링크(코레일/SRT/코버스/버스타고). 제주="항공만, 다리·기차 없음". getTransitRoute가 ODsay 호출 전에 감지. (ODsay가 도시간은 "walk 138min" 같은 헛값 주던 것 해소.)
- **`src/lib/landmarks.ts`**(D-014) — 외국인 인기명소 ~27곳(5대궁·N서울타워·롯데월드/타워·COEX·한강24h·북촌·DDP·시장류·전쟁기념관·리움 + 부산 해운대/광안리/감천/자갈치 + 제주 성산일출봉/만장굴/한라산). 정확 영업시간+closedDays, 4유형(구간/24h/daylight/sunrise), EN+KO 별칭. `resolveLandmark`(퍼지) + `landmarkVerdict`(순수함수). **getNowInfo가 TourAPI 검색 前에 신뢰매칭→현재 KST로 🟢열림/🔴닫힘 즉시판정**, 키·API콜 0.

### 3-3. 툴 재설계/확장 (결정 D-012/013/014)
- **D-012**: `trackSubwayArrival` 3모드 — station(도착) / line(노선 전체 열차 위치, realtimePosition) / **journey(station+to, 하차까지 정거장수)**. 핵심 트릭: **statnId가 노선상 순차증가** → 정거장수=|statnId 차|(데이터 적재 0). 운행外(01:00~05:30)엔 live statnId 없어 "데이터 없음" 안내(≠"다른 노선").
- **D-013**: `findForeignerFriendlyStore` = **"외국인 필수시설 파인더"** 재정의. need enum(환전/해외카드ATM/약국/편의점/관광안내소/해외카드식당) + 큐레이션 지식(1330 핫라인·decline-DCC·CU/GS25 ATM 등, 키 불필요) + 근처 POI. searchPlaceForeigner(일반 장소추천)와 경계 명확.
- **D-014**: getNowInfo 랜드마크 오버레이(C7) + getAreaGuide 동네 **8→21**(부산5·제주2·서울+6: 여의도·잠실·익선동·을지로·삼청동·가로수길).
- getTransitRoute **Phase 1**: 옵션 모드 라벨(🚇 Subway/🚌 Bus) + **동적 추적 칩**("Track the subway at {역}"/"Track bus {번호}") → 탭하면 추적 직결.

### 3-4. 데이터 소스 확장 (사용자 지시, 첨부 매뉴얼 기반)
- **#3 기상특보**(KMA `WthrWrnInfoService/getPwnStatus`, BUS_API_KEY): 현재 활성 특보(태풍/호우/폭염/강풍/풍랑/대설/한파/황사)를 **고정어휘 영문매핑**(번역 아님, D-009 안전)해 getWeatherAndAir에 🚨 배너. `parseAlerts` 테스트.
- **#2 TourAPI 국문 커버리지**: 영문 15,696 vs **국문 50,701**(서울 음식점 16배) 확인. searchPlaceForeigner가 영어 thin 시 **좌표기반 KorService2 결과를 로마자화**해 보강(설명문은 번역불가→이름/주소 로마자+영문 카테고리). `parsePlaces` ko 로마자.
- **#4 지하철**: realtimeStationArrival+realtimePosition 이미 사용·검증(D-012). 완료.
- **#1 VisitSeoul**: 키 발급 후 D-010(서울 다국어 로컬 인덱스). 대기.

### 3-5. 콘텐츠/사전
메뉴 +30종, 역사전 +다수(교대 alias·서울대입구·서초·방배·낙성대·봉천·신림·구로디지털 등), 로마자 지선→Branch.

**총 ~30 커밋, 117 tests green. (52→…→117)**

---

## 4. 데이터 소스 & 키 (전부 `.env`=gitignore + GitHub Secrets)
`secrets-registry`(메모리, 로컬전용) 참조. 매핑:
- **`BUS_API_KEY` = `TOUR_API_KEY`** (data.go.kr 64hex, `05b7e…609a074`): TAGO 비서울 버스·TourAPI 다국어(Eng/Jpn/Chs/Kor)·기상청 단기예보·에어코리아·**기상특보** 공용. **서울 버스 4서비스도 이 키로 승인됨(전파 대기, §6).**
- **`TRANSIT_API_KEY`**(ODsay): getTransitRoute. **등록 IP 제한**(KC egress 210.109.82.101 등록됨).
- **`SUBWAY_API_KEY`**(서울 열린데이터광장 지하철, 30hex `6f756d…484b`): swopenapi.seoul.go.kr 실시간 지하철.
- **`SEOUL_API_KEY`**(서울 열린데이터광장 일반, 30hex `635471…697353`): 예약(D-011 보류).
- **`JEJU_API_KEY`**: VisitJeju(HTTPS, locale=en).
- **`NAVER_CLIENT_ID`/`SECRET`**: 네이버 지역검색. **`FOURSQUARE_API_KEY`**: Foursquare Places.
- 미발급(빈값): `KAKAO_REST_API_KEY`, `VISITSEOUL_API_KEY`.
- 🔴 **노출 키(재발급 필요, 전체공개/심사 전)**: NAVER_SECRET·FOURSQUARE·SEOUL·**ODsay(TRANSIT)**·**PAT(`ghp_s0fb`)** — 채팅/스샷 노출됨. 재발급 후 `.env`+GitHub Secrets 갱신.

---

## 5. 작업 규칙 (어기지 말 것)
- **R-DOC**: 코드/스펙/결정 바뀌면 **같은 변경에서** docs 갱신 — `docs/06_decision_log`(D-001~D-014), `docs/07_progress`(SSOT), `docs/03_tool_contracts`. 문서 갱신 없는 기능변경 금지.
- **kakao 네이밍 금지**(서버·툴명, 대소문자 불문 — `src/lib/naming.ts` 빌드게이트). 카카오 Local은 데이터소스로만(툴명 금지).
- **키 커밋 금지**(B1=repo커밋은 안전분류기 차단됨, 옳음). 키는 `.env`+GitHub Secrets만.
- **D-009 그라운딩**: 서버에서 **외부 LLM/웹검색 호출 금지**(레이턴시·p99·"웹검색 redundancy" 규칙 risk). 큐레이션/참조데이터/로마자만. (그래서 국문 설명문 "번역" 불가 → 로마자+영문 카테고리로 우회.)
- **git**: 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Windows** → `git -c core.autocrlf=false commit`. **push to main = deploy-image 빌드 트리거.** gh CLI 인증=bb4rjfl.
- **툴 계약**: 영문 description ≤1024 + 서비스명("Korea Trip Concierge(코리아 트립 컨시어지)") 포함, annotations 5종, Markdown ≤24k, 칩 푸터 2~4개(`buildChoiceFooter`, 범위밖 throw). 평균100ms/p99 3s(외부 타임아웃 2.5s+재시도, TAGO 디렉터리만 6s+장기캐시). 개인정보 6종 금지. 광고/리워드 금지.
- 툴 수 **11**(권장10 초과, 하드20 이내 — D-006 유지). 통폐합 후보였던 search/findStore는 D-013로 역할 분리됨.

## 5-1. 작업 방식 (이번 세션에 확립 — 메모리에 있음)
- **분기-위임**(`delegate-to-spawned-sessions` 메모리): 단순/검증/독립 작업은 메인에서 직접 말고 `spawn_task`로 별도 세션 분기 → **자기완결적 프롬프트**(프로젝트경로·규칙·구체 체크리스트·기대결과) → 끝나면 **`mcp__ccd_session_mgmt__send_message`로 부모 kpass 세션에 보고**. 컨텍스트 절약. *(이번에 라이브검증·랜드마크작업 둘 다 이 방식으로 처리, 잘 작동함. 다만 worktree 작업물이 main에 커밋 안 되거나 중복import 같은 병합이슈는 부모가 정리해야 함.)*
- **키 관리**(`secrets-management-policy` 메모리): 사용자가 키 주면 막지 말고 받아서 `secrets-registry`(로컬전용)에 적재·문서화. 위험은 막지 말고 한 번 고지(재발급 권장) 후 사용자 결정대로.

---

## 6. 블로커 / 대기 중
- **🚌 서울 버스(가장 끈질긴 블로커, 이번 세션 끝까지 추적)**: data.go.kr 서울버스 4서비스(**15000314 정류소 / 15000303 도착 / 15000332 위치 / 15000193 노선**) **BUS_API_KEY로 승인됨(2026-06-25~)**. 그러나 게이트웨이 `ws.bus.go.kr`가 **에러30(SERVICE KEY IS NOT REGISTERED)** 지속. **전수 진단 완료**: 키 유효(TAGO/apis.data.go.kr엔 NORMAL), 엔드포인트·파라미터(`ServiceKey` 대소문자까지)·hex키라 Encoding무관·승인확인된 위치서비스조차 에러30 → **모두 정상, 순수 게이트웨이 키 전파 지연.** 개발자 블로그 확인: "승인 후 에러30 = 전파 대기(저자는 1시간+)". 우리는 **1일+ 기다려도 에러30 = 비정상적으로 김.** → **할 수 있는 것: 매 세션 재탐침(`http://ws.bus.go.kr/api/rest/stationinfo/getStationByName?ServiceKey=$BUS&stSrch=강남` → headerCd 0이면 풀림), 며칠 더면 data.go.kr 1566-0025/데브톡 문의.** 풀리는 즉시 **`src/lib/sources/seoul.ts` 구현 + trackBusArrival 서울분기 연결**. 스펙 완비(getBusRouteList→busRouteId, getStaionByRoute→정류소순서, getBusPosByRouteSt(busRouteId/startOrd/endOrd)→위치, getLowArrInfoByStId→`arrmsg1`="N분후[M번째 전]"). 가이드 docx 4종: `C:\Users\user\Downloads\서울특별시_{정류소정보/버스도착정보/버스위치정보/노선정보}조회_서비스_활용가이드*.docx`. **출품 안 막음**(TAGO 비서울 정상, 서울 입력=경로안내 폴백, intercity 그라운딩).
- **🆕 VisitSeoul 키** 대기 → D-010 서울 다국어 로컬 인덱스(음식6369/관광/쇼핑/숙박, 7개언어).
- **🆕 카카오 Local** 승인 대기 → POI 레이어(툴명 kakao 금지, 콘솔 카카오맵 ON 선행).

---

## 7. 🔴 LAUNCH-CRITICAL (심사요청 ≤7/7 전 반드시)
1. **KC 재배포**(D-014 라이브화) → 새 버전 라이브 검증.
2. **MCP Inspector 정식 통과**(배포 URL 대상 — 여태 curl/핸들러만). /check WARN.
3. **노출 키·PAT 재발급** → .env+GitHub Secrets 갱신.
4. **PlayMCP 심사 흐름**(docs/14 §3): 임시등록 **완료**(Online, 11툴, 로고, 대화예시3) → 도구함 추가 → AI채팅/Claude커넥터 테스트 → **심사요청** → 승인 → 전체공개 → 상세 URL.
5. **비즈정보 심사 재제출**(비즈폼 ≤7/14 게이트): 서비스화면 `C:\Users\user\Downloads\kpass-service-screen.png`의 **사업자등록번호 placeholder(000-00-00000) → 실번호 487-01-04137**(상호 케이커브, 대표 강상호; `business-info` 메모리)로 교체 후 재제출. (반려사유: 사업자정보 미확인 + 서비스화면 부족.)

---

## 8. SHOULD / COULD (있으면 좋음 — 가점·완결성)
- C10 ODsay 정류장 로마자 무공백 / Naver 영어지역 주소 로마자 완전 일관화 / 지하철 노선제안 강화 / 신규 툴모드(journey·line·intercity·did-you-mean) 툴레벨 테스트 보강.
- **콘텐츠 커버리지 확대**: getAreaGuide 더(현재 21), 명소 더(현재 27), 메뉴 더 — 특히 서울 외.
- **보너스 역량**: 관광코스별 날씨(기상청27, csv `C:\Users\user\Downloads\_ktc_docs\기상청27_…지점정보.csv`) / 기상특보 도시별 필터 / 지하철 realtimePosition 더 풍부히 / 다국어 UI 라벨.
- **2번째 제출 슬롯**(미결정, 별도 세션): 내국인용 '장보기 가격 디코더' 별도 MCP. 컨셉만 placeholder. KC 2서버·최대 2제출.
- 첨부 매뉴얼 추출본: `C:\Users\user\Downloads\_ktc_docs\`(기상특보·관광공사 국/영 매뉴얼·관광코스).

---

## 9. 같이 발전시킨 아이디어 (제품 비전 — 계속 밀어라)
- **여정 UX**: 목적지 추천 → "어떻게 가?" → **버스+지하철 동시 제시·선택** → 선택하면 어디서 타고·언제 와·지금 어디 → **탔으면 지금 어디·언제 내려**. → getTransitRoute(두 모드+동적칩) + trackBus(하차 카운트) + trackSubway journey(정거장수) + intercity로 상당히 실현. **칩으로 끊김없이 이어가는 데모**가 본선 투표 핵심.
- **did-you-mean 확인 절차**: 오타·애매입력 시 후보를 간단설명과 함께 제시해 재확인(fuzzy로 일반화). 더 많은 툴에 확장 가능.
- **큐레이션 우위**: 외국인 필수시설(1330·DCC·체인)·명소 영업시간·도시간 딥링크처럼 "LLM 웹검색이 신뢰성있게 못 주는" 큐레이션이 차별점이자 규칙안전.

---

## 10. 자잘하지만 중요한 사실/함정
- 서울 지하철 운행 **05:30~01:00** → 운행外 실시간은 "데이터 없음" 우아 폴백. journey/line모드는 live statnId 필요→운행外 불가.
- **KST 타이밍**: `koreaNow()`(Intl, 핸들러에서 OK). getNowInfo 야간경고.
- **한글 인자 셸 직접입력 = mojibake** → JSON을 **Write 툴로 UTF-8 파일 저장 후 `curl --data @file`**. 파싱은 **node**(이 환경 `python`은 Store 스텁이라 "Python" 출력하며 깨짐).
- KC `/mcp`는 Streamable HTTP SSE → 헤더 `Accept: application/json, text/event-stream`, 응답 `data: ` prefix 제거. 헬스는 `/`.
- TAGO `getSttnNoList`(정류소검색) 4~6s 느림(디렉터리만 6s 타임아웃+장기캐시); 실시간 도착 2.5s.
- ODsay 도시간=헛값(walk) → intercity.ts. getWeatherAndAir=allSettled(KMA 429/쿼터 빈번, AirKorea 독립).
- romanizeHangul=한글→로마자, fuzzy.resolveName=매칭. TourAPI Eng(en)≪Kor(ko) 데이터량.

---

## 11. 메모리 파일 (`C:\Users\user\.claude\projects\C--Users-user-Claude-Projects-kakaomcp1-kpass\memory\`)
- `MEMORY.md`(인덱스) · `business-info.md`(kpass 사업자, 로컬전용) · `secrets-registry.md`(키 대장, 로컬전용·값 포함) · `secrets-management-policy.md` · `delegate-to-spawned-sessions.md`.
- ⚠️ 메모리 값은 공개 repo·MEMORY.md 인덱스에 절대 옮기지 말 것.

## 12. 문서 맵
`docs/00`(오버뷰) `01`(카카오규칙) `02`(제품스펙) `03`(툴계약, D-013/014 반영) `04`(UX칩) `05`(작업협약) `06`(결정 D-001~D-014) `07`(진행 SSOT) `08`(키발급) `09`(대화예시3) `10~13`(이전 핸드오프) `14`(PlayMCP 공식가이드) `15`(랜드마크/동네 분기 핸드오프) **`16`(이 문서=진입점)**. 코드: `src/server.ts`·`src/tools/*`·`src/lib/*`·`src/lib/sources/*`.

---

## 13. 새 대화창 직후 할 일 (요약)
1. 이 문서 + `docs/07`(SSOT) 읽기.
2. **서울 버스 키 재탐침**(매 세션) — 풀렸으면 seoul.ts 구현.
3. 사용자에게 **KC 재배포(D-014 라이브화)** 안내 → 검증.
4. LAUNCH-CRITICAL(§7) 중 하나씩 진행(Inspector·키재발급·심사요청·비즈정보) — 가능하면 분기-위임.
5. R-DOC 준수. 노출키 재발급 잊지 말 것.
