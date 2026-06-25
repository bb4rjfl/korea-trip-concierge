# -*- coding: utf-8 -*-
"""Service plan (기획안) sheet for Kakao Map biz review.
- A phone-framed 'usage example' (with a real message input bar) = 이용 동선
- Document header/info row with business info = 사업자 정보 (natural on a 기획안)
No fake 'KakaoTalk screen with a footer'."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 1400
WHITE = (255, 255, 255); BG = (247, 249, 252)
DARK = (30, 41, 59); GRAY = (110, 120, 135); BLUE = (37, 99, 235); CYAN = (6, 182, 212)
YELLOW = (254, 229, 0); BUBBLE = (238, 241, 245); BEZEL = (38, 46, 59); CHATBG = (181, 200, 218)

img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)


def F(sz, bold=False):
    try:
        return ImageFont.truetype("malgunbd.ttf" if bold else "malgun.ttf", sz)
    except OSError:
        return ImageFont.load_default()


def wrap(text, font, maxw):
    out = []
    for para in text.split("\n"):
        if para == "":
            out.append(""); continue
        line = ""
        for w in para.split(" "):
            t = (line + " " + w).strip()
            if d.textlength(t, font=font) <= maxw:
                line = t
            else:
                if line: out.append(line)
                line = w
        out.append(line)
    return out


# ---- header band ----
for y in range(150):
    t = y / 150
    d.line([(0, y), (W, y)], fill=(int(BLUE[0]+(CYAN[0]-BLUE[0])*t), int(BLUE[1]+(CYAN[1]-BLUE[1])*t), int(BLUE[2]+(CYAN[2]-BLUE[2])*t)))
d.rounded_rectangle([40, 38, 112, 110], radius=18, fill=WHITE)
kf = F(48, True); kb = d.textbbox((0, 0), "K", font=kf)
d.text((76-(kb[2]-kb[0])/2-kb[0], 74-(kb[3]-kb[1])/2-kb[1]), "K", font=kf, fill=BLUE)
d.text((130, 40), "kpass", font=F(46, True), fill=WHITE)
d.text((133, 100), "Korea Trip Concierge — 방한 외국인 여행 컨시어지 MCP", font=F(22), fill=(235, 245, 255))

# ---- business-info row (document info; legitimate on a 기획안) ----
iy = 150
d.rectangle([0, iy, W, iy + 70], fill=(234, 239, 245))
d.rectangle([0, iy, 8, iy + 70], fill=BLUE)
d.text((34, iy + 12), "사업자 정보 / Business Info", font=F(17, True), fill=BLUE)
d.text((34, iy + 38), "케이커브 (K-curve)  ·  대표 강상호  ·  사업자등록번호 487-01-04137  ·  국내 사업자", font=F(19), fill=DARK)

# ================= LEFT: phone-framed usage example =================
px0, py0, px1, py1 = 50, 268, 470, 1230
d.text((55, 238), "서비스 이용 예시 (카카오톡 대화)", font=F(20, True), fill=DARK)
d.rounded_rectangle([px0, py0, px1, py1], radius=38, fill=BEZEL)
sx0, sy0, sx1, sy1 = px0 + 14, py0 + 16, px1 - 14, py1 - 16
d.rounded_rectangle([sx0, sy0, sx1, sy1], radius=26, fill=CHATBG)
# phone top bar
d.rectangle([sx0, sy0, sx1, sy0 + 56], fill=WHITE)
d.pieslice([sx0, sy0, sx0 + 52, sy0 + 52], 90, 270, fill=WHITE)
d.text((sx0 + 20, sy0 + 16), "‹  kpass", font=F(22, True), fill=DARK)

cy = sy0 + 74
CMAX = sx1 - sx0 - 70


def cbubble(text, side, cy):
    f = F(17); lines = wrap(text, f, CMAX - 28)
    bh = len(lines) * 24 + 20
    bw = min(CMAX, max((d.textlength(l, font=f) for l in lines), default=0) + 28)
    x0 = sx0 + 16 if side == "L" else sx1 - 16 - bw
    d.rounded_rectangle([x0, cy, x0 + bw, cy + bh], radius=14, fill=BUBBLE if side == "L" else YELLOW)
    ty = cy + 10
    for l in lines:
        d.text((x0 + 14, ty), l, font=f, fill=DARK if side == "L" else (40, 35, 10)); ty += 24
    return cy + bh + 12


cy = cbubble("Hi! Ask me about places, transit, payment or weather in Korea.", "L", cy)
cy = cbubble("Good cafes near Hongdae?", "R", cy)
cy = cbubble("Cafe Onion Anguk (Mapo-gu)\nCoffee Libre (Yeonnam)\n[ Directions ]", "L", cy)
cy = cbubble("Get to Gyeongbokgung?", "R", cy)
cy = cbubble("Subway Line 2 -> 3\n33 min, 1,650 KRW", "L", cy)
cy = cbubble("Air today?", "R", cy)
cy = cbubble("Seoul 24C, clear. Air: Good (PM2.5 5)", "L", cy)

# phone input bar (this is where the real input box is — so no footer fakery)
d.rounded_rectangle([sx0 + 16, sy1 - 56, sx1 - 64, sy1 - 16], radius=20, fill=WHITE)
d.text((sx0 + 32, sy1 - 47), "메시지 입력", font=F(17), fill=(150, 158, 170))
d.ellipse([sx1 - 56, sy1 - 56, sx1 - 16, sy1 - 16], fill=BLUE)
d.polygon([(sx1 - 44, sy1 - 44), (sx1 - 26, sy1 - 36), (sx1 - 44, sy1 - 28)], fill=WHITE)

# ================= RIGHT: description =================
rx = 510; ry = 268


def section(title, lines, ry):
    d.text((rx, ry), title, font=F(24, True), fill=BLUE); ry += 40
    for ln in lines:
        d.ellipse([rx, ry + 8, rx + 9, ry + 17], fill=CYAN)
        for i, w in enumerate(wrap(ln, F(20), W - rx - 50)):
            d.text((rx + 22, ry + i * 28), w, font=F(20), fill=(55, 65, 80))
        ry += 28 * max(1, len(wrap(ln, F(20), W - rx - 50))) + 12
    return ry + 18


ry = section("서비스 개요", [
    "방한 외국인이 막히는 교통·결제·장소·날씨를 영어로 한 번에 해결",
    "카카오톡/PlayMCP에서 버튼·대화로 이어가는 MCP 서버",
], ry)

ry = section("카카오맵 API 활용", [
    "키워드·카테고리 장소 검색으로 '가볼 만한 곳' 추천",
    "정해둔 목적지가 없어도 질문 몇 번으로 후보 장소 제안",
    "무료 쿼터 내 호출, 결과는 Markdown으로 정제 제공",
], ry)

ry = section("주요 기능", [
    "장소 검색 · 대중교통 경로(지하철+버스) · 실시간 버스/지하철",
    "결제 안내 · 지역 가이드 · 메뉴 번역 · 제주 관광 · 날씨+미세먼지",
], ry)

ry = section("개발 현황", [
    "TypeScript+Node, MCP 공식 SDK · 외부 데이터 실연동",
    "Kakao Agentic Player 10 출품작 · PlayMCP 등록 예정",
], ry)

# footer
d.line([(40, H - 60), (W - 40, H - 60)], fill=(224, 230, 238), width=2)
d.text((40, H - 48), "대표 도메인: https://github.com/bb4rjfl/korea-trip-concierge", font=F(19), fill=GRAY)

out = r"C:\Users\user\Downloads\kpass-service-screen.png"
img.save(out, "PNG")
import os
print("saved", out, os.path.getsize(out), "bytes", img.size)
