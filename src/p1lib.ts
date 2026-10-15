// @ts-nocheck
// ===== P1（ケフカ）の3つのギミックで共通の部品。docs/dmu/research-p1.md =====
// 座標：中心 (0,0)・半径 20・北が −z（ほかのフェーズと同じ）。味方7人は正しく動く（P2 と同じ作り）
import { S } from './state.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, px, fillArena } from './gfx.js';

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
// 予兆の色（P4 と同じ：扇は水色、帯は黄色。点滅）
function drawTell(m, ice, th){
  const blink = (Math.floor(performance.now() / 200) & 1) === 0;
  if (ice) iceTell(m).forEach(q => alpha(blink ? .22 : .14, () => fillArena(quadSpan(q), '#a8e8ff')));
  if (th) thTell(m).forEach(i => alpha(blink ? .22 : .14, () => fillArena(bandSpan(m.thO, BAND_C[i]), '#fff070')));
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
// 頭上のマーカー：散開＝オレンジの三角（下向き）、頭割り＝4つの矢印が中へ
function spreadMark(q){ const X = px(q.x), Y = px(q.z) - 16; for (let r = 0; r < 7; r++){ const w = 6 - r; rect(X - w, Y - 3 + r, w * 2 + 1, 1, r < 1 ? '#101018' : '#ff8a2a'); } rect(X - 1, Y - 1, 3, 2, '#ffe070'); }
function stackMark(q){
  const X = px(q.x), Y = px(q.z) - 18, c = '#ff5a3a';
  [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => { const cx = X + dx * 6, cy = Y + dy * 6; for (let i = 0; i < 4; i++){ const w = 3 - i; if (dx) rect(cx - dx * i, cy - w, 1, w * 2 + 1, c); else rect(cx - w, cy - dy * i, w * 2 + 1, 1, c); } });
  disc(X, Y, 2, '#ffe070');
}

// ---- 神々の像（北のフィールドの外）。線の元になる ----
// 絵は FF6 の神々の像（ユーザーがくれた画像）を縦長の1枚のドット絵にしたもの（tools/make_statue.py。104×218。2026-10-14）
// 像は3段で、下＝第一楽章・中＝第二楽章・上＝第三楽章。像はどの楽章も1つ
// 画面全体の背景（screenBg）に、星空と像を描いた縦長の絵を置く。フィールドの外を消して（clearOutside）、像はフィールドの奥から画面の上の端まで見える
// 第一楽章の始め（神々の像の詠唱まで）に、塔が下からゴゴゴと生えてくる（揺れる）。そのあとは時間とともに少しずつ上を写していく（塔を上る）
//   第一楽章 → 第二楽章 → 第三楽章でつながる（ユーザーの説明 2026-10-14）
const STATUE = new Image(); STATUE.src = 'img/p1/statue.png';
// 背景の絵はフィールドの 2 倍の細かさ（RES）。像の 1マスがフィールドの半ドット（305×649 マス → 画面では 153×325 ドットぶん）
const RES = 2, BGW = 440, BGH = 1100, ST_Y = 300; // 大きさと像の上の端の行（フィールドのドット）
// 見える範囲の上の端（像の中の行。フィールドのドット）：楽章の始め → 終わり
const PATH = { 1:[228, 175], 2:[175, 110], 3:[110, 18] };
const ABOVE = 74; // フィールドの縁より上に見える行の数（縦長の画面で、上の端まで）
// 第一楽章：塔が生えてくる時間（カウントダウンの始めから神々の像の詠唱まで）と、始めにどれだけ下に隠れているか（てっぺんまで床の下）
const RISE = { from:-1, to:2.4, depth:PATH[1][0] + ABOVE + 6 }; // 揺れと音は 0 秒から（カウントダウン中はギミックの時間が進まないため）
let statueBg = null;
const buildStatueBg = () => {
  const c = document.createElement('canvas'); c.width = BGW * RES; c.height = BGH * RES;
  const g = c.getContext('2d');
  g.fillStyle = P.space; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = P.star; for (let i = 0; i < 260; i++) g.fillRect(((i * 97 + 13) % BGW) * RES, ((i * 53 + 29) % BGH) * RES, RES, RES);
  g.drawImage(STATUE, Math.round((BGW * RES - STATUE.width) / 2), ST_Y * RES);
  return c.toDataURL();
};
// part：楽章（1〜3）、end：その楽章の終わりの時刻
function statueScreenBg(part, t, end){
  if (!statueBg){ if (!STATUE.complete || !STATUE.width) return null; statueBg = buildStatueBg(); }
  const [a, b] = PATH[part], row = a + (b - a) * Math.min(1, Math.max(0, t / end));
  let sink = 0, dx = 0;
  if (part === 1 && t < RISE.to){ // 生えてくる：下に隠れたところから。小刻みに横に揺れる
    const k = Math.min(1, Math.max(0, (t - RISE.from) / (RISE.to - RISE.from))), e = 1 - (1 - k) * (1 - k);
    sink = RISE.depth * (1 - e); dx = k > 0 && k < 1 ? (Math.floor(performance.now() / 45) % 2 ? 1 : -1) : 0;
  }
  // フィールドの中心に合わせる行：見える上の端（row）から ABOVE 行下がフィールドの北の縁（中心から 20y）。sink だけ絵を下げる
  return { url:statueBg, size:BGW, h:BGH, cy:Math.round(ST_Y + row + ABOVE + 20 * PPY - sink), dx, color:P.space };
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
// 中心から向き u の 90° の扇を塗る（ばりばりルインガ）
function fillCone(u, halfDeg, col){
  const c = Math.cos(halfDeg * Math.PI / 180);
  fillArena(z => { let lo = 99, hi = -99; for (let x = -20; x <= 20; x += .25){ const r = Math.hypot(x, z); if (r > .3 && (x * u.x + z * u.z) / r >= c){ lo = Math.min(lo, x); hi = Math.max(hi, x); } } return hi >= lo ? [lo, hi] : null; }, col);
}
// つぎつぎトラップの爆発（赤い結晶）
const TRAP_COLS = ['#c8102e', '#ff5a6a', '#ffffff'];

export { arrowPlate, puddle, fillCone, TRAP_COLS };
export { SLOTS, TH, DPS, roleOf, isTH, dist, add, at, OFF, BOT_SPEED, MARKERS, WM, makeRoutes, stepBots, drawBot, ROLE_COL,
  quadOf, quadSpan, BAND_C, bandSpan, inBand, iceTell, iceHits, thTell, thHits, iceHit, thHit, rollMystery, drawTell, drawHitFlash, thunderSegs, icePts,
  orb, kefkaOrbs, spreadMark, stackMark, statueScreenBg, statueLights, clearOutside, tether };
