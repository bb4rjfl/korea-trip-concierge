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
- [ ] **데이터 소스·API 키 발급** (사용자) — docs/08 따라 BUS/TOUR/TRANSIT 키 발급 → `.env`
- [ ] 키 발급 후 실응답으로 각 소스 파서 필드 검증(`verify-live`/`NOTE(verify-live)` 주석 지점)
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
- **API 키 발급(사용자 액션 필요)**: data.go.kr 공공데이터포털 회원가입+활용신청, ODsay 가입. → 발급되면 알려주면 실데이터 연동 진행.
- 루트의 `01~07_*.md` 가 `docs/`와 100% 중복 → 드리프트 방지 위해 루트 사본 삭제 권장(사용자 확인 대기).
- 카카오맵 직접연동 가능 여부(선택, 필수 아님)
- 본선 Kakao Tools의 Widget/elicitation/푸시 지원 범위 (본선 단계 확인)

## 프로젝트 구조 (현재)
```
src/server.ts            Streamable HTTP stateless 진입점 (+ 시작 시 네이밍 린트)
src/lib/                 constants, env, naming, markdown(24k), footer(칩), http(timeout), cache(TTL), responses
src/tools/               8개 툴 (types, index, *.ts) — explainPayment/translateMenuContext/getAreaGuide 실동작
scripts/lint-naming.ts   빌드 게이트 (kakao 토큰/charset/중복/개수)
test/                    vitest 46개 (헬퍼 + 전체 툴 계약 + 핸들러 스모크)
Dockerfile               linux/amd64, 루트
```

## 세션 로그
- 2026-06-24 (1): 프로젝트 문서 세트 생성(CLAUDE.md + docs 01~07 + 슬래시 커맨드).
- 2026-06-24 (2): 런타임 TS 확정(D-004), 데이터 전략 실연동 확정(D-005). TS MCP 서버 스캐폴드 전체 구축 — 8툴 계약 등록, 지식툴 3종 실동작, 공통 인프라(24k가드·칩푸터·네이밍린트·timeout/cache), Dockerfile. build/lint/46 tests/서버 end-to-end 검증 완료.
- 2026-06-24 (3): TourAPI(영문) 실연동 클라이언트 구현 + searchPlaceForeigner/findForeignerFriendlyStore 연결(키 가드/에러처리), 픽스처+mock 테스트(52개 통과). 대화예시 3개(docs/09) 작성. API 키 발급 상세 가이드는 별도 세션으로 분기(docs/08 작성 예정).
- 2026-06-25 (4): 남은 API 툴 3종 실연동 선작성 — tago.ts(TAGO 실시간 버스)+odsay.ts(경로) 소스 구현, trackBusArrival/getTransitRoute/getNowInfo 연결. 파서 픽스처/mock 테스트 추가(56개 통과). git 저장소 초기화 + .gitattributes(LF) + 첫 커밋 → public GitHub repo(bb4rjfl/korea-trip-concierge) 생성·푸시. docs/08 키 발급 가이드 완료 확인.
