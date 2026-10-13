# ジョブアイコン（8bit の線画）：20×20 の座標で、線と円だけで記号を描く。描く大きさ G に合わせて座標を縮める
# 2026-10-13 ユーザーが決定。上の5つ（盾・剣・カード・メガネ・つめあと）はユーザーのイメージ画像の記号、
# 下の3つ（リーパー・機工士・黒魔道士）は実機のアイコンにマス目を重ねて線の通り道を読み取ったもの（画像は使わない）
# 使い方：python3 tools/make_job_icons.py → public/img/icon/job/<ジョブ>.png（28×28）と <ジョブ>_s.png（15×15・フィールドの自キャラ）
from PIL import Image
def grid(G):
    g = [[0] * G for _ in range(G)]
    s = (G - 1) / 19
    P = lambda x, y: (round(x * s), round(y * s))
    def put(x, y):
        if 0 <= x < G and 0 <= y < G: g[y][x] = 1
    def line(x0, y0, x1, y1, w=1):
        (a, b), (c, d) = P(x0, y0), P(x1, y1)
        dx, dy, sx, sy = abs(c - a), -abs(d - b), 1 if a < c else -1, 1 if b < d else -1
        e = dx + dy
        while True:
            put(a, b)
            if w > 1: put(a + 1, b)
            if a == c and b == d: break
            e2 = 2 * e
            if e2 >= dy: e += dy; a += sx
            if e2 <= dx: e += dx; b += sy
    def circle(cx, cy, r):
        (X, Y) = P(cx, cy); R = max(1, round(r * s))
        x, y, err = R, 0, 1 - R
        while x >= y:
            for a, b in [(x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)]: put(X + a, Y + b)
            y += 1
            if err < 0: err += 2 * y + 1
            else: x -= 1; err += 2 * (y - x) + 1
    def clear(x0, y0, x1, y1):
        (a, b), (c, d) = P(x0, y0), P(x1, y1)
        for y in range(b, d + 1):
            for x in range(a, c + 1):
                if 0 <= x < G and 0 <= y < G: g[y][x] = 0
    def poly(pts, w=1):
        for (a, b), (c, d) in zip(pts, pts[1:]): line(a, b, c, d, w)
    return g, line, circle, clear, poly

def pld(G):   # 盾（外形と真ん中の縦線）
    g, line, circle, clear, poly = grid(G)
    poly([(3, 2), (17, 2), (17, 10), (10, 18), (3, 10), (3, 2)])
    line(10, 3, 10, 17)
    return g
def drk(G):   # 下を向いた剣（つばと柄頭）
    g, line, circle, clear, poly = grid(G)
    line(9, 6, 9, 17, 2); line(9.5, 18, 9.5, 19)
    line(4, 6, 15, 6); line(4, 5, 4, 7); line(15, 5, 15, 7)
    line(9, 1, 9, 4, 2)
    return g
def sch(G):   # メガネ（2つの輪）
    g, line, circle, clear, poly = grid(G)
    circle(5, 10, 4); circle(14, 10, 4); line(9, 9, 10, 9)
    return g
def ast(G):   # 重なった2枚のカード
    g, line, circle, clear, poly = grid(G)
    poly([(7, 2), (16, 2), (16, 14), (7, 14), (7, 2)])
    clear(3, 5, 12, 17)
    poly([(3, 5), (12, 5), (12, 17), (3, 17), (3, 5)])
    return g
def mnk(G):   # 3本のつめあと
    g, line, circle, clear, poly = grid(G)
    line(2, 12, 9, 3, 2); line(5, 16, 13, 6, 2); line(9, 18, 16, 10, 2)
    return g
def rpr(G):   # 元の絵をマス目で読み取って線にした：上から左下へ抜ける線、右上の輪とその上のとげ、左から右へ払う刃、左の短いとげ
    g, line, circle, clear, poly = grid(G)
    poly([(9.8, 1), (8.5, 6), (7, 11), (5, 17.5)])
    circle(11, 8, 3.2)
    line(12.5, 5, 13, 3.3)
    poly([(4.5, 12.5), (6.5, 13.8), (9.5, 14), (13, 13), (17.5, 11.5)])
    line(4.6, 9, 5.6, 12.5)
    return g
def mch(G):   # 元の絵をマス目で読み取って線にした：左上から右下への2本の銃身と、下の S 字の握り
    g, line, circle, clear, poly = grid(G)
    poly([(4.5, 1.2), (16, 9.2), (13.5, 10.5)])
    poly([(4.5, 4.8), (10, 8.3), (10.5, 10.5), (9, 11.5), (8.3, 10.3)])
    poly([(13.5, 10.5), (12.5, 12), (14, 13.5), (14.5, 15.2), (13.2, 16.5), (11.5, 14)])
    return g
def blm(G):   # 元の絵をマス目で読み取って線にした：左下の輪と、右上へ燃え上がる3本の炎
    g, line, circle, clear, poly = grid(G)
    circle(7.5, 13.2, 4.8)
    poly([(3.5, 10), (6, 6), (10.3, 1.8), (10.3, 4.6), (13, 4.7), (18.5, 1.2), (15.5, 6), (13.2, 8.6), (17.5, 8.8), (14.5, 12), (12.3, 14.5)])
    return g
JOBS = [('pld', 'tank', pld), ('drk', 'tank', drk), ('ast', 'healer', ast), ('sch', 'healer', sch), ('mnk', 'dps', mnk), ('rpr', 'dps', rpr), ('mch', 'dps', mch), ('blm', 'dps', blm)]
ROLE = { 'tank':((30, 44, 120), (90, 130, 255), (255, 255, 255)), 'healer':((26, 72, 36), (90, 190, 90), (255, 255, 255)), 'dps':((90, 28, 32), (220, 90, 80), (255, 220, 110)) }
def icon(fn, role, N, G):
    dark, light, ink = ROLE[role]
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); px = im.load(); rad = 2 if N < 20 else 3; bw = 1 if N < 20 else 2
    def inside(x, y, m, r):
        a, b = m, N - 1 - m; cx = min(max(x, a + r), b - r); cy = min(max(y, a + r), b - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + .5
    for y in range(N):
        for x in range(N):
            if not inside(x, y, 0, rad): continue
            px[x, y] = (10, 10, 18, 255) if not inside(x, y, 1, rad - 1) else light + (255,) if not inside(x, y, 1 + bw, max(1, rad - 1)) else dark + (255,)
    g = fn(G); off = (N - G) // 2
    for y in range(G):
        for x in range(G):
            if g[y][x]: px[off + x, off + y] = ink + (255,)
    return im
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img', 'icon', 'job')
os.makedirs(OUT, exist_ok=True)
for k, role, fn in JOBS:
    icon(fn, role, 28, 20).save(os.path.join(OUT, k + '.png'), optimize=True)
    icon(fn, role, 15, 11).save(os.path.join(OUT, k + '_s.png'), optimize=True)
print('ok')
