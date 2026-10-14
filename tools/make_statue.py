# P1 の「神々の像」（北のフィールドの外）のドット絵を、ユーザーからもらった画像（FF6 の神々の像。2026-10-14）から作る
# 元の画像はリポジトリに入れない。出来上がったドット絵（public/img/p1/statue.png。縦長の1枚）だけを入れる
# 使い方：python3 tools/make_statue.py <元画像（355×679 の gif）>
# しくみ：暗い背景・黄色い雲・横の白い雲の筋を除いて、像の中心からつながった所だけを切り抜く → 残った雲を場所で消す
#   → マスごとに像の部分だけの平均の色（少し鮮やかに）→ 1マス外側に濃い輪郭
import sys, os
from collections import deque
from PIL import Image, ImageFilter
import numpy as np

SRC = sys.argv[1]
a = np.asarray(Image.open(SRC).convert('RGB')).astype(int); H, W = a.shape[:2]
r, g, b = a[..., 0], a[..., 1], a[..., 2]
lum = a.mean(2); sat = a.max(2) - a.min(2)
dark = lum < 38
yellow = (r > 90) & (g > 80) & (b < .6 * g)
fg = ~dark & ~yellow
fg &= ~(np.roll(dark, 4, 0) & np.roll(dark, -4, 0))  # 上下が暗い明るい点＝雲の筋
fg = np.asarray(Image.fromarray((fg * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))) > 0
m = np.zeros_like(fg); q = deque()
for sy, sx in [(350, 160), (600, 120), (100, 170)]:
  if fg[sy, sx] and not m[sy, sx]: m[sy, sx] = True; q.append((sy, sx))
while q:
  y, x = q.popleft()
  for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
    ny, nx = y + dy, x + dx
    if 0 <= ny < H and 0 <= nx < W and fg[ny, nx] and not m[ny, nx]: m[ny, nx] = True; q.append((ny, nx))
yy, xx = np.mgrid[0:H, 0:W]
m &= ~(yy < 38) & ~((xx < 75) & (yy < 210)) & ~((xx > 225) & (yy < 75)) & ~((yy > 600) & ((xx < 45) | (xx > 215)))
cloud = (lum > 150) & (sat < 40)
m &= ~(cloud & (((xx > 225) & (yy > 235) & (yy < 300)) | (yy > 615) | ((xx < 45) & (yy > 440) & (yy < 480))))
# 像は3段：下＝第一楽章、中＝第二楽章、上＝第三楽章（ユーザーの説明 2026-10-14）。1枚の縦長のドット絵にして、楽章ごとに見える所（窓）を下から上へずらす（塔を上る）
SC = 5.5                                   # 元の画像の 5.5 ドット → 1マス
x0, y0, x1, y1 = 0, 30, 305, 679
w, h = round((x1 - x0) / SC), round((y1 - y0) / SC)
out = np.zeros((h + 2, w + 2, 4), 'uint8')
for j in range(h):
  for i in range(w):
    ya, yb, xa, xb = int(y0 + j * SC), int(y0 + (j + 1) * SC), int(x0 + i * SC), int(x0 + (i + 1) * SC)
    mm = m[ya:yb, xa:xb]
    if mm.size == 0 or mm.mean() < .4: continue
    col = a[ya:yb, xa:xb][mm].mean(0); gr = col.mean(); col = np.clip(gr + (col - gr) * 1.4, 0, 255)
    out[j + 1, i + 1] = (*col.astype('uint8'), 255)
al = out[..., 3] > 0; ol = np.zeros_like(al)
for dy in (-1, 0, 1):
  for dx in (-1, 0, 1): ol |= np.roll(np.roll(al, dy, 0), dx, 1)
out[ol & ~al] = (16, 12, 20, 255)
f = os.path.join(os.path.dirname(__file__), '..', 'public', 'img', 'p1', 'statue.png')
os.makedirs(os.path.dirname(f), exist_ok=True)
Image.fromarray(out).save(f, optimize=True)
# 楽章ごとの窓の上の端（絵の中の行）：上の段（元 y=35）・中の段（220）・下の段（425）
print(f, out.shape[1], 'x', out.shape[0], '窓の上端', {n:round((yy - y0) / SC) for n, yy in ((3, 35), (2, 220), (1, 425))})
