# 14. PlayMCP 공식 가이드·절차 (사용자 제공 Notion 원문 정리 — 규칙)

> 출처: 카카오 PlayMCP 공식 Notion(공모전 참가방법·유의사항·PlayMCP in KC 이용가이드[Git/이미지]·PlayMCP 등록·심사·공개·Claude 커넥터)을 사용자가 텍스트로 전달 → 정리.
> **이 문서의 절차는 배포·등록·응모의 단일 기준**이다. `docs/11_deployment.md`(우리 프로젝트 실행 런북)와 함께 본다. 규칙 충돌 시 `docs/01`(심사정책) 우선.

---

## 1. 공모전 참가 5단계 (전체 흐름)
1. **MCP 서버 개발** — PlayMCP 개발가이드 준수. 로컬에서 개발·테스트 완료 권장.
2. **PlayMCP in KC 에서 배포** — 카카오가 무상 제공하는 MCP 서버 클라우드(`https://playmcp.kakaocloud.io`). Git 소스 또는 컨테이너 이미지로 생성 → **Endpoint URL 획득**.
3. **PlayMCP에 등록** — PlayMCP 개발자 콘솔에서 그 Endpoint URL을 등록.
4. **심사 진행 후 공개** — 심사요청 → 승인 → "전체 공개" 전환 → 상세 URL 확보.
5. **공모전 페이지 비즈폼으로 예선 접수** — "Player 예선 참여"(최대 2개 MCP, 1회).

---

## 2. PlayMCP in KC — 서버 배포 (Endpoint URL 발급)
진입: `https://playmcp.kakaocloud.io` (PlayMCP 가입 카카오계정 로그인 필수). **계정당 MCP 서버 2대**까지.

> 🔴 **중요(우리가 겪은 핵심)**: Git 소스 빌드·컨테이너 이미지 **두 방식 모두 "환경변수(API 키) 입력란이 없다."** → 키가 필요한 서버는 **키를 이미지에 빌드시점에 주입**해야 한다. (우리 해법 = GitHub Secrets→비공개 ghcr 이미지→컨테이너 등록. docs/13 §1)

### 방식 A — Git 소스 빌드
`+ 새 MCP 서버 등록 → "Git 소스 빌드"`. 입력:
- **MCP 서버 이름** / **설명** (KC 표시용, PlayMCP와 무관)
- **Git URL** (저장소 루트 또는 지정 경로에 **Dockerfile 필수**)
- **브랜치/ref** (보통 main)
- **Dockerfile 경로** (보통 `Dockerfile`)
- **PAT** (private 저장소만 — GitHub 프로필→Settings→Developer settings→Personal access tokens. public이면 비움)

### 방식 B — 컨테이너 이미지
`+ 새 MCP 서버 등록 → "이미지 등록"`. **이미지는 linux/amd64 필수**(arm64 활성화 실패; `docker build --platform linux/amd64`). 입력:
- **MCP 서버 이름** / **설명**
- **Registry 호스트** (docker=`docker.io`, github=`ghcr.io`)
- **Registry 사용자 / 비밀번호** (private 레지스트리만)
- **image_name** / **image_tag**

### 공통 — 활성화·확인
- 등록 → Status **Starting** → 빌드·배포 → **Active**. (수십 초~수 분)
- Active 서버 클릭 → 상세에서 **Endpoint URL** 복사(`.../mcp`). PlayMCP 등록에 사용.
- "중지"/"삭제" 가능(**삭제는 되돌릴 수 없음**).

---

## 3. PlayMCP 등록 → 심사 → 공개 (KC와 별개)
PlayMCP 개발자 콘솔(`playmcp.kakao.com`)에서:
1. **회원가입·로그인** (KC와 같은 카카오계정).
2. **"새로운 MCP 서버 등록"** → **MCP Endpoint** 항목에 KC Endpoint URL 입력 → **"정보 불러오기"** 클릭.
   - ⚠️ **정보 불러오기가 성공해야 함.** 실패하면 개발한 MCP에 문제 있는 것(엔드포인트·툴 스펙 점검).
