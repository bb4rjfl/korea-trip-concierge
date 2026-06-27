# CLAUDE.md — Korea Trip Concierge (프로젝트 헌법)

> 이 파일은 Claude Code가 **매 세션 자동으로 읽는** 최상위 컨텍스트다.
> 작업 시작 전 반드시 이 파일과 `docs/` 의 관련 문서를 먼저 읽고, **맥락을 잃지 않도록** 한다.
> 규칙이 바뀌면 이 파일과 `docs/`를 **그 즉시 갱신**한다. (R-DOC 참조)

---

## 0. 이 프로젝트가 뭔가 (한 문단)

**Korea Trip Concierge** 는 방한 외국인이 한국에서 막히는 지점(교통·결제·인증·장소탐색)을 한 번에 해결하는 **MCP 서버**다. 카카오 **Agentic Player 10** 공모전 출품작이며, **PlayMCP**에 등록되어 카카오톡/Kakao Tools 사용자에게 노출된다. **목표는 본선 진출 후 대상(1등) 수상.**

핵심 차별점: 외국인이 못 푸는 "한국 특수 맥락"(T머니, 환승, 해외카드 결제 가능 매장, 실시간 버스 위치)을 **영어로 구조화**해 제공하고, **사용자가 텍스트를 매번 길게 안 써도 버튼/선택지를 눌러 이어가도록** 설계한다.

---

## 1. 작업 시작 전 필독 순서 (매 세션)

1. **이 파일(CLAUDE.md)** — 전체 맥락·규칙 진입점
2. `docs/00_service_overview.md` — 🟢 서비스 총정리 + MCP 작동원리 + 11개 도구 흐름 (전체 그림이 필요할 때)
3. `docs/01_kakao_playmcp_rules.md` — ⭐ 카카오 PlayMCP 개발가이드 + 심사정책 (반려 방지, 절대 규칙)
4. `docs/02_product_spec.md` — 제품 정의 + 통합 툴 스펙 (무엇을 만드나)
5. `docs/03_tool_contracts.md` — 각 툴의 입출력 계약 (JSON, 구현 기준)
6. `docs/04_ux_interaction.md` — "버튼/선택지로 이어가기" 응답 패턴 (UX 핵심)
7. `docs/05_working_agreement.md` — 작업 방식·코딩 규칙·정의(DoD)
8. `docs/06_decision_log.md` — 결정 이력 (왜 이렇게 했나)
9. `docs/07_progress.md` — 진행 상황·다음 할 일 (세션 간 연속성)

> 관련 없는 단순 작업이면 1·7만 읽어도 되지만, **기능을 추가/변경할 때는 1~6을 모두** 확인한다. 전체 그림이 필요하면 `docs/00`.

---

## 2. 절대 어기면 안 되는 규칙 (요약 — 전문은 docs/01)

- ❌ 서버명·툴명에 `kakao` 금지 (대소문자·위치 불문)
- ✅ MCP 버전 `2025-03-26` ~ `2025-11-25`, **Streamable HTTP**, **Remote**, **Stateless 권장**
- ✅ 툴 **3~10개** (최대 20), 이름 `A-Z a-z 0-9 _ -` 1~128자, 대소문자 구분
- ✅ 모든 툴 `name / description / inputSchema / annotations(5종 전부)` 채움
- ✅ description **영문**, 1,024자 이내, 서비스명(Korea Trip Concierge) 포함
- ✅ 응답은 **Markdown TextContent**, **24k 초과 금지**, API JSON 원문 금지(정제)
- ✅ 성능 **평균 100ms / p99 3,000ms**, 외부 API는 타임아웃·캐싱
- ❌ 광고 유도·상업적 링크 과다·리워드 금지
- ❌ 개인정보 6종(주민/면허/여권/외국인등록/카드/계좌) 수집·전송 금지
- ❌ "LLM이 웹검색만으로 가능한 기능"만 제공 금지 → **실시간/연동/구조화 가치 필수**
- ❌ Zapier 등 자동생성 MCP·제3자 서비스 인증정보 사용 금지
- 🛑 **푸시 알림 불가**: MCP는 요청-응답만. 서버가 먼저 못 부른다 → 모든 "알림"은 **사용자 조회(또는 버튼 재호출)**로 설계 (docs/04)

---

## 3. 핵심 워크플로우 규칙

