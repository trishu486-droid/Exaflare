// @ts-nocheck
// ===== P1（ケフカ）の3つのギミックで共通の部品。docs/dmu/research-p1.md =====
// 座標：中心 (0,0)・半径 20・北が −z（ほかのフェーズと同じ）。味方7人は正しく動く（P2 と同じ作り）
import { paintSky, SKY_BASE } from './sky.js';
import { S } from './state.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, px, fillArena, glyph } from './gfx.js';
import { tellQuad, tellBand } from './p4fx.js';

const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
const TH = ['MT', 'ST', 'H1', 'H2'], DPS = ['D1', 'D2', 'D3', 'D4'];
const roleOf = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];
const isTH = k => TH.includes(k);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const add = (a, b) => ({ x:a.x + b.x, z:a.z + b.z });
const at = (deg, r) => ({ x:Math.sin(deg * Math.PI / 180) * r, z:-Math.cos(deg * Math.PI / 180) * r }); // 北0・時計回り
const OFF = (k, r = .7) => at(SLOTS.indexOf(k) * 45 + 22.5, r); // 固まるときの1人ずつのずれ
const BOT_SPEED = 24; // 味方は少し先回りして速く動く（P2 と同じ）

// ---- フィールドマーカー（P1 はヤーン速報の図：A〜D が中心から 14、1〜4 が (±9.3,±9.3)。1＝北西から時計回り） ----
const MARKERS = { card:14, num:13.2, corner:'nw' };
const WM = { A:{ x:0, z:-14 }, B:{ x:14, z:0 }, C:{ x:0, z:14 }, D:{ x:-14, z:0 }, 1:{ x:-9.3, z:-9.3 }, 2:{ x:9.3, z:-9.3 }, 3:{ x:9.3, z:9.3 }, 4:{ x:-9.3, z:9.3 } };

