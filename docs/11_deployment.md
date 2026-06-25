# 11. 배포 실행 런북 (KC → PlayMCP → 심사요청)

> 목표: GitHub repo를 **PlayMCP in KC**에 Git 소스 빌드로 올려 Active 엔드포인트를 얻고,
> PlayMCP에 등록 → 도구함 테스트 → **심사요청(≤7/7)** → 전체공개 → 비즈폼 응모(≤7/14).
> 사용자(카카오계정/KC/PlayMCP 콘솔)가 직접 실행하는 단계가 많다. 각 단계에 ✅체크.

---

## 0. 배포 전 최종 점검 (이미 통과)
- [x] `npm run build` + `npm test`(87) green, 네이밍 린트 통과
- [x] `/check` 규칙 준수 FAIL 0 (docs/01 §8)
- [x] 루트 `Dockerfile`(linux/amd64), public repo `bb4rjfl/korea-trip-concierge`, branch `main`
- [ ] (배포 직후) MCP Inspector로 엔드포인트 정식 점검

---

## 1. KC에 서버 띄우기 — PlayMCP in KC (Git 소스 빌드)
콘솔: **https://playmcp.kakaocloud.io** (PlayMCP 가입 카카오계정으로 로그인, 계정당 최대 2대)

1. **새 서버 생성 → 방법 A: Git 소스 빌드** 선택
2. 입력값:
   - 서버명: `korea-trip-concierge` (또는 표시용 이름 — kakao 금지)
   - 설명: 영문 1줄(서비스명 포함). 예: *"Korea Trip Concierge — helps foreign visitors with places, foreigner-friendly stores, transit, and payment in Korea."*
   - **Git URL**: `https://github.com/bb4rjfl/korea-trip-concierge` (루트에 Dockerfile 있음 ✅)
   - 브랜치: `main`
   - Dockerfile 경로: `Dockerfile` (루트)
   - PAT: public repo라 **불필요**
3. **⭐ 환경변수(시크릿) 등록** — 서버 설정의 Env에 `.env`의 키를 그대로 입력(절대 repo에 넣지 말 것):
   ```
   PORT=8080
   TOUR_API_KEY=...      (= data.go.kr 키)
   BUS_API_KEY=...       (= 같은 data.go.kr 키)
   TRANSIT_API_KEY=...   (ODsay)
   SUBWAY_API_KEY=...    (서울 열린데이터광장)
   JEJU_API_KEY=...      (VisitJeju)
   ```
   (KAKAO_REST_API_KEY는 보류 — 미입력 OK)
4. 빌드/배포 → 상태 **`Active`** 확인 → **Endpoint URL 복사** (예: `https://....kakaocloud.io/mcp`)
5. **헬스 체크**: 브라우저로 Endpoint의 `/` 열기 →
   `{"...","tools":11,"status":"ok","sources":{"tour":true,"bus":true,"transit":true,"subway":true,"jeju":true}}`
   → `sources`가 모두 `true`인지로 **KC에 키가 제대로 들어갔는지 즉시 확인**.

> ⚠️ arm64 빌드 실패 주의 — Dockerfile은 `--platform=linux/amd64` 명시됨(문제 없음).

---

## 2. ⭐ ODsay IP 화이트리스트 갱신 (안 하면 경로 툴 인증실패)
ODsay의 Server 플랫폼 키는 **요청 IP = 등록 IP** 가 일치해야 한다. 현재 등록은 개발 PC IP라, KC에서 호출하면 `ApiKeyAuthFailed`.

1. KC 서버의 **outbound(공인) IP** 확인 (KC 콘솔 네트워크/서버 정보, 또는 배포 후 `getTransitRoute` 호출 시 에러 로그)
2. **lab.odsay.com → 내 애플리케이션 → 해당 앱 → 설정 → 등록 IP** 를 KC outbound IP로 변경(또는 추가)
3. `getTransitRoute` 재호출로 정상 경로 반환 확인

---

## 3. MCP Inspector 정식 점검 (배포 URL 대상)
로컬에서: `npm run inspect` → Inspector UI에서 **Transport: Streamable HTTP**, URL = KC Endpoint(`.../mcp`) 입력 → Connect
- [ ] initialize 성공(serverInfo: korea-trip-concierge)
- [ ] tools/list에 11개 노출, 각 annotations·inputSchema 정상
- [ ] 샘플 호출: `explainPayment{situation:"subway"}`(키 없이도 동작), `getWeatherAndAir{city:"Seoul"}`(실데이터), `searchPlaceForeigner{query:"cafe",area:"Hongdae"}`
- [ ] 응답 24k 이하·Markdown·칩 푸터 확인

---

## 4. PlayMCP 등록 → 도구함 → 심사요청
PlayMCP 콘솔에서:
1. **임시 등록** → Endpoint URL 입력 → **"정보 불러오기"** 성공(11툴 인식) 확인
2. **도구함 추가** → **AI채팅 테스트**로 몇 개 툴 실호출
3. **대화 예시 3개 입력** — `docs/09_demo_conversations.md`의 3개 시나리오 사용
4. 대표 이미지 등록(움직이는 이미지 금지, 서비스 성격 부합·고품질)
5. **심사 요청** — ⏰ **반드시 7/7까지**(심사 최대 7일, 7/7 요청분만 기한 보장)

---

## 5. 승인 후 → 응모
1. 승인되면 **"전체 공개"** 로 전환
2. **상세 페이지 URL** 복사
3. 공모전 **비즈폼 "Player 예선 참여"** 제출(최대 2개, **1회 제출**) — ⏰ **≤7/14**

---

## 6. 롤백/주의
- KC 서버 **삭제는 복구 불가**. 재배포는 새로 생성.
- 키 회전 시 KC Env만 갱신(코드 변경 불필요 — 런타임 getter).
- 배포 후 코드 수정 → repo push → KC 재빌드(같은 설정).

---

## 남은 데이터 TODO (배포와 병행 가능, 선택)
- 서울 버스(seoul.ts): data.go.kr 승인 활성화 전파 확인 후 구현(현재 `ws.bus.go.kr` 키 미등록 응답 — 낮/전파 후 재시도).
- 서울 지하철·TAGO 도착 성공필드 낮 시간 라이브 확인.
- TourAPI 콜드 지연(p99) 낮 부하 측정.
