새 툴을 일관되게 추가한다. 인자로 받은 툴 목적에 대해:
1. `docs/03_tool_contracts.md` 형식으로 계약 초안 작성: title, 영문 description(<=1024, "Korea Trip Concierge(코리아 트립 컨시어지)" 포함), inputSchema, output(Markdown), annotations 5종.
2. 툴 개수가 10개를 넘기지 않는지 확인(넘으면 통합 제안).
3. 응답에 buildChoiceFooter() 선택지 칩(2~4개, docs/04) 포함 설계.
4. 코드 스텁 + 단위 테스트(정상/에러/24k 가드) 생성.
5. `docs/02`,`03`,`07_progress.md` 갱신. 필요 시 `06_decision_log.md`에 결정 기록.
모든 단계에서 docs/01 규칙 위반이 없는지 확인한다.