// ---- 道のり：{ until, spot(k) } の並び。味方は次の場所へ「間に合う時刻」に動き出す ----
function makeRoutes(steps){
  const spotAt = (k, t) => { const s = steps.find(w => t < w.until) ?? steps[steps.length - 1]; return s.spot(k, t); };
  const botGoal = (k, t) => {
    const n = steps.findIndex(w => t < w.until);
    if (n <= 0) return spotAt(k, t);
    const prev = steps[n - 1].spot(k, t), next = steps[n].spot(k, t);
    return t >= steps[n].until - dist(prev, next) / BOT_SPEED - .05 ? next : prev;
  };
  return { spotAt, botGoal };
}
const stepBots = (bots, goal, t, dt) => bots.forEach(b => {
  if (b.lock?.(t)) return; // 混乱・睡眠・ノックバック中は自分で動けない
  const g = goal(b.k, t), d = dist(b, g);
  if (d > .05){ const k = Math.min(1, BOT_SPEED * dt / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; }
});

// ---- 味方の絵（P2 と同じ：ロールの色の札に MT・H1 などの文字） ----
const ROLE_COL = { T:'#3a6ad8', H:'#3aa84e', D:'#d8404e' };
const FONT = { M:'101111111101101', T:'111010010010010', S:'011100010001110', H:'101101111101101', D:'110101101101110',
  1:'010110010010111', 2:'110001010100111', 3:'110001010001110', 4:'101101111001001' };
function drawBot(b){
  const X = px(b.x), Z = px(b.z);
  rect(X - 6, Z - 4, 13, 9, P.white); rect(X - 5, Z - 3, 11, 7, ROLE_COL[roleOf(b.k)]);
  [...b.k].forEach((ch, i) => { const g = FONT[ch]; for (let n = 0; n < 15; n++) if (g[n] === '1') rect(X - 4 + i * 4 + (n % 3), Z - 2 + (n / 3 | 0), 1, 1, P.white); });
}

// ---- なぞなぞマジック（P4 と同じ形：docs/dmu/research-p4.md §3） ----
// ひろげるブリザガ：斜め4方向の 90° の扇（0＝北東 1＝南東 2＝南西 3＝北西）。向かい合う2つが予兆。嘘なら予兆のない2つが当たる
// もりもりサンダガ：幅10の斜めの帯4本（s＝(o·x＋z)/√2 の中心 15/5/−5/−15）。1本おきの2本が予兆。嘘なら予兆のない2本が当たる
// めらめらファイガ：散開（全員・半径5）か頭割り（タンヒラ1人・DPS1人）。頭上のマーカーが見えている方。嘘なら逆
const bearing = p => (Math.atan2(p.x, -p.z) * 180 / Math.PI + 360) % 360;
const quadOf = p => Math.min(3, Math.floor(bearing(p) / 90));
const quadSpan = q => z => (q === 0 || q === 3) ? (z <= 0 ? (q === 0 ? [0, 99] : [-99, 0]) : null) : (z >= 0 ? (q === 1 ? [0, 99] : [-99, 0]) : null);
const BAND_C = [15, 5, -5, -15];
const bandS = (o, p) => (o * p.x + p.z) / Math.SQRT2;
const bandSpan = (o, c) => z => { const lo = (c - 5) * Math.SQRT2 - z, hi = (c + 5) * Math.SQRT2 - z; return o > 0 ? [lo, hi] : [-hi, -lo]; };
const inBand = (o, c, p) => Math.abs(bandS(o, p) - c) <= 5;
const iceTell = m => [0, 1, 2, 3].filter(q => (q + m.iceOff) % 2 === 0);
const iceHits = m => [0, 1, 2, 3].filter(q => ((q + m.iceOff) % 2 === 0) === m.iceTrue);
const thTell = m => [0, 1, 2, 3].filter(i => (i + m.thOff) % 2 === 0);
const thHits = m => [0, 1, 2, 3].filter(i => ((i + m.thOff) % 2 === 0) === m.thTrue);
const iceHit = (m, q) => iceHits(m).includes(quadOf(q));
const thHit = (m, q) => thHits(m).some(i => inBand(m.thO, BAND_C[i], q));
const rollMystery = () => ({ iceTrue:Math.random() < .5, iceOff:Math.random() < .5 ? 0 : 1, thTrue:Math.random() < .5, thOff:Math.random() < .5 ? 0 : 1, thO:Math.random() < .5 ? 1 : -1,
  fireStack:Math.random() < .5, fireTrue:Math.random() < .5 });
// 予兆の床（P4 と同じ：ひし形の柄。p4fx.ts の tellQuad・tellBand）
function drawTell(m, ice, th){
  if (ice) iceTell(m).forEach(q => tellQuad(q, quadSpan(q)));
  if (th) thTell(m).forEach(i => tellBand(bandSpan(m.thO, BAND_C[i])));
}
// 着弾の白い光（当たった所）
const drawHitFlash = (m, ice, th) => { if (ice) iceHits(m).forEach(q => fillArena(quadSpan(q), '#a8e8ff')); if (th) thHits(m).forEach(i => fillArena(bandSpan(m.thO, BAND_C[i]), '#ff9ae8')); };
// 雷・氷のエフェクト（p4fx.ts）に渡す形
const thunderSegs = m => { const n = { x:m.thO / Math.SQRT2, z:1 / Math.SQRT2 }, d = { x:1 / Math.SQRT2, z:-m.thO / Math.SQRT2 }, segs = []; thHits(m).forEach(i => [-3, 0, 3].forEach(o => { const c = BAND_C[i] + o, u = Math.sqrt(Math.max(0, 400 - c * c)); segs.push([{ x:n.x * c - d.x * u, z:n.z * c - d.z * u }, { x:n.x * c + d.x * u, z:n.z * c + d.z * u }]); })); return segs; };
const icePts = m => { const pts = []; iceHits(m).forEach(qq => { for (let j = 0; j < 7; j++) pts.push(at(qq * 90 + 12 + j * 11, 5 + (j * 7) % 14)); }); return pts; };

// 真偽の玉（青＝本当、？の赤＝嘘）。P4 と同じ絵
function orb(X, Y, truth, big = false){
  const r = big ? 7 : 5;
  disc(X, Y, r + 1, '#101018');
  if (truth){ disc(X, Y, r, '#3aa8ff'); disc(X, Y, r - 2, '#6ac8ff'); disc(X - 2, Y - 2, 1, '#ffffff'); }
  else { disc(X, Y, r, '#e8283a'); const q = r >= 7 ? 2 : 1;
    rect(X - q, Y - 2 * q - 1, 3 * q, q, '#fff'); rect(X + q, Y - q - 1, q, q, '#fff'); rect(X, Y - 1, q, q, '#fff'); rect(X, Y + q, q, q, '#fff'); }
}
function kefkaOrbs(iceT, thT, fireT = null){
  const X = px(0), Y = px(0), a = performance.now() / 300, rx = 16, ry = 4, spark = Math.floor(performance.now() / 120);
  // 輪の色は組み合わせで変わる（ユーザーがくれた実機の画像。2026-10-14）
  //   ブリザガ＋サンダガ：上の紫＝サンダガ、下の青＝ブリザガ（P4 と同じ）
  //   ブリザガ＋ファイガ：金のオレンジ＝ファイガ、白っぽい水色＝ブリザガ
  //   サンダガ＋ファイガ：金のオレンジ＝ファイガ、青白い電気（紫の火花）＝サンダガ
  const fire = fireT !== null;
  const ringOrb = (Yc, cols, truth, ph) => {
    for (let i = 0; i < 64; i++) rect(X + Math.round(Math.cos(i * Math.PI / 32) * rx), Yc + Math.round(Math.sin(i * Math.PI / 32) * ry), 2, 1, cols[(i + spark) % cols.length]);
    orb(X + Math.round(Math.cos(a + ph) * rx), Yc + Math.round(Math.sin(a + ph) * ry), truth);
  };
  // 輪は上下2本で、間隔は P4 と同じ（上 Y−12・下 Y+4）。ファイガがあるときはファイガが上
  if (fire) ringOrb(Y - 12, ['#ffa828', '#ffa828', '#ffd060'], fireT, 0);
  if (thT !== null) ringOrb(fire ? Y + 4 : Y - 12, fire ? ['#c8dcff', '#c8dcff', '#ffffff', '#c8dcff', '#a070ff'] : ['#c05aff'], thT, fire ? Math.PI : 0);
  if (iceT !== null) ringOrb(Y + 4, fire ? ['#e8f8ff', '#e8f8ff', '#a8e0ff'] : ['#5ab0ff'], iceT, Math.PI);
}
// ---- めらめらファイガ（ユーザーがくれた実機の画像・動画に合わせた。2026-10-15） ----
// 点ごとに描いた小さな絵を一度だけ作って使い回す（毎フレーム点を打つと重いので）
const sprite = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  fn((x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); }); return c; };
// 散開の頭上マーカー：金のふちに黒白の目盛りの横長の輪（真ん中は暗い）＋上に桃色の下向き三角
const SPREAD_ART = sprite(19, 22, P1 => {
  const X = 9, Y = 13, RX = 8, RY = 7;
  for (let dy = -RY - 1; dy <= RY + 1; dy++) for (let dx = -RX - 1; dx <= RX + 1; dx++){
    const e = Math.hypot(dx / RX, dy / RY); if (e > 1.08) continue;
    const a = Math.atan2(dy, dx);
    P1(X + dx, Y + dy, e > .86 ? (e > 1 ? '#c86a10' : Math.floor((a + Math.PI) / (2 * Math.PI) * 20) % 2 ? '#201008' : '#fff0c8') : e > .7 ? '#f0b030' : e > .58 ? '#ffe070' : e > .3 ? '#2a1010' : '#5a2a1a');
  }
  for (let k = 0; k < 6; k++){ const hw = 5 - k; for (let dx = -hw; dx <= hw; dx++) P1(X + dx, Y - 9 + k, Math.abs(dx) === hw ? '#c02068' : k < 3 ? '#e8408a' : '#ff7ab8'); }
});
function spreadMark(q){ ctx.drawImage(SPREAD_ART, px(q.x) - 9, px(q.z) - 32); }
// 頭割りのマーカー：P5 ミッシングと同じ形（4方向から内向きの「く」の字が人を囲む・点滅。ユーザー 2026-10-15）
// sec があれば右上に残り秒数（P5 ミッシングと同じ）
function stackMark(q, sec = null){
  const X = px(q.x), Z = px(q.z), c = (Math.floor(performance.now() / 160) & 1) ? '#ffe08a' : '#ff7a1f';
  [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dz]) => { for (let i = 0; i < 6; i++){ const bx = X + dx * (10 + i), bz = Z + dz * (10 + i); rect(bx - dz * i - 1, bz - dx * i - 1, 2, 2, c); rect(bx + dz * i - 1, bz + dx * i - 1, 2, 2, c); } });
  if (sec != null && sec > 0) glyph(String(sec), X + 14, Z - 18, '#ffffff');
}
// めらめらファイガの着弾：足元に炎の輪（0.35秒）→ 黒い芯の火の玉が広がって消える（0.55秒）
function makeFireFx(){
  const L = [];
  return {
    add(x, z, r){ L.push({ x, z, r, t0:S.t }); },
    draw(){
      for (let i = L.length - 1; i >= 0; i--){
        const e = L[i], a = S.t - e.t0; if (a > .9){ L.splice(i, 1); continue; } if (a < 0) continue;
        const X = px(e.x), Z = px(e.z), R = Math.round(e.r * PPY);
        if (a < .35){
          alpha(.3, () => disc(X, Z, R, '#ff8a1a'));
          [['#fff0a0', 0], ['#ffd040', 1], ['#ff8a1a', 2], ['#e04010', 3]].forEach(([c, w]) => ring(X, Z, R - w, c));
          for (let j = 0; j < 16; j++){ const an = j / 16 * Math.PI * 2, h = 2 + (j * 5 + Math.floor(performance.now() / 70)) % 5, x0 = X + Math.round(Math.cos(an) * R), y0 = Z + Math.round(Math.sin(an) * R);
            for (let n = 0; n < h; n++) rect(x0, y0 - n, 1, 1, n < 2 ? '#ffe070' : '#ff8a1a'); }
        } else {
          const k = (a - .35) / .55, r = Math.round(R * (.85 + k * .25));
          alpha(1 - k, () => { disc(X, Z, r, '#ff6a10'); disc(X, Z, Math.max(1, r - 5), '#ffb030'); disc(X, Z, Math.max(1, r - 10), '#2a1008'); disc(X, Z, Math.max(1, r - 15), '#100404'); });
        }
      }
    },
  };
}