3. 정보 입력 후 **반드시 "임시 등록" 클릭.** *(지금은 "등록 및 심사요청"을 누르지 말 것.)*
4. 임시등록 상태에서 **"MCP 상세 미리보기" → "도구함에 추가"**.
5. PlayMCP **AI채팅**으로 충분히 테스트. (또는 Claude 커넥터로도 테스트 — §5)
6. 테스트 완료 → 임시등록 상태에서 **"심사 요청"** 클릭.

### 심사·공개
- 심사 통상 **영업일 1~2일**(최대 7일). **7/7까지 요청** 건만 기한 보장.
- **반려** 시: 카카오계정 대표이메일로 반려 사유 발송(프로필→설정→내 정보 관리→연결된 이메일에서 확인). 다시 임시저장 상태 → 사유 처리 후 재"심사 요청".
- **승인** 시: 승인 메일. 콘솔 상세의 공개 상태가 **"나에게만 공개"** → **"전체 공개"** 로 전환.
- 전체공개된 상세페이지로 이동 → **브라우저 주소 복사** (예: `https://playmcp.kakao.com/mcp/12345678901234567`).

### 비즈폼 응모
- 공모전 페이지 → **"Player 예선 참여"** → 양식 작성·접수. **최대 2개 MCP** 등록 가능.

---

## 4. 유의사항 (위반 시 회수·실격 가능)
- KC 서버 발급은 **예선 접수기간(6/15~7/14)에만** 가능. 심사 여유 두고 미리 발급.
- KC Endpoint URL로 **PlayMCP에 등록해야** 참여 인정.
- **공모전 참가 외 다른 용도 사용·예선 미접수 시 임의 회수**될 수 있음.
- KC는 PlayMCP 회원만, **계정당 2대**.
- KC 무상지원은 공모전 후 일정기간 유지 후 종료(추후 공지). 종료 후 과금(사업자) 또는 타 클라우드 이전.
- **PlayMCP in KC 오류 외, MCP 개발 이슈는 별도 지원 없음.** 문의는 카카오 고객센터.

---

## 5. Claude 커넥터 (테스트·시연 수단)
PlayMCP가 **Claude 공식 커넥터**로 추가됨 → 도구함에 담은 MCP 툴을 Claude에서 사용 가능(테스트·데모에 유용).
- **Claude Pro/MAX(유료 플랜)** 에서만 제공. **연결**: Claude 설정 → 커넥터 → "커넥터 둘러보기" → 디렉토리에서 **PlayMCP** 검색·선택 → "연결" → PlayMCP 가입 카카오계정으로 OAuth 로그인·동의 → 채팅에서 도구함 도구 사용.
- Team/Enterprise는 관리자가 "팀에 추가" 후 개인이 연결.
- PlayMCP 설정 → 연결된 서비스에서 Claude 액세스 권한 삭제 가능.

---

## 6. 우리 프로젝트 현재 매핑 (2026-06-25)
- [x] 1단계 개발 — 11툴, 99 tests, 로컬 검증.
- [x] 2단계 KC 배포 — **Git 소스 빌드로 Active**, Endpoint `https://korea-trip-concierge.playmcp-endpoint.kakaocloud.io/mcp`, 11툴 라이브검증. **단 키 미주입**(env란 없음) → **방식 B(컨테이너 이미지, ghcr 비공개)로 재등록 예정**(docs/13 §1).
- [ ] 3단계 PlayMCP 등록 — 키 주입 완료 후: Endpoint 입력→"정보 불러오기"→**"임시 등록"**(심사요청 아직 X)→도구함 추가→AI채팅/Claude커넥터 테스트→대화예시(docs/09).
- [ ] 4단계 **심사 요청 ≤7/7** → 승인 → **전체 공개** → 상세 URL.
- [ ] 5단계 비즈폼 응모 ≤7/14.
