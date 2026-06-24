# Korea Trip Concierge 🇰🇷

방한 외국인이 한국에서 막히는 지점(장소탐색·외국인 친화 매장·교통·결제)을 영어로 구조화해 해결하는 **MCP 서버**. 카카오 **Agentic Player 10** 공모전 출품작.

**Repo**: https://github.com/bb4rjfl/korea-trip-concierge · TypeScript + Node 22 · MCP SDK 1.29 · Streamable HTTP (stateless)

## 개발 / 실행
```bash
npm install
npm run build      # 네이밍 린트(kakao 금지) + tsc
npm test           # vitest (77)
npm run dev        # tsx watch (로컬 서버, POST /mcp)
npm start          # node dist/server.js
```
API 키는 `.env.example`를 복사해 `.env`에 설정 (발급법: `docs/08_api_key_issuance.md`). 키 없이도 지식 툴 3종은 동작.

## 이 저장소를 처음 여는 사람(또는 Claude Code)에게

1. **`CLAUDE.md`** 부터 읽으세요. 프로젝트 헌법이자 모든 컨텍스트의 진입점입니다.
2. 규칙은 `docs/01_kakao_playmcp_rules.md` (절대 규칙 — 어기면 심사 반려).
3. 무엇을 만드는지는 `docs/02_product_spec.md`, 어떻게는 `docs/03~05`.
4. 진행 상황은 `docs/07_progress.md` (단일 진실 소스).

## 문서 맵
| 파일 | 내용 |
|---|---|
| `CLAUDE.md` | 프로젝트 헌법·규칙 요약·필독 순서 |
| `docs/00_service_overview.md` | 🟢 서비스 총정리 + MCP 작동원리 + 11개 도구 흐름 (전체 그림 진입) |
| `docs/01_kakao_playmcp_rules.md` | ⭐ 카카오 PlayMCP 개발가이드+심사정책+일정 (절대 규칙) |
| `docs/02_product_spec.md` | 제품 정의·통합 결정·툴 목록·푸시 제약 |
| `docs/03_tool_contracts.md` | 8개 툴 입출력 계약(JSON) |
| `docs/04_ux_interaction.md` | "버튼/선택지로 이어가기" 응답 패턴 |
| `docs/05_working_agreement.md` | 작업 방식·코딩 규칙·DoD |
| `docs/06_decision_log.md` | 결정 이력 |
| `docs/07_progress.md` | 진행 상황(SSOT) |
| `docs/08_api_key_issuance.md` | 외부 API 키 발급 가이드 (단계별) |
| `docs/09_demo_conversations.md` | 제출용 대화 예시 3개 |

## Claude Code 슬래시 커맨드
- `/sync` 세션 시작(컨텍스트 로드 + 다음 할 일)
- `/newtool` 새 툴 일관 추가
- `/check` 응모 전 카카오 규칙 점검
- `/handoff` 세션 종료(문서 최신화)

## 핵심 제약 (요약)
- 서버명·툴명에 `kakao` 금지 · Streamable HTTP · Remote · Stateless
- 툴 3~10개 · annotations 5종 · 영문 description · 응답 Markdown ≤24k
- p99 3s · 광고/리워드 금지 · 개인정보 6종 금지
- **푸시 불가** → 모든 알림은 조회+새로고침 칩으로
- **LLM 웹검색으로 대체 가능한 기능 금지** → 실시간/연동/구조화 가치 필수

## 일정 (역산)
6월 말 1차 배포 → **7/7 심사요청 마감** → 전체공개 → **7/14 비즈폼 응모**
