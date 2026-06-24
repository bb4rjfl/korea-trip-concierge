# 07. 진행 상황 (Progress) — 단일 진실 소스(SSOT)

> 세션 간 연속성. `/handoff`로 갱신. CLAUDE.md "현재 상태"와 어긋나면 이 파일 기준.
> 최종 갱신: 2026-06-24

## 마일스톤
- [x] 공모전 규칙·심사정책 정독 및 문서화 (docs/01)
- [x] 아이디어 통합 확정 (docs/02, D-001)
- [x] 푸시→조회 결정, 선택지 UX 결정 (D-002, D-003)
- [x] 통합 툴 스펙 8개 정의 (docs/02, 03)
- [ ] 언어/런타임 확정 → 프로젝트 초기화 (MCP SDK, Streamable HTTP, stateless)
- [ ] 데이터 소스·API 키 확정 (docs/02 §8)
- [ ] 툴 구현: searchPlaceForeigner / findForeignerFriendlyStore / getTransitRoute / trackBusArrival / explainPayment / getAreaGuide / translateMenuContext / getNowInfo
- [ ] 공통 `buildChoiceFooter()` + 24k 가드 + 네이밍 린트
- [ ] MCP Inspector 통과
- [ ] Dockerfile(linux/amd64) + public repo
- [ ] KC Git 소스 빌드 → Active → Endpoint URL
- [ ] PlayMCP 임시등록 → 도구함 테스트 → 대화예시 3개
- [ ] /check 통과 → 심사요청(≤7/7) → 전체공개 → 비즈폼 응모(≤7/14)

## 지금 바로 다음 할 일 (Next)
1. 언어/런타임 확정(권장 TS) → repo 초기화
2. 데이터 소스 1순위(버스 실시간/관광 API) 키 발급
3. `trackBusArrival` + `findForeignerFriendlyStore` 먼저 구현 (가장 차별적·실시간 = 반려 회피 핵심)

## 블로커 / 확인 필요
- 카카오맵 직접연동 가능 여부(선택, 필수 아님)
- 본선 Kakao Tools의 Widget/elicitation/푸시 지원 범위 (본선 단계 확인)

## 세션 로그
- 2026-06-24: 프로젝트 문서 세트 생성(CLAUDE.md + docs 01~07 + 슬래시 커맨드). 아이디어 통합·UX·푸시 제약 반영.