// ---- 神々の像（北のフィールドの外）。線の元になる ----
// 絵は FF6 の神々の像（ユーザーがくれた画像）を縦長の1枚のドット絵にしたもの（tools/make_statue.py。104×218。2026-10-14）
// 像は3段で、下＝第一楽章・中＝第二楽章・上＝第三楽章。像はどの楽章も1つ
// 画面全体の背景（screenBg）に、星空と像を描いた縦長の絵を置く。フィールドの外を消して（clearOutside）、像はフィールドの奥から画面の上の端まで見える
// 塔は神々の像の詠唱の手前で、ゴゴゴゴと一気に動く（揺れと低い音）。それ以外の間は止まっている（ユーザーの説明 2026-10-15）
//   第一楽章：塔が下から生えてきて、下段を写す → 第二楽章：中段へ上る → 第三楽章：上段へ上る
const STATUE = new Image(); STATUE.src = 'img/p1/statue.png';
// 背景の絵はフィールドの 2 倍の細かさ（RES）。像の 1マスがフィールドの半ドット（305×649 マス → 画面では 153×325 ドットぶん）
const RES = 2, BGW = 440, BGH = 1100, ST_Y = 300; // 大きさと像の上の端の行（フィールドのドット）
// 見える範囲の上の端（像の中の行。フィールドのドット）：下段（悪魔）・中段（男女）・上段（女神）
const VIEW = { 1:228, 2:120, 3:14 };
const ABOVE = 74; // フィールドの縁より上に見える行の数（縦長の画面で、上の端まで）
// 塔が動く時間（各楽章の時刻）。第一楽章はカウントダウンの終わりから生えてくる（はじめはてっぺんまで床の下）。第二楽章は神々の像の詠唱の手前
// 第三楽章は、その前の2回目の裁きの光の詠唱中（P1 通しの 104.0〜106.4。詠唱 103.4〜108.4。2026-10-16 ユーザーの指摘）。第三楽章だけで遊ぶときは、はじめから上段
const MOVE = { 1:{ from:-1, to:2.4 }, 2:{ from:0, to:2.2 }, 3:{ from:-21.9, to:-19.5 } };
const SINK = VIEW[1] + ABOVE + 6;
const statueBg = {}, starBg = {}; // 空の種類ごと（storm：第一・第二楽章、gold：第三楽章。sky.ts）
const buildStatueBg = kind => {
  const c = document.createElement('canvas'); c.width = BGW * RES; c.height = BGH * RES;
  const g = c.getContext('2d'); paintSky(g, BGW, BGH, RES, kind, 13);
  g.drawImage(STATUE, Math.round((BGW * RES - STATUE.width) / 2), ST_Y * RES);
  return c.toDataURL();
};
// フィールドの中心より下にかぶせる星空だけの絵。生えてくる途中の塔が、フィールドの下にはみ出して見えないように
const COVER_H = 500;
const buildStarBg = kind => { const c = document.createElement('canvas'); c.width = BGW * RES; c.height = COVER_H * RES; paintSky(c.getContext('2d'), BGW, COVER_H, RES, kind, 41); return c.toDataURL(); };
// 塔が動く間のゴゴゴゴ（揺れと低い音）。各楽章のイベントで MOVE[part].from に呼ぶ（at：呼んだ時刻）
function towerRumble(part, fxShake, sfx, at = Math.max(0, MOVE[part].from)){
  const len = MOVE[part].to - at;
  fxShake(2, len); sfx.tone(46, len, 'sawtooth', .05, -8); sfx.tone(62, len, 'triangle', .08, -12);
}
// 今の楽章・時刻で、像のどの行が見えているか（row）・どれだけ沈んでいるか（sink）・横の揺れ（dx）
function statueGeom(part, t){
  const mv = MOVE[part], k = Math.min(1, Math.max(0, (t - mv.from) / (mv.to - mv.from))), moving = k > 0 && k < 1;
  let row = VIEW[part], sink = 0;
  if (part === 1) sink = SINK * (1 - k) * (1 - k); // 生えてくる：はじめは速く、最後はゆっくり
  else { const e = k * k * (3 - 2 * k); row = VIEW[part - 1] + (VIEW[part] - VIEW[part - 1]) * e; } // 上る：なめらかに
  const dx = moving ? (Math.floor(performance.now() / 45) % 2 ? 1 : -1) : 0; // 動く間は小刻みに横に揺れる
  return { row, sink, dx };
}
// part：楽章（1〜3）
function statueScreenBg(part, t){
  // 空：第一・第二楽章は嵐の雲（storm）、第三楽章は金色の空（gold）。第三楽章は塔が上段へ上る途中で切り替わる
  const mv = MOVE[3], kind = part === 3 && t >= (mv.from + mv.to) / 2 ? 'gold' : 'storm';
  if (!statueBg[kind]){ if (!STATUE.complete || !STATUE.width) return null; statueBg[kind] = buildStatueBg(kind); starBg[kind] = buildStarBg(kind); }
  const { row, sink, dx } = statueGeom(part, t);
  // フィールドの中心に合わせる行：見える上の端（row）から ABOVE 行下がフィールドの北の縁（中心から 20y）。sink だけ絵を下げる
  return { url:statueBg[kind], size:BGW, h:BGH, cy:Math.round(ST_Y + row + ABOVE + 20 * PPY - sink), dx, color:SKY_BASE[kind], cover:sink > 0 ? { url:starBg[kind], h:COVER_H } : null }; // かぶせる絵は塔が生えてくる間だけ（空の継ぎ目が見えないように）
}
// P1 の終わり（つなぎ P1→P2）：ステージが天へ昇って像を通り越す。rise：0〜1（0＝上段を写したまま、1＝像が下へ抜けきる）
function statueRiseBg(rise){
  const kind = 'gold';
  if (!statueBg[kind]){ if (!STATUE.complete || !STATUE.width) return null; statueBg[kind] = buildStatueBg(kind); starBg[kind] = buildStarBg(kind); }
  const row = VIEW[3] - rise * (VIEW[1] + ABOVE + 120); // 見える上の端の行を、像のてっぺんより上（負）まで下げる＝像が下へ流れる
  return { url:statueBg[kind], size:BGW, h:BGH, cy:Math.round(ST_Y + row + ABOVE + 20 * PPY), color:SKY_BASE[kind], cover:{ url:starBg[kind], h:COVER_H } }; // 像はフィールドの奥へ隠れて下へ抜ける
}
// 像の上の、線などの出どころ（像の絵 statue.png の点。2026-10-15 ユーザーの動画に合わせて選んだ）
//   face：下段の悪魔の顔（波動砲・第一楽章の線）、grav：中段の渦の柱の上（重力弾。紫の光）、rock：中段の像の手（岩石弾。黄色の光）
//   sleep：上段の男の像の胸（睡眠。桃色の光）、conf：上段の女神（混乱。色は推定）
const STATUE_PTS = { face:[158, 456], grav:[136, 206], rock:[240, 296], sleep:[158, 110], conf:[100, 46],
  halfW:[77, 291], halfE:[268, 308], // 第二楽章の半面の予兆の球（重力波＝像の左・撲殺の神気＝像の右。ユーザーの画像 2026-10-15）
  gaze:[133, 98] };                  // 第三楽章の視線の目（女神の前。ユーザーの動画）
