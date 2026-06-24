응모 전 카카오 규칙 준수 점검을 수행한다. `docs/01_kakao_playmcp_rules.md` §8 체크리스트를 기준으로 현재 코드/스펙을 하나씩 대조하라:
- 서버명·툴명에 kakao 없음 / MCP 버전·Streamable HTTP·Remote·Stateless
- 툴 3~10개, 이름 규칙(A-Z a-z 0-9 _ -, 1~128, 대소문자 구분, 중복 없음)
- 모든 툴 annotations 5종 + inputSchema + 영문 description(<=1024, 서비스명 포함)
- 응답 Markdown·24k 이하·이미지 URL·API원문 아님
- 평균100ms/p99 3s, 광고·리워드·상업유도 없음
- LLM 웹검색 단독 불가한 고유가치 있음
- 개인정보 6종 없음 / MCP Inspector 통과 / 대화예시 3개
각 항목을 OK/FAIL/WARN으로 표시하고, FAIL·WARN은 수정 방법을 제시한다. 통과 못 하면 응모 진행을 막는다.
