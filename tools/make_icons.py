# スキル・バフ／デバフのアイコンを、ユーザーからもらった実機の画像を元にドット絵にする（2026-10-13 ユーザー了承）
# 元の画像はリポジトリに入れない。出来上がったドット絵（public/img/icon/）だけを入れる
# 使い方：python3 tools/make_icons.py <元画像のフォルダ（B1・B2 が入っている所）> <P3 の炎・水の絵のフォルダ> [段階 1〜5] [出力先]
#   段階（解像度）：1＝スキル 20・状態異常 18×20 … 5＝スキル 40・状態異常 36×40（下の LEVELS）
#   P3 の炎・水（fireP3.png・waterP3.png）は、アプリの p4IconUrl('fireP3') などを PNG にしたもの
# 状態異常の形：デバフはホームベース型（下がとがる）、バフは逆ホームベース型（上がとがる）。形は実機のデバフ画像の輪郭をそのまま使う
import sys, os, glob, unicodedata
from PIL import Image, ImageFilter, ImageOps

SRC, EXTRA = sys.argv[1], sys.argv[2]
LEVEL = int(sys.argv[3]) if len(sys.argv) > 3 else 3  # ユーザーが5段階の見本から3（28）を選んだ（2026-10-13）
OUT = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(__file__), '..', 'public', 'img', 'icon')
# 段階ごとの大きさと色の数：(スキルの1辺, 状態異常の幅, 高さ, 色の数)
LEVELS = {1:(20, 18, 20, 16), 2:(24, 22, 24, 20), 3:(28, 25, 28, 24), 4:(32, 29, 32, 28), 5:(40, 36, 40, 32)}
SK, SW, SH, COLORS = LEVELS[LEVEL]
N = lambda s: unicodedata.normalize('NFC', s)
files = {N(os.path.relpath(f, SRC)): f for f in glob.glob(os.path.join(SRC, '**', '*.*'), recursive=True)}

def find(rel):
    rel = N(rel)
    for k, f in files.items():
        if os.path.splitext(k)[0] == rel: return f
    raise SystemExit('見つからない: ' + rel)

def load(rel): return Image.open(find(rel)).convert('RGBA')
def trim(im): return im.crop(im.split()[3].point(lambda v: 255 if v > 110 else 0).getbbox()) # 透明な余白を切る

def dot(im, size, colors=COLORS):
    small = im.resize(size, Image.LANCZOS)
    a = small.split()[3]
    q = small.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGBA')
    q.putalpha(a.point(lambda v: 255 if v > 110 else 0))
    return q

def save(im, sub, name):
    d = os.path.join(OUT, sub); os.makedirs(d, exist_ok=True)
    im.save(os.path.join(d, name + '.png'), optimize=True)

