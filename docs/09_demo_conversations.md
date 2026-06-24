# 09. 대화 예시 3개 (PlayMCP 제출용 Demo Conversations)

> PlayMCP 등록 시 "대화 예시 3개" 입력란에 넣을 데모. 심사·본선 투표에서 **끊김 없는 여정(칩으로 툴→툴 연결)** 인상을 주는 게 목적(docs/04 §3).
> 각 예시는 (1) 사용자 자연어 → (2) 호출되는 툴 → (3) 응답 요지(영문, 칩 푸터 포함) 구조. 실제 응답은 Markdown.

---

## 예시 1 — "결제가 막막해요" → 결제 안내 → 외국인 친화 매장
**상황**: 명동에서 길거리 음식을 먹으려는데 해외카드가 될지 모르는 외국인.

1. 👤 *"I'm at a street food market in Myeongdong. Can I pay with my foreign Visa card?"*
2. 🛠️ `explainPayment` (situation: "street food market", cardType: "Visa")
3. 🤖
   > 💳 **Paying as a foreign visitor — Traditional market / street vendor**
   > **✅ What works** — Cash is king; some stalls take local QR only.
   > **⛔ Avoid** — Foreign cards (most stalls are cash-only).
   > **💡 Tip:** Carry small KRW bills; 'Global ATM' machines dispense cash from foreign cards.
   >
   > **Tap to continue / 누르듯 골라주세요**
   > - 🚌 `How do I pay on the bus?` — transit payment details
   > - 🏪 `Pay at a kiosk` — self-order kiosk caveats
   > - 🍜 `Find foreigner-friendly stores nearby` — stores that take foreign cards
4. 👤 누르듯 → *"Find foreigner-friendly stores nearby"* (area: Myeongdong)
5. 🛠️ `findForeignerFriendlyStore` → 명동 영문 등재 식당 목록 + 결제 팁 칩.

**보여주는 가치**: 한국 특수 결제 맥락(현금/QR/해외카드) 구조화 + 칩으로 자연스러운 다음 행동 연결.

---

## 예시 2 — 메뉴 해독 → 알레르기 안전 → 주문
**상황**: 글루텐 알레르기가 있는 외국인이 분식 메뉴판 앞에서 막힘.

1. 👤 *"The menu says 떡볶이 and 김밥. I'm allergic to gluten — what can I eat?"*
2. 🛠️ `translateMenuContext` (menuText: "떡볶이 김밥", allergyConcerns: ["gluten"])
3. 🤖
   > 🍽️ **Menu, explained in context** — _Checking against: gluten_
   > - **Tteokbokki** — chewy rice cakes in sweet-spicy gochujang. Spice 🌶️🌶️🌶️ hot · Allergens: gluten, soy
   >   - ⚠️ **Contains gluten** (you flagged this)
   > - **Kimbap** — seaweed rice rolls with veg, egg, often ham/tuna. Spice 🌶️ none · Allergens: egg, sesame, fish, soy
   >
   > **Tap to continue**
   > - 🗣️ `Make an ordering sentence` — a phrase to order this
   > - 🌶️ `Show only non-spicy options`
   > - 🍜 `Find a place that serves this`
4. 👤 누르듯 → *"Make an ordering sentence"*
5. 🤖 주문용 한국어 문장 + 발음 제공.

**보여주는 가치**: 단순 번역이 아닌 **맵기·알레르기 맥락** + 사용자가 입력한 알레르기에 맞춘 경고.

---

## 예시 3 — 동네 가이드 → 맛집 → 가는 길 (여정 풀스택)
**상황**: 성수동을 처음 가보는 외국인.

1. 👤 *"I want to explore Seongsu for cafes. What's it like and what should I see?"*
2. 🛠️ `getAreaGuide` (area: "성수동", interest: "food")
3. 🤖
   > 🗺️ **Seongsu (성수동)** — 'Brooklyn of Seoul', warehouse-turned-café district.
   > **Top spots**: converted-warehouse cafés · handmade-shoe street · Seoul Forest · pop-up stores
   > **Getting there:** Seongsu Stn (Line 2).
   > **For food:** specialty coffee and walk-in brunch spots.
   >
   > **Tap to continue**
   > - 🍜 `Find foreigner-friendly restaurants here` — stores that take foreign cards
   > - 🚇 `How do I get here?` — public-transit route
   > - 🕒 `Is it good to go now?` — live hours, crowds, weather
4. 👤 누르듯 → *"Find foreigner-friendly restaurants here"*
5. 🛠️ `findForeignerFriendlyStore` (area: "Seongsu") → 영문 등재 식당 목록.
6. 👤 누르듯 → *"How do I get there?"* → `getTransitRoute` (Seoul Station → Seongsu) → 지하철 경로·요금·소요(영문).

**보여주는 가치**: 한 번의 질문에서 **가이드→맛집→교통**까지 칩만 눌러 이어지는 끊김 없는 여정 = 본선 데모/투표 핵심 인상.

---

## 작성 메모
- 예시 1·2는 키 없이도 즉시 동작(지식 툴). 예시 3은 `getAreaGuide`(즉시) + `findForeignerFriendlyStore`/`getTransitRoute`(API 키 발급 후 실데이터).
- 제출 시점엔 TourAPI/ODsay 키가 연결돼 있어야 3번이 끝까지 실데이터로 완결됨 → docs/08 키 발급 선행.
- 영문 우선(타깃 외국인). 심사 모호성 회피 위해 칩 명령어는 다음 툴콜로 직결되는 명확한 문구만 사용(docs/04 §4).