- **R-LOCAL**: 모든 기능은 로컬에서 **MCP Inspector 통과** 후에만 KC 배포.
- **R-AMD64**: Docker 이미지는 `linux/amd64`로 빌드 (`docker build --platform linux/amd64`). arm64 = 활성화 실패.
- **R-DEPLOY**: 배포는 **Git 소스 빌드**(public repo + 루트 Dockerfile) 기본.
- **R-DOC**: 규칙/스펙/결정이 바뀌면 **같은 PR에서** 해당 docs와 `06_decision_log`·`07_progress`를 갱신. 문서 갱신 없는 기능 변경 금지.
- **R-TIMELINE**: 일정은 "7/7 심사요청 마감"에서 역산. 6월 말 1차 배포+심사요청 목표.

---

## 4. 슬래시 커맨드 (Claude Code)

- `/sync` — 세션 시작 시 docs 전체를 빠르게 재확인하고 progress를 요약
- `/check` — 응모 전 카카오 규칙 준수 체크리스트 점검 (docs/01 §9)
- `/newtool` — 새 툴 추가 시 스펙·계약·문서·테스트를 일관되게 생성
- `/handoff` — 세션 종료 시 progress·decision_log 갱신 후 다음 할 일 정리

(정의는 `.claude/commands/` 참조)

---

## 5. 기술 스택 (확정 — D-004/D-005)

- 언어/런타임: **TypeScript + Node.js 22**, MCP 공식 SDK `@modelcontextprotocol/sdk` v1.29 (확정 D-004)
- 전송: **Streamable HTTP, Stateless** (요청마다 server+transport 생성, 세션 없음). 엔트리 `src/server.ts`(express 5, `POST /mcp`).
- 공통 인프라: `src/lib/` — 24k 가드·칩 푸터·네이밍 린트·timeout fetch·TTL 캐시.
- 데이터 전략: **모든 툴 공공 API 실연동 지향**(확정 D-005). 키 미발급 시 graceful "미연동" 응답, 지식툴 3종은 큐레이션 실동작.
- 배포: Dockerfile(`linux/amd64`, 루트) → GitHub(public) → PlayMCP in KC Git 소스 빌드
- 데이터 소스: 서울 실시간 버스(TOPIS/data.go.kr), 한국관광공사 TourAPI(영문), 경로 ODsay — 키 발급 TODO

---

## 6. 현재 상태