# ---- 状態異常の枠：実機のデバフ（水属性圧縮）の輪郭と縁を型にする ----
TPL = trim(load('B1/P4/IMG_3767'))
TW, TH = TPL.size
SHAPE = TPL.split()[3].point(lambda v: 255 if v > 110 else 0)
INNER = SHAPE.filter(ImageFilter.MinFilter(5))  # 縁（2ドット）の内側
def framed(art, up):
    # art を枠の内側いっぱいに広げ、実機と同じ黒い縁を付ける。up=True で逆ホームベース（バフ）
    shape, inner, rim = (ImageOps.flip(SHAPE), ImageOps.flip(INNER), ImageOps.flip(TPL)) if up else (SHAPE, INNER, TPL)
    bx = inner.getbbox(); w, h = bx[2] - bx[0], bx[3] - bx[1]
    k = max(w / art.width, h / art.height); a = art.resize((round(art.width * k), round(art.height * k)), Image.LANCZOS)
    body = Image.new('RGBA', (TW, TH), (0, 0, 0, 0))
    body.paste(a, (bx[0] + (w - a.width) // 2, bx[1] + (h - a.height) // 2))
    out = Image.composite(body, rim, inner)            # 内側は絵、縁は型のまま
    out.putalpha(shape)
    return out

# ---- スキル（B2）：ボタンの絵 ----
SKILL = {
    'pld_fast':'B2/ナイト/ファストブレード', 'pld_riot':'B2/ナイト/ライオットソード', 'pld_royal':'B2/ナイト/ロイヤルアサリティ', 'pld_expi':'B2/ナイト/エクスピアシオン',
    'pld_rampart':'B2/ナイト/ランパート', 'pld_invuln':'B2/ナイト/インビジブル', 'pld_guard':'B2/ナイト/エクストリームガード', 'pld_provoke':'B2/ナイト/挑発', 'pld_shirk':'B2/ナイト/シャーク',
    'drk_hard':'B2/暗黒騎士/ハードスラッシュ', 'drk_syphon':'B2/暗黒騎士/サイフォンストライク', 'drk_souleater':'B2/暗黒騎士/ソウルイーター', 'drk_bringer':'B2/暗黒騎士/シャドウブリンガー',
    'drk_edge':'B2/暗黒騎士/漆黒の剣', 'drk_rampart':'B2/暗黒騎士/ランパート', 'drk_living':'B2/暗黒騎士/リビングデッド', 'drk_vigil':'B2/暗黒騎士/シャドウヴィジル',
    'drk_provoke':'B2/暗黒騎士/挑発', 'drk_shirk':'B2/暗黒騎士/シャーク',
    'rpr_slice':'B2/リーパー/スライス', 'rpr_waxing':'B2/リーパー/ワクシングスライス', 'rpr_infernal':'B2/リーパー/インファナルスライス',
    'ast_malefic':'B2/占星術師/マレフィガ', 'ast_helios':'B2/占星術師/コンジャクションヘリオス', 'ast_cu':'B2/占星術師/運命の輪', 'ast_ns':'B2/占星術師/ニュートラルセクト',
    'ast_sun':'B2/占星術師/サンサイン', 'ast_bene':'B2/占星術師/ベネフィラ',
    'sch_broil':'B2/学者/獄炎法', 'sch_concit':'B2/学者/意気軒昂の策', 'sch_soil':'B2/学者/野戦治療の陣', 'sch_exped':'B2/学者/疾風怒濤の計', 'sch_adlo':'B2/学者/鼓舞激励の策',
    # 機工士：黄色＝ドリル、グレー＝チェックメイト、青＝ダブルチェック（2026-10-13 ユーザーが教えてくれた）。コンボの3つは絵から推測
    'mch_split':'B2/機工/IMG_3745', 'mch_slug':'B2/機工/IMG_3746', 'mch_clean':'B2/機工/IMG_3747',
    'mch_drill':'B2/機工/IMG_3748', 'mch_checkmate':'B2/機工/IMG_3749', 'mch_double':'B2/機工/IMG_3750',
    # 黒魔道士の番号の画像は絵から推測（違っていたら直す）
    'blm_fire':'B2/黒魔道士/IMG_3751', 'blm_triple':'B2/黒魔道士/IMG_3752', 'blm_swift':'B2/黒魔道士/IMG_3753', 'blm_xeno':'B2/黒魔道士/IMG_3754',
    # モンク（2026-10-13 ユーザーが追加。4枚を左から A・B・Y・X）
    'mnk_a':'B2/モンク/猿舞連撃', 'mnk_b':'B2/モンク/竜頷正拳撃', 'mnk_y':'B2/モンク/虎襲崩拳', 'mnk_x':'B2/モンク/陰陽闘気斬',
    # 足りなかった4つ（2026-10-13 ユーザーが追加）
    'pld_imperator':'B2/ナイト/インペラトル', 'pld_circle':'B2/ナイト/サークル・オブ・ドゥーム', 'drk_carve':'B2/暗黒騎士/カーヴ・アンド・スピット', 'rpr_stalk':'B2/リーパー/ストークスウェーズ',
}
for k, rel in SKILL.items(): save(dot(load(rel), (SK, SK)), 'skill', k)

# ---- デバフ（B1）：実機の画像そのまま（余白を切って縮める）。番号の画像は絵から推測 ----
STATUS = {
    'water':'B1/P4/IMG_3767', 'fork':'B1/P4/IMG_3768', 'shriek':'B1/P4/IMG_3769', 'bomb':'B1/P4/IMG_3770',
    'dead':'B1/P4/IMG_3773', 'live':'B1/P4/IMG_3774', 'field':'B1/P4/IMG_3775', 'beyond':'B1/P4/IMG_3776',
    'fireDown':'B1/P5/IMG_3787', 'iceDown':'B1/P5/IMG_3788', 'thunderDown':'B1/P5/IMG_3789',
    # オーケストラのタンクのデバフ：オレンジ＝フレア、白っぽい青＝ホーリー（2026-10-13 ユーザーが教えてくれた。被魔法ダメージ増加の絵はまだない）
    'flare':'B1/P5/IMG_3785', 'holy':'B1/P5/IMG_3786',
    # P1：ゲームデータ（XIVAPI）のアイコンを P1/ に置いて使う（docs/dmu/research-p1.md §1）
    'tele_u':'P1/214401', 'tele_d':'P1/214402', 'tele_r':'P1/214403', 'tele_l':'P1/214404', 'trap':'P1/214406',
    'confused':'P1/215603', 'sleep':'P1/215013',
}
for k, rel in STATUS.items(): save(dot(trim(load(rel)).resize((TW, TH), Image.LANCZOS), (SW, SH)), 'status', k)
# P4 の混沌の炎・水は P3 の絵（中身だけ）をホームベース型の枠に入れる
for k, f in {'flame':'fireP3', 'wave':'waterP3'}.items():
    art = Image.open(os.path.join(EXTRA, f + '.png')).convert('RGBA').crop((4, 4, 26, 28))
    save(dot(framed(art, False), (SW, SH)), 'status', k)

# ---- バフ：スキルの絵を逆ホームベース型の枠に入れる ----
BUFF = {
    'rampart':'B2/ナイト/ランパート', 'invuln':'B2/ナイト/インビジブル', 'guardian':'B2/ナイト/エクストリームガード',
    'vigil':'B2/暗黒騎士/シャドウヴィジル',
    'soil':'B2/学者/野戦治療の陣', 'exped':'B2/学者/疾風怒濤の計', 'galv':'B2/学者/意気軒昂の策', 'adlo':'B2/学者/鼓舞激励の策',
    'cu':'B2/占星術師/運命の輪', 'helios':'B2/占星術師/コンジャクションヘリオス', 'ns':'B2/占星術師/ニュートラルセクト', 'sun':'B2/占星術師/サンサイン', 'b2':'B2/占星術師/ベネフィラ',
    'triple':'B2/黒魔道士/IMG_3752', 'swift':'B2/黒魔道士/IMG_3753',
}
for k, rel in BUFF.items(): save(dot(framed(load(rel), True), (SW, SH)), 'buff', k)
# 暗黒騎士のリビングデッドの流れ（リビングデッド → ウォーキングデッド → デッドリバース）は、実機のバフ画像（もう逆ホームベース型）を余白を切って縮めるだけ
REAL_BUFF = {'living':'B2/暗黒騎士/リビングデッドバフ', 'walking':'B2/暗黒騎士/ウォーキングデッド', 'rebirth':'B2/暗黒騎士/デッドリバース'}
for k, rel in REAL_BUFF.items(): save(dot(trim(load(rel)).resize((TW, TH), Image.LANCZOS), (SW, SH)), 'buff', k)
print('ok 段階', LEVEL, 'スキル', SK, '状態異常', SW, 'x', SH)
