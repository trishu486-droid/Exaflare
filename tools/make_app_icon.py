# ホーム画面のアイコン（public/icon-512・192・180.png）を、ユーザーからもらった実機のムービーの1コマ（クリア後のケフカ）から
# ドット絵にして作る（2026-10-14 ユーザー了承。48マスの版を採用）。元の画像はリポジトリに入れない
# 使い方：python3 tools/make_app_icon.py <元画像（600×328 の jpg）> [出力先フォルダ]
# しくみ：ケフカの絵はもともとドット絵なので、そのドットの格子（2.5 前後）と位置のずれを探して1マスずつ読み取り、
#   決まった色（金髪・白・赤・緑・青・紫など）に寄せる。背景（空と舞台）は同じ格子でならして色を減らす
import sys, os, itertools
from PIL import Image, ImageFilter
import numpy as np

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'public')
CELLS = 48
im = np.asarray(Image.open(SRC).convert('RGB').filter(ImageFilter.MedianFilter(3))).astype(float) # JPEG のにじみをならす
PAL = np.array([(20,16,24),(250,250,250),(250,206,170),(250,228,140),(214,166,84),(236,58,34),(250,128,52),
  (150,36,36),(70,190,70),(28,110,44),(60,120,236),(130,206,250),(160,70,206),(236,126,206)], float)
SPR = (262, 136, 336, 217)   # ケフカのいる範囲（元画像の座標）

def grid(S, ox, oy):
  xs = np.arange(SPR[0] + ox, SPR[2], S); ys = np.arange(SPR[1] + oy, SPR[3], S)
  cells, err = {}, 0
  for j, y in enumerate(ys):
    for i, x in enumerate(xs):
      c = im[int(y + S * .3):int(y + S * .7) + 1, int(x + S * .3):int(x + S * .7) + 1].reshape(-1, 3).mean(0)
      if not (c.max() > 120 or c.max() - c.min() > 70 or c.max() < 30): continue # 背景
      d = ((PAL - c) ** 2).sum(1); k = d.argmin(); err += d[k] ** .5
      cells[(i, j)] = k
  return cells, err / max(1, len(cells))

# 格子の大きさとずれ：決まった色との差がいちばん小さいもの
best = min(((grid(S, ox, oy), S, ox, oy) for S in np.arange(2.15, 2.55, .05) for ox, oy in itertools.product(np.arange(0, S, .35), repeat=2)), key=lambda b: b[0][1])
(cells, _), S, ox, oy = best
nx = int((SPR[2] - SPR[0]) / S) + 1; ny = int((SPR[3] - SPR[1]) / S) + 1
di, dj = (CELLS - nx) // 2, CELLS - ny - 2
X0, Y0 = SPR[0] + ox - S * di, SPR[1] + oy - S * dj
bg = np.zeros((CELLS, CELLS, 3))
for j in range(CELLS):
  for i in range(CELLS):
    x, y = max(0, X0 + i * S), max(0, Y0 + j * S)
    bg[j, i] = im[int(y):int(y + S) + 1, int(x):int(x + S) + 1].reshape(-1, 3).mean(0)
out = np.asarray(Image.fromarray(bg.astype('uint8')).quantize(colors=10, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')).copy()
for (i, j), k in cells.items():
  if 0 <= i + di < CELLS and 0 <= j + dj < CELLS: out[j + dj, i + di] = PAL[k]
dot = Image.fromarray(out.astype('uint8'))

# 書き出し：マスがそろうように整数倍に広げてから、中央を切り出す
def emit(size, name):
  k = -(-size // CELLS); big = dot.resize((CELLS * k, CELLS * k), Image.NEAREST); o = (CELLS * k - size) // 2
  big.crop((o, o, o + size, o + size)).save(os.path.join(OUT, name), optimize=True)
emit(512, 'icon-512.png'); emit(192, 'icon-192.png'); emit(180, 'icon-180.png')
print('格子', round(S, 2), 'ずれ', round(ox, 2), round(oy, 2))