- [x] 공모전 규칙·심사정책 정독 및 문서화
- [x] 아이디어 통합 확정 (Concierge + K-Pass Finder + K-Bus Companion → 단일 서버)
- [x] 런타임/데이터전략 확정 (D-004/D-005) + **TS MCP 서버 구축** — **11툴**(D-006, 권장10 초과→유지), 지식툴 3종 즉시동작 + **API툴 8종 실데이터 검증**, **다국어 en/ja/zh/ko**(D-008), UI/UX·구조 하드닝(로마자화·날씨통합·타이틀정제), build/**87 tests**/서버 end-to-end 통과
- [x] **public GitHub repo**: https://github.com/bb4rjfl/korea-trip-concierge
- [x] 대화 예시 3개(docs/09) + API 키 발급 가이드(docs/08) + 핸드오프(docs/10) 작성
- [x] **API 키 발급·저장**(.env)+실연동 검증 — TourAPI다국어/TAGO/ODsay/VisitJeju/날씨/지하철/**POI(네이버+Foursquare 영문변환)**. 99 tests.
- [x] **KC 배포 Active + 키 주입 완료(B2)** — 컨테이너 이미지(ghcr 비공개), ID 638, `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp`. sources 전부 true.
- [x] **대규모 강화(2026-06-26)**: 시나리오 107개 점검→수정(C1~C9) + `fuzzy.ts`(did-you-mean·인천공항) + `intercity.ts`(도시간 그라운딩) + `landmarks.ts`(명소 영업시간 D-014) + 기상특보·국문 TourAPI 커버리지 + findStore 재정의(D-013) + 지하철 3모드(D-012) + 동네 8→21. **117 tests, 라이브검증 12/12 PASS.**
- [x] **VisitSeoul 통합(2026-06-26, D-015)**: 키 발급 → `src/lib/sources/visitseoul.ts`. **searchPlaceForeigner 서울 메인 소스**(비식음=VisitSeoul 공식 영어 큐레이션, 식음=POI, 빈 곳=TourAPI 그라운딩) + **getNowInfo 서울 임의장소 영업시간/지하철 폴백**(C7 확장). **129 tests, 라이브 e2e 7/7 PASS.**
- [x] **UI/UX 240시나리오 테스트→수정(2026-06-26)**: R1~R8 must-fix + Y1~Y22 should-fix 대부분(docs/17). fuzzy 가드·matchAreaName 등.
- [x] **페인포인트 리서치→신툴+강화(2026-06-26, D-016)**: 4 에이전트 리서치(docs/18) → **`explainKoreanService`(12번째 툴)**=한국 본인인증/시스템 장벽 내비(택시/배달/예약/결제/가입/SIM/세금환급/입국/응급/키오스크, twin 패턴+1330) + explainPayment 대확장 + getNowInfo 공휴일(`holidays.ts`) + 메뉴 채식/findStore 응급/교통 네이버팁.
- [x] **UI/UX 테스트 v2·v3 → 전부 수정·배포검증(2026-06-27)**: v2(docs/19) N1~N10(KakaoTalk오매칭·ATM성인업소·language enum·브릿지칩·채식 소/닭 등) + v3(docs/20) **F1**(병원결제)·**F2**(Lotte 후보칩) + **build-SHA 신선도 신호**(헬스 `build`=커밋SHA). **~190 tests, 라이브 6/6 PASS, `build:2429b18` 배포확인.**
- [x] **v4 폴리시 마무리 + 콘텐츠 확대(2026-06-27, D-017)**: docs/20 잔여 폴리시(P2 explainPayment 상황별 브릿지칩·Hallasan 야간 오라벨·P7 메뉴 vegan egg/dairy·P5/P6 explainKoreanService·N12 not-found 검색칩·N11 이미지 노이즈 제거) + **콘텐츠**(메뉴 +13 부산/제주/명물, 명소 27→36 +CJK, 동네 21→26, 제주 대표명소 시딩). **N8=라이브 정상**. **커밋 `ad37b6b` 배포·라이브검증 27/0 PASS**(프로토콜 컴플라이언스 포함=Inspector 필요분 충족).
- [x] **콘텐츠 라운드①(D-018) + UI/UX v4 테스트→수정(D-019) (2026-06-27)**: ① explainKoreanService **+티켓팅**(11서비스, K-pop), 메뉴 +6, 명소 36→43, 동네 26→29. ② v4 테스트(docs/22, 백그라운드 에이전트)="**submission-ready, fix one bug**"(회귀 전부 유지·안전 클린·D-017 12/13 라이브) → **수정 4종**: P-V1🔴(콩국수 broth 오플래그→bone), P-V2(이벤트 강등 + Seoul must-see 시딩), P-V3(비서울 지오코딩+findPlaceInText), P-V4(필수시설 노이즈필터). **206 tests green.** **배포·라이브검증 완료: `7e1b0c8` 18/0 + `ce630d0`(P-V2 시딩) 확인.**
- [x] **완성도 라운드(2026-06-27, D-020)**: 저우선 잔여(P3 temple-stay 라우팅·Jamsil 면책·P4 특정업소 투명안내) + 콘텐츠(explainKoreanService **+은행/송금**=12서비스, explainPayment +찜질방, 메뉴 +6, 명소 43→50, 동네 29→32). 부수: 가입 매처 bare `account` 충돌 제거. **212 tests green.** **배포·라이브검증 완료: `3660698` 14/0 PASS.**
- [~] **콘텐츠 라운드②(2026-06-27, D-021) + 새 시나리오 테스트(v5)**: **다도시 must-see 시딩**(Seoul→Busan/Jeju/Gyeongju, 비서울 discovery 품질↑), 명소 50→55, 동네 32→35, 메뉴 +3. **215 tests green.** ⏳ 재배포 후 v5 시나리오 테스트 예정.
- [ ] **🔥 다음: 재배포(KC 중지→시작)+`build` SHA 검증 → 라이브 probe(폴리시/콘텐츠 + MCP 프로토콜 컴플라이언스 동시) → (검증 끝나면)PlayMCP 심사요청(보류중) → 비즈폼**. 상세 **docs/21 §7~9**. (Inspector 별도 GUI 불필요=재배포 후 라이브 검증에 포함, 노출키 재발급=사용자 결정 스킵)
- [ ] 대기: 서울버스 키 전파(승인됐으나 ws.bus.go.kr 미전파, 매세션 재탐침) / 카카오Local 승인 / 저우선 잔여 P3·P4·Jamsil(docs/21 §8)

> 상세 진행은 `docs/07_progress.md`(SSOT). **새 세션 진입점: `docs/21_handoff.md`**(아주 풍부한 맥락판, docs/16 이후 전부 포함).