// その点のキャンバスの座標（フィールドより上は負。上の層 drawTop に描く）。背景の絵の位置（statueScreenBg）と同じ計算
function statuePt(part, t, name){
  const [sx, sy] = STATUE_PTS[name], { row, sink, dx } = statueGeom(part, t);
  return { X:(144 - BGW / 2) + (BGW * RES - STATUE.width) / 2 / RES + sx / RES + dx, Y:sy / RES - row - ABOVE - 20 * PPY + 144 + sink };
}
// ---- 上の層（hud.ts の drawTop。フィールドの外の像の上まで描ける）に描く部品。g は上の層の 2D コンテキスト ----
const gDot = (g, x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
const gLine = (g, x0, y0, x1, y1, col) => { const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); g.fillStyle = col; for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); };
const gDisc = (g, X, Y, R, col) => { g.fillStyle = col; for (let dy = -R; dy <= R; dy++){ const hw = Math.floor(Math.sqrt(R * R - dy * dy)); g.fillRect(Math.round(X - hw), Math.round(Y + dy), hw * 2 + 1, 1); } };
const gAlpha = (g, a, fn) => { const p0 = g.globalAlpha; g.globalAlpha = p0 * Math.max(0, Math.min(1, a)); fn(); g.globalAlpha = p0; };
// 出どころの光る点（色で見分ける）
function topGlow(g, q, col, r = 3){
  const k = .75 + Math.sin(performance.now() / 160) * .25;
  gAlpha(g, .25 * k, () => gDisc(g, q.X, q.Y, r + 3, col)); gAlpha(g, .65, () => gDisc(g, q.X, q.Y, r + 1, col)); gDisc(g, q.X, q.Y, Math.max(1, r - 1), '#ffffff');
}
// 線：どの楽章も黄色い細い実線（実機）。人の胸のあたりまで
function topTether(g, a, b){
  const B = { X:px(b.x), Y:px(b.z) - 4 }, d = Math.hypot(B.X - a.X, B.Y - a.Y) || 1, nx = -(B.Y - a.Y) / d, ny = (B.X - a.X) / d;
  gAlpha(g, .8, () => gLine(g, a.X + nx, a.Y + ny, B.X + nx, B.Y + ny, '#a87018'));
  gLine(g, a.X, a.Y, B.X, B.Y, '#ffe060');
  gAlpha(g, .55, () => gLine(g, a.X - nx * .5, a.Y - ny * .5, B.X - nx * .5, B.Y - ny * .5, '#fff8c8'));
}
// 波動砲の予告：像の前（フィールドの北のふち）に大きな水色の光の球。真ん中が白く強く光り、まわりを渦の筋が巻く（実機の画像。もやではない）
// 光線はこの球から撃たれる。k：予告の進み（0〜1。だんだん大きくなる）
const CANNON_ORB = { x:0, z:-20.5 };
function cannonOrb(g, k){
  const X = px(CANNON_ORB.x), Y = px(CANNON_ORB.z), t = performance.now() / 1000, R = Math.round(10 + 16 * Math.min(1, k * 1.5));
  gAlpha(g, .22, () => gDisc(g, X, Y, R + 6, '#5ad8ff')); gAlpha(g, .45, () => gDisc(g, X, Y, R + 2, '#7ae0ff'));
  gAlpha(g, .9, () => gDisc(g, X, Y, R, '#9ae8ff')); gDisc(g, X, Y, Math.round(R * .74), '#d8f6ff'); gDisc(g, X, Y, Math.round(R * .5), '#ffffff');
  for (let j = 0; j < 4; j++) for (let a = 0; a < 160; a += 2){
    const an = a / 36 + j * 1.6 + t * 1.6, rr = R * (.62 + .34 * Math.sin(a / 25 + j)); gAlpha(g, .75, () => gDot(g, X + Math.cos(an) * rr, Y + Math.sin(an) * rr * .8, j % 2 ? '#ffffff' : '#3ab8ff'));
  }
}
// 第二楽章の半面の予兆：像の横に濃い大きな光の球（渦が巻いて真ん中が白い）。col：'purple'（重力波）か 'yellow'（撲殺の神気）。k：育ち（0〜1）
const ORB_PAL = { purple:['#6a4aff', '#2a0a6a', '#6a2ad0', '#ff5ad8', '#6a9aff', '#e8b0ff'], yellow:['#ffb030', '#7a3a00', '#d88a10', '#ffe060', '#ff8a2a', '#fff0a0'] };
function bigOrb(g, q, col, k){
  const [haze, body, mid, sw1, sw2, core] = ORB_PAL[col], R = Math.round(10 + 10 * Math.min(1, k * 1.5)), t = performance.now() / 1000;
  for (let i = 0; i < 18; i++){ const a = i * 2.4 + t * .8, d = R + 2 + (i * 7) % 8; gAlpha(g, .3, () => gDisc(g, q.X + Math.cos(a) * d, q.Y + Math.sin(a) * d, 2 + i % 3, haze)); }
  gAlpha(g, .45, () => gDisc(g, q.X, q.Y, R + 2, haze)); gAlpha(g, .92, () => gDisc(g, q.X, q.Y, R, body)); gAlpha(g, .82, () => gDisc(g, q.X, q.Y, Math.round(R * .78), mid));
  for (let j = 0; j < 4; j++) for (let a = 0; a < 300; a += 4){ const an = a * Math.PI / 180 + j * 1.57 + t * 3, r = R * (.25 + a / 300 * .72); gDot(g, q.X + Math.cos(an) * r, q.Y + Math.sin(an) * r, j % 2 ? sw1 : sw2); }
  gAlpha(g, .9, () => gDisc(g, q.X, q.Y, Math.round(R * .42), core)); gDisc(g, q.X, q.Y, Math.max(1, Math.round(R * .22)), '#ffffff');
}
// 第三楽章の視線：像に描かれる目。look＝見る（黄色の目に赤い「？」）／見ない（紫の目に光る桃色の瞳）
const QMARK = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];
function gazeEye(g, q, look, k){
  const RX = Math.round(10 + 12 * Math.min(1, k * 1.6)), RY = Math.round(RX / 2), [edge, body, inner] = look ? ['#a86a00', '#ffc828', '#fff0a0'] : ['#3a0a6a', '#9a3ae0', '#d890ff'];
  for (let dy = -RY; dy <= RY; dy++){ const hw = RX * (1 - Math.pow(Math.abs(dy) / (RY + 1), 1.6));
    for (let dx = -Math.floor(hw); dx <= Math.floor(hw); dx++) gDot(g, q.X + dx, q.Y + dy, Math.abs(dx) > hw - 1.5 || Math.abs(dy) > RY - 1 ? edge : Math.abs(dx) > hw * .55 ? body : inner); }
  const pr = Math.max(2, Math.round(RY * .75));
  if (look){ gDisc(g, q.X, q.Y, pr, '#ff5a6a'); gDisc(g, q.X, q.Y, pr - 1, '#ff8a9a'); const s = pr >= 6 ? 2 : 1; QMARK.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') { g.fillStyle = '#e02848'; g.fillRect(Math.round(q.X + (c - 2) * s), Math.round(q.Y + (r - 3) * s), s, s); } })); }
  else { gDisc(g, q.X, q.Y, pr, '#ff40e0'); gDisc(g, q.X, q.Y, Math.max(1, pr - 3), '#ffb0ff'); gDisc(g, q.X, q.Y, 1, '#ffffff'); }
}
// ハイパードライブ：小さなたらい（横から見た形）
function tarai(g, X, Y){
  for (let dy = 0; dy < 3; dy++){ const hw = 3 - dy * .5; for (let dx = -Math.floor(hw); dx <= Math.floor(hw); dx++) gDot(g, X + dx, Y + dy, dx < 0 ? '#c8b8a0' : '#8a7a5a'); }
  for (let dx = -3; dx <= 3; dx++) gDot(g, X + dx, Y - 1, '#f0e8d8');
}
// ハイパードライブ：タンクのまわりの範囲（半径 r）に、黄色寄りの光の柱とたらい。a：着弾からの秒（負＝降ってくる途中、0〜＝着弾）
function hyperFx(g, q, r, a){
  const X = px(q.x), Y = px(q.z), R = Math.round(r * PPY);
  const pillar = (top, hw, k) => { for (let dy = -top; dy <= 0; dy++){ const f = Math.min(1, (dy + top) / 20) * k;
    gAlpha(g, f, () => { g.fillStyle = '#ffa040'; g.fillRect(X - hw - 2, Y + dy, hw * 2 + 5, 1); g.fillStyle = '#ffd860'; g.fillRect(X - hw, Y + dy, hw * 2 + 1, 1); g.fillStyle = '#fff4b0'; g.fillRect(X - Math.round(hw * .7), Y + dy, Math.round(hw * 1.4) + 1, 1); g.fillStyle = '#ffffff'; g.fillRect(X - Math.round(hw * .35), Y + dy, Math.round(hw * .7) + 1, 1); }); } };
  const DROP = [[-14, 30], [10, 52], [-3, 74], [17, 20], [-20, 62]];
  if (a < 0){ // 降ってくる：範囲の円がうすく黄色に光り、上から黄色の光が差し込む。たらいが落ちてくる
    const k = 1 + a / .8;
    gAlpha(g, .2, () => gDisc(g, X, Y, R, '#ffe070')); gAlpha(g, .8, () => { g.strokeStyle = '#fff0a0'; g.beginPath(); g.arc(X + .5, Y + .5, R, 0, Math.PI * 2); g.stroke(); });
    pillar(110, 6, .55 * k);
    DROP.forEach(([dx, h]) => tarai(g, X + dx * R / 30, Y - h * (1 - k * .85)));
  } else if (a < .6){ // 着弾：範囲いっぱいに黄色寄りの光（真ん中は白）、黄色の光の柱。たらいが散らばる
    const k = 1 - a / .6;
    gAlpha(g, .3 * k, () => gDisc(g, X, Y, R + 7, '#ff9a50')); gAlpha(g, .7 * k, () => gDisc(g, X, Y, R + 2, '#ffc050')); gAlpha(g, .9 * k, () => gDisc(g, X, Y, R, '#ffe070')); gAlpha(g, k, () => gDisc(g, X, Y, Math.max(1, R - 8), '#fff4b0')); gAlpha(g, k, () => gDisc(g, X, Y, 12, '#ffffff'));
    pillar(130, 10, k);
    [[-22, 8], [20, -4], [-6, 22], [14, 18]].forEach(([dx, dy]) => tarai(g, X + dx * R / 30 * (1 + a), Y + dy * R / 30 * (1 + a)));
  }
}
// フィールド全体がその色で一瞬光る（視線の着弾など）
function topFieldFlash(g, col, k){ gAlpha(g, .55 * k, () => gDisc(g, px(0), px(0), Math.round(20 * PPY), col)); }
// 波動砲の光線：白い芯 → 水色 → 青、ふちに白い稲妻（枝分かれ）。a：出どころ（フィールドの座標）、d：向き、k：消えていく割合（0〜1）
function topBeam(g, a, d, hw, k, seed){
  const n = { x:-d.z, z:d.x }, far = 80, P0 = w => ({ X:px(a.x + n.x * w), Y:px(a.z + n.z * w) }), P1 = w => ({ X:px(a.x + d.x * far + n.x * w), Y:px(a.z + d.z * far + n.z * w) });
  const band = (w0, w1, col, al) => gAlpha(g, al * (1 - k), () => { const A0 = P0(w0), A1 = P0(w1), B1 = P1(w1), B0 = P1(w0); g.fillStyle = col; g.beginPath(); g.moveTo(A0.X, A0.Y); g.lineTo(A1.X, A1.Y); g.lineTo(B1.X, B1.Y); g.lineTo(B0.X, B0.Y); g.closePath(); g.fill(); });
  band(-hw * 2.2, hw * 2.2, '#3a6ad8', .35); band(-hw, hw, '#7ab8ff', .9); band(-hw * .65, hw * .65, '#d8f0ff', 1); band(-hw * .4, hw * .4, '#ffffff', 1);
  let s = seed * 9301 + Math.floor(performance.now() / 50) * 7; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  gAlpha(g, 1 - k, () => [-1, 1].forEach(side => {
    let t0 = 0, prev = null;
    while (t0 < far){
      const off = side * (hw * 1.1 + R() * hw * .8), q = { X:px(a.x + d.x * t0 + n.x * off), Y:px(a.z + d.z * t0 + n.z * off) };
      if (prev) gLine(g, prev.X, prev.Y, q.X, q.Y, '#ffffff');
      if (R() < .25){ const b = side * (1 + R() * 2); gLine(g, q.X, q.Y, q.X + n.x * b * PPY + d.x * 1.5 * PPY, q.Y + n.z * b * PPY + d.z * 1.5 * PPY, '#c8f0ff'); }
      prev = q; t0 += 1.2 + R() * 1.5;
    }
  }));
}
// フィールドの外（星空）を消して、画面全体の背景を見せる（P2 と同じ）
const clearOutside = () => {
  const W = ctx.canvas.width, C = W / 2, R = 20 * PPY + 1;
  ctx.save(); ctx.beginPath(); ctx.rect(-40, -40, W + 80, W + 80); ctx.arc(C, C, R, 0, Math.PI * 2, true); ctx.clip('evenodd');
  ctx.clearRect(-40, -40, W + 80, W + 80); ctx.restore();
};
// 線の出どころが2つある楽章（第三楽章の混乱・睡眠）は、像の上のその場所に小さな光
function statueLights(L){ L.forEach(q => { const X = px(q.x), Y = px(-22.3); alpha(.3 + .1 * Math.sin(performance.now() / 250), () => disc(X, Y, 8, q.col)); alpha(.35, () => disc(X, Y, 4, q.col)); }); }
// 線（像から人へ）。点線がゆっくり流れる
function tether(a, b, col){
  const A = { x:px(a.x), z:px(a.z) }, B = { x:px(b.x), z:px(b.z) }, L = Math.hypot(B.x - A.x, B.z - A.z) || 1, n = Math.floor(L / 3), ph = Math.floor(performance.now() / 60) % 3;
  for (let i = 0; i < n; i++) if ((i + ph) % 3 !== 0) rect(Math.round(A.x + (B.x - A.x) * i / n), Math.round(A.z + (B.z - A.z) * i / n), 2, 2, col);
}

// ---- 実機の動画に寄せた見た目（2026-10-14 ユーザーがくれた動画から） ----
// 矢印（ずびずばテレポ）：暗い丸い台に金のふち、金の矢印（山形）
function arrowPlate(X, Z, R, v){
  disc(X, Z, R, '#1a1420'); ring(X, Z, R, '#e0b040'); ring(X, Z, R - 1, '#8a6a20');
  const n = { x:-v.z, z:v.x }, L = Math.max(3, R - 4);
  // 山形の先（とがった所）が進む向き。2026-10-14 まで先が後ろ向きに描かれていた（ユーザーの指摘）
  for (let w = 0; w < 3; w++) for (let i = 0; i <= L; i++){
    const f = i / L, along = L * .3 - L * .6 * (1 - f) - w; // 山形を3重に（後ろの2本は暗い色）
    rect(Math.round(X + v.x * along + n.x * (L - i) * .9), Math.round(Z + v.z * along + n.z * (L - i) * .9), 2, 2, w ? '#a07820' : '#ffd860');
    rect(Math.round(X + v.x * along - n.x * (L - i) * .9), Math.round(Z + v.z * along - n.z * (L - i) * .9), 2, 2, w ? '#a07820' : '#ffd860');
  }
}
// 重力弾の沼（グラビガ）：紫に光るうず
function puddle(c, R, t){
  const X = px(c.x), Z = px(c.z), r = Math.round(R * PPY);
  alpha(.55, () => disc(X, Z, r, '#3a0a6a')); alpha(.5, () => disc(X, Z, Math.round(r * .55), '#8a3ad8'));
  for (let i = 0; i < 3; i++){ const a0 = t * 2 + i * 2.1; for (let k = 0; k < 14; k++){ const a = a0 + k * .22, rr = r * (.25 + k / 14 * .7); rect(Math.round(X + Math.cos(a) * rr), Math.round(Z + Math.sin(a) * rr), 2, 2, k % 3 ? '#c87aff' : '#ffffff'); } }
  ring(X, Z, r, '#b05aff');
}
// 中心から向き u・半角 halfDeg・半径 R までの扇を塗る（ばりばりルインガ）
function fillConeR(u, halfDeg, R, col){
  const c = Math.cos(halfDeg * Math.PI / 180);
  fillArena(z => { let lo = 99, hi = -99; for (let x = -20; x <= 20; x += .25){ const r = Math.hypot(x, z); if (r > .3 && r <= R && (x * u.x + z * u.z) / r >= c){ lo = Math.min(lo, x); hi = Math.max(hi, x); } } return hi >= lo ? [lo, hi] : null; }, col);
}
const rndOf = seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
// ばりばりルインガ：ケフカの正面へ飛んでいく白い扇の奥義（ユーザーの動画 2026-10-15、見本で OK）
//   扇が中心から前へ広がる（真ん中は白・ふちは桃色）→ 前へ飛ぶ白い光の筋 → 消える。a：着弾からの経過秒（0〜RUINGA_DUR）
const RUINGA_DUR = .6;
function ruingaFx(u, halfDeg, a){
  const k = a / RUINGA_DUR, R = 20 * Math.min(1, .35 + k * 1.6), fade = 1 - Math.max(0, (k - .45) / .55);
  alpha(.55 * fade, () => fillConeR(u, halfDeg, R, '#ffc8d8'));
  alpha(.75 * fade, () => fillConeR(u, halfDeg * .72, R, '#fff0f4'));
  alpha(.85 * fade, () => fillConeR(u, halfDeg * .42, R * .92, '#ffffff'));
  const ang = Math.atan2(u.z, u.x), h = halfDeg * Math.PI / 180;
  alpha(.9 * fade, () => [-1, 1].forEach(s => { const e = { x:Math.cos(ang + s * h), z:Math.sin(ang + s * h) }; line(px(0), px(0), px(e.x * R), px(e.z * R), '#ff7aa0'); line(px(0), px(0) + 1, px(e.x * (R - .2)), px(e.z * (R - .2)) + 1, '#ffd0dc'); }));
  const rnd = rndOf(4);
  alpha(fade, () => { for (let j = 0; j < 22; j++){ const b = ang + (rnd() - .5) * h * 1.8, r0 = rnd() * R * .7 + k * R * .25, ln = 2.4 + rnd() * 3.4, r1 = Math.min(R, r0 + ln);
    line(px(Math.cos(b) * r0), px(Math.sin(b) * r0), px(Math.cos(b) * r1), px(Math.sin(b) * r1), '#ffffff'); } });
  alpha(.85 * fade, () => disc(px(u.x * 6.5), px(u.z * 6.5), Math.round(2 * PPY), '#ffffff'));
}
// 裁きの光（P1）：詠唱の終わり 2 秒は床が赤い溶岩のように光る → 着弾で白く光り、金の光の柱が何本も立つ → 引いていく
//   （ユーザーの動画 2026-10-15、見本で OK）。a：着弾からの経過秒（負＝詠唱中）
const JUDGE_LAVA = 2, JUDGE_DUR = 1.2;
function judgeFloor(a){
  const R = Math.round(20 * PPY), C0 = px(0);
  if (a >= -JUDGE_LAVA && a < 0){
    const k = 1 + a / JUDGE_LAVA, ph = performance.now() / 900;
    alpha(.6 * k, () => { for (let dy = -R; dy <= R; dy += 3) for (let dx = -R; dx <= R; dx += 3){ if (dx * dx + dy * dy > R * R) continue;
      const n = Math.sin(dx * .09 + dy * .05 + ph) + Math.cos(dy * .11 - dx * .03 - ph * .7);
      ctx.fillStyle = n > .5 ? '#ff3a1a' : Math.sin(dx * .07) + Math.cos(dy * .08 + ph * .5) > -.3 ? '#c81a10' : '#6a0a08'; ctx.fillRect(C0 + dx, C0 + dy, 3, 3); } });
    const rnd = rndOf(Math.floor(performance.now() / 120) + 3);
    alpha(k, () => { for (let j = 0; j < 40; j++){ const b = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * .95; disc(Math.round(C0 + Math.cos(b) * d), Math.round(C0 + Math.sin(b) * d), 1 + Math.floor(rnd() * 2), '#ffb040'); } });
  } else if (a >= 0 && a < JUDGE_DUR){
    const k = 1 - a / JUDGE_DUR;
    alpha(.85 * Math.min(1, k * 1.6), () => disc(C0, C0, R, a < .4 ? '#fff8e0' : '#ffe8b0'));
  }
}
function judgeTop(g, a){
  if (a < 0 || a >= JUDGE_DUR) return;
  const k = 1 - a / JUDGE_DUR, grow = Math.min(1, a / .15), rnd = rndOf(8), R = 20 * PPY;
  for (let j = 0; j < 14; j++){
    const b = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * .85, X = Math.round(px(0) + Math.cos(b) * d), Y = Math.round(px(0) + Math.sin(b) * d), w = 3 + Math.floor(rnd() * 3), top = Math.round((90 + rnd() * 80) * grow * (.5 + .5 * k));
    for (let dy = -top; dy <= 0; dy++){ const f = Math.min(1, (dy + top) / 40) * k;
      gAlpha(g, f, () => { g.fillStyle = '#ffb020'; g.fillRect(X - w, Y + dy, w * 2 + 1, 1); g.fillStyle = '#ffe070'; g.fillRect(X - Math.round(w * .7), Y + dy, Math.round(w * 1.4) + 1, 1); g.fillStyle = '#ffffff'; g.fillRect(X - Math.round(w * .3), Y + dy, Math.round(w * .6) + 1, 1); }); }
  }
}
// つぎつぎトラップの爆発（赤い結晶）
const TRAP_COLS = ['#c8102e', '#ff5a6a', '#ffffff'];

export { arrowPlate, puddle, TRAP_COLS, ruingaFx, RUINGA_DUR, judgeFloor, judgeTop, JUDGE_LAVA, JUDGE_DUR };
export { SLOTS, TH, DPS, roleOf, isTH, dist, add, at, OFF, BOT_SPEED, MARKERS, WM, makeRoutes, stepBots, drawBot, ROLE_COL,
  quadOf, quadSpan, BAND_C, bandSpan, inBand, iceTell, iceHits, thTell, thHits, iceHit, thHit, rollMystery, drawTell, drawHitFlash, thunderSegs, icePts,
  orb, kefkaOrbs, spreadMark, stackMark, statueScreenBg, statueRiseBg, towerRumble, MOVE as TOWER_MOVE, statueLights, clearOutside, tether, makeFireFx, statuePt, topTether, topGlow, topBeam, cannonOrb, CANNON_ORB, bigOrb, gazeEye, hyperFx, topFieldFlash };
