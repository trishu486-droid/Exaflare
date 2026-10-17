import { ARENA_R, BOSS_R, SQ2 } from './config.js';
import { JOBS, job } from './jobs.js';
import { opt } from './store.js';
import { A, curBoss, fxEl, hasInvuln, hasMit } from './action.js';
import { S } from './state.js';
import { img, jobIconUrl } from './icons.js';
import { sfx } from './audio.js';
import { kefkaSprite } from './kefka_art.js';

// ===== 画面（内部 288px。1y あたりのピクセル数はギミックごとに変える） =====
const W = 288, C0 = W / 2;
let PPY = 4;
function setPPY(v){ PPY = v; } // 描画のたびにギミックの倍率で決め直す
const cv = document.getElementById('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const px = x => Math.round(C0 + x * PPY);

// 8bitパレット
const P = {
  void:'#000000', space:'#1c1a3c', star:'#4a4478', floor:'#4b4c8a', grid:'#3e3f7a', diag:'#3a3a70', rim:'#4c6ed8', rim2:'#2d3f8f',
  exa:'#ff7a1f', exaDk:'#3a1606', exaHi:'#ffe08a', chev:'#fff4d6', white:'#ffffff',
  safe:'#58e07a', boss:'#b04a8a', bossEdge:'#d8609c', bossTip:'#ff5aa8', hurt:'#ff2a3a',
  water:'#3ab8ff', waterHi:'#c8f0ff', purple:'#b05aff', purpleDk:'#3a1060',
  mk:['#ff5a5a','#ffd84a','#5ad0ff','#d08cff']
};

// ===== ドット描画 =====
function rect(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function disc(cx, cy, r, c){
  ctx.fillStyle = c;
  for (let dy = -r; dy <= r; dy++){ const hw = Math.floor(Math.sqrt(r * r - dy * dy)); ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1); }
}
// ドーナツ（内側 r0 〜 外側 r1）
function donut(cx, cy, r0, r1, c){
  ctx.fillStyle = c;
  for (let dy = -r1; dy <= r1; dy++){
    const o = Math.floor(Math.sqrt(r1 * r1 - dy * dy));
    const i = Math.abs(dy) < r0 ? Math.ceil(Math.sqrt(r0 * r0 - dy * dy)) : 0;
    if (!i){ ctx.fillRect(cx - o, cy + dy, o * 2 + 1, 1); continue; }
    ctx.fillRect(cx - o, cy + dy, o - i + 1, 1); ctx.fillRect(cx + i, cy + dy, o - i + 1, 1);
  }
}
function ring(cx, cy, r, c){
  ctx.fillStyle = c;
  let x = r, y = 0, e = 1 - r;
  while (x >= y){
    [[x,y],[y,x],[-y,x],[-x,y],[-x,-y],[-y,-x],[y,-x],[x,-y]].forEach(([a, b]) => ctx.fillRect(cx + a, cy + b, 1, 1));
    y++;
    if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
  }
}
function line(x0, y0, x1, y1, c){
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); // 整数でないと終点に着かない
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;){ ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } }
}
function alpha(a, fn){ ctx.globalAlpha = a; fn(); ctx.globalAlpha = 1; }
function thickRing(cx, cy, r, c, w){ for (let i = 0; i < w; i++) ring(cx, cy, r - i, c); }
// 範囲攻撃の予兆の床：うすい地の色（base・濃さ a）の上に、柄（pat：CanvasPattern・濃さ pa）を重ねる。span は fillArena と同じ
function fillTell(span, base, pat, a, pa){ alpha(a, () => fillArena(span, base)); alpha(pa, () => fillArena(span, pat)); }
// フィールド内だけを行ごとに塗る。span(z) は x の範囲 [x0, x1] を返す
function fillArena(span, c){
  const R = ARENA_R * PPY;
  ctx.fillStyle = c;
  for (let y = -R; y <= R; y++){
    const hw = Math.sqrt(R * R - y * y), z = (y + .5) / PPY;
    const s = span(z); if (!s) continue;
    const x0 = Math.max(-hw, Math.ceil(s[0] * PPY)), x1 = Math.min(hw, Math.floor(s[1] * PPY));
    if (x1 >= x0) ctx.fillRect(C0 + x0, C0 + y, x1 - x0 + 1, 1);
  }
}
// 3x5 ドット数字・英字
const GLYPH = {
  A:'010101111101101', B:'110101110101110', C:'011100100100011', D:'110101101101110',
  1:'010110010010111', 2:'110001010100111', 3:'110001010001110', 4:'101101111001001', 5:'111100110001110',
  '?':'111001011000010', Z:'111001010100111'
};
function glyph(ch, cx, cy, c){
  const g = GLYPH[ch]; if (!g) return;
  for (let i = 0; i < 15; i++) if (g[i] === '1') rect(cx - 1 + (i % 3), cy - 2 + (i / 3 | 0), 1, 1, c);
}
function icon5(rows, cx, cy, c){ rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'x') rect(cx - 2 + i, cy - 2 + j, 1, 1, c); })); }
// 2px太さのL字（斜め方向の山形矢印）
function corner(cx, cz, sx, sz, L, c){
  rect(Math.min(cx, cx - sx * (L - 1)), sz > 0 ? cz - 1 : cz, L, 2, c);
  rect(sx > 0 ? cx - 1 : cx, Math.min(cz, cz - sz * (L - 1)), 2, L, c);
}

// 自キャラ：ジョブアイコン（ロール色の角丸タイル＋影付きの金のマーク。ひと目でわかるモチーフにアレンジした 11×11 のドット絵）
const ICON = {
  pld: ['.xxxxxxxxx.','.x...x...x.','.x...x...x.','.x.xxxxx.x.','.x...x...x.','.x...x...x.','..x..x..x..','..x..x..x..','...x.x.x...','....x.x....','.....x.....'],
  drk: ['.....x.....','....xxx....','....xxx....','....xxx....','....xxx....','....xxx....','.xxxxxxxxx.','.....x.....','.....x.....','....xxx....','.....x.....'],
  mnk: ['.......xx..','......xx..x','.....xx..xx','....xx..xx.','...xx..xx..','..xx..xx...','.xx..xx....','xx..xx.....','x..xx......','..xx.......','.xx........'],
  rpr: ['..xxxxxxxx.','xxxxx...xx.','xx......x..','x......x...','......x....','.....x.....','....x......','...x.......','..x........','.x.........','x..........'],
  mch: ['...........','...........','xxxxxxxxxxx','xxxxxxxxxx.','xxxx.x.....','xxx.xx.....','xxx........','xxx........','xxxx.......','...........','...........'],
  blm: ['......xx...','.....xx....','.....xx....','....xxx....','....xxxx...','...xxxxx...','...xxxxxx..','..xxxxxxx..','xxxxxxxxxxx','.xxxxxxxxx.','...........'],
  ast: ['...........','...xxxxx...','.xx.....xx.','x....x....x','x...xxx...x','x.xxxxxxx.x','x...xxx...x','x....x....x','.xx.....xx.','...xxxxx...','...........'],
  sch: ['...........','.xxxx.xxxx.','x....x....x','x.xx.x.xx.x','x....x....x','x.xx.x.xx.x','x....x....x','x.xx.x.xx.x','x....x....x','.xxxxxxxxx.','...........'],
};
const ROLE_COLOR = { tank:['#2a4aa0', '#3a64c8', '#18306a'], healer:['#2a7a3a', '#3a9a4a', '#18502a'],
  melee:['#9a2a3a', '#b83a4a', '#6a1a28'], ranged:['#9a2a3a', '#b83a4a', '#6a1a28'], caster:['#9a2a3a', '#b83a4a', '#6a1a28'] };
// ジョブアイコン（8bit の線画・28×28。src/icons.ts）。名前は SVG だったころのまま
function jobIconSvg(id){ return `<img class="jic" src="${jobIconUrl(id)}" alt="">`; }
function drawIcon(X, Z, hurt){
  // ジョブアイコン（15×15 の線画）。読み込み前だけ下の手描きのタイル
  const im = img(jobIconUrl(opt.job, true));
  if (im){
    ctx.drawImage(im, X - 7, Z - 7, 15, 15);
    if (hurt) alpha(.55, () => rect(X - 7, Z - 7, 15, 15, '#ff2a3a'));
    if (hasInvuln()) ring(X, Z, 10, '#ffd84a');
    else if (hasMit()) ring(X, Z, 10, '#5ab0ff');
    return;
  }
  const [bg, hi, lo] = hurt ? ['#ff2a3a', '#ff6a6a', '#a01020'] : ROLE_COLOR[job().role];
  const rim = hurt ? '#ffe066' : '#d8b060', fg = hurt ? '#ffffff' : '#f4d888', sh = lo;
  // 角丸タイル：金の縁 → ロール色（上半分を少し明るく、下端を暗く）
  rect(X - 6, Z - 7, 13, 15, rim); rect(X - 7, Z - 6, 15, 13, rim);
  rect(X - 5, Z - 6, 11, 13, bg); rect(X - 6, Z - 5, 13, 11, bg);
  rect(X - 5, Z - 6, 11, 3, hi); rect(X - 6, Z - 5, 1, 2, hi);
  rect(X - 5, Z + 5, 11, 1, lo);
  // 金のマーク（右下に影を落として刺繍っぽく）
  const g = ICON[opt.job];
  g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x' && g[j + 1]?.[i + 1] !== 'x') rect(X - 5 + i + 1, Z - 5 + j + 1, 1, 1, sh); }));
  g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') rect(X - 5 + i, Z - 5 + j, 1, 1, fg); }));
  if (hasInvuln()) ring(X, Z, 10, '#ffd84a');
  else if (hasMit()) ring(X, Z, 10, '#5ab0ff');
}

// 床の模様と色（実機の床。ユーザーの画像 2026-10-17）。288×288 の絵にして使い回す（テーマと大きさごと）
//   gold・blue：P1・P2 は金、P3・P4 は青。中心から外へ同じ向きに渦を巻く線
//   rust：P5。さびた鉄板。輪と放射の継ぎ目、すべり止めの凸、びょう
// 何も決めていないギミックは今までの青紫（P.floor）に渦
const FLOOR = {
  gold:{ floor:'#6a5c30', line:'#544822', hi:'#9a8848', rim:'#c8a040', rim2:'#6a5420' },
  blue:{ floor:'#33456a', line:'#283654', hi:'#56709c', rim:'#4c6ed8', rim2:'#2d3f8f' },
  base:{ floor:P.floor, line:'#33346e', hi:'#5c5ea8', rim:P.rim, rim2:P.rim2 },
  rust:{ floor:'#56321f', rim:'#9a6a48', rim2:'#4a2a1e' },
};
const floorCache = {};
function floorCanvas(R, kind){
  const key = kind + ':' + R; if (floorCache[key]) return floorCache[key];
  const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d');
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const inR = (x, y) => Math.hypot(x - C0, y - C0) <= R;
  if (kind !== 'rust'){
    const pal = FLOOR[kind];
    const arm = a0 => { for (let r = R * .12; r <= R; r += .5){ const a = a0 + 1.6 * (r / R); dot(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r, pal.line); } };
    const n = 16;
    for (let i = 0; i < n; i++){ const a0 = i / n * Math.PI * 2; arm(a0); arm(a0 + .02); }
    // 渦の中心の輪と、外の方の細い輪
    [.12, .55, .85].forEach(k => { const r = R * k, m = Math.round(r * 7); for (let i = 0; i < m; i++){ const a = i / m * Math.PI * 2; dot(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r, k === .12 ? pal.hi : pal.line); } });
  }
  if (kind === 'rust'){
    // 鉄板の色（板ごとに少し変える）→ 継ぎ目 → すべり止め → びょう
    const rings = [R * .22, R * .5, R * .78], spokesAt = r => r < rings[1] ? 8 : 16;
    const plate = (x, y) => { const r = Math.hypot(x - C0, y - C0), a = (Math.atan2(y - C0, x - C0) + Math.PI * 2) % (Math.PI * 2); const band = rings.filter(v => r > v).length, n = spokesAt(r); return [band, Math.floor(a / (Math.PI * 2) * n), r, a, n]; };
    const base = ['#4a2a1e', '#5a3424', '#62382a', '#56321f'];
    for (let y = C0 - R; y <= C0 + R; y++) for (let x = C0 - R; x <= C0 + R; x++){
      if (!inR(x, y)) continue;
      const [band, seg, r, a, n] = plate(x, y);
      let col = base[(band + seg) % 4];
      // 板の上にすべり止め（ななめの小さな凸）。外側2段の1枚おき
      if (band >= 2 && seg % 2 === 0 && ((x + y * 2) % 6 === 0) && (x % 3 !== 0)) col = '#7a4a34';
      // さびのむら
      if (((x * 73 + y * 151) % 97) < 6) col = '#3e2218';
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    const seam = '#2a160f', edge = '#8a5a40';
    rings.forEach(r => { const m = Math.round(r * 7); for (let i = 0; i < m; i++){ const a = i / m * Math.PI * 2; dot(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r, seam); dot(C0 + Math.cos(a) * (r + 1), C0 + Math.sin(a) * (r + 1), edge); } });
    [[rings[0], rings[1], 8], [rings[1], R, 16]].forEach(([r0, r1, n]) => { for (let s = 0; s < n; s++){ const a = s / n * Math.PI * 2 + (n === 16 ? Math.PI / 16 : 0); for (let r = r0; r <= r1; r += .5){ dot(C0 + Math.cos(a) * r, C0 + Math.sin(a) * r, seam); } for (let r = r0 + 3; r < r1 - 2; r += 6) dot(C0 + Math.cos(a + 2 / r) * r, C0 + Math.sin(a + 2 / r) * r, edge); } });
    // まん中の丸い板
    for (let i = 0; i < 40; i++){ const a = i / 40 * Math.PI * 2; dot(C0 + Math.cos(a) * rings[0] * .6, C0 + Math.sin(a) * rings[0] * .6, seam); }
  }
  return floorCache[key] = c;
}

function drawField(){
  rect(0, 0, W, W, P.space);
  for (let i = 0; i < 60; i++) rect((i * 97 + 13) % W, (i * 53 + 29) % W, 1, 1, P.star);
  const R = ARENA_R * PPY;
  const fk = FLOOR[S.inst?.floorTheme] ? S.inst.floorTheme : 'base', th = FLOOR[fk];
  disc(C0, C0, R, th.floor);
  ctx.drawImage(floorCanvas(R, fk), 0, 0);
  S.inst?.drawFloor?.(S.t);
  thickRing(C0, C0, R + 3, th.rim, 3);
  ring(C0, C0, R + 4, th.rim2);
  // フィールドマーカー
  // ギミックごとに置き方を変えられる（S.inst.markers：card＝A〜D の中心からの距離、num＝1〜4 の距離。P1 はヤーンの近いひし形）
  const mk = S.inst?.markers, m = mk?.card ?? 16, d = Math.round((mk?.num ?? m) / SQ2);
  [['A',0,-m],['B',m,0],['C',0,m],['D',-m,0]].forEach(([t, x, z], i) => {
    alpha(.35, () => disc(px(x), px(z), 5, P.mk[i])); ring(px(x), px(z), 5, P.mk[i]); glyph(t, px(x), px(z), P.white);
  });
  // P3 はヤーンのマクロに合わせて北西始まりに固定
  const corners = (mk?.corner || S.inst?.fieldMarker || opt.marker) === 'nw' ? [[-d,-d],[d,-d],[d,d],[-d,d]] : [[d,-d],[d,d],[-d,d],[-d,-d]];
  corners.forEach(([x, z], i) => {
    const X = px(x), Z = px(z), c = P.mk[i];
    alpha(.35, () => rect(X - 5, Z - 5, 11, 11, c));
    line(X - 5, Z - 5, X + 5, Z - 5, c); line(X + 5, Z - 5, X + 5, Z + 5, c); line(X + 5, Z + 5, X - 5, Z + 5, c); line(X - 5, Z + 5, X - 5, Z - 5, c);
    glyph(String(i + 1), X, Z, P.white);
  });
}

// ボス：塗りつぶしのターゲットサークル + 正面の三角（北向き）
// ===== 敵のターゲットサークル（実機寄り・2026-10-13 ユーザーが A案に決定） =====
// 二重の赤い輪（背面は開いている）＋内側の細い輪、側面に正面向きの小さな「＾」、正面にしずく型の印。
// ターゲット中は外側を白で縁取る。face：正面の向き（ラジアン、画面の右＝0・下＝+）
const TC_ON = '#ff4a5a', TC_OFF = '#a82a3a', TC_FILL = '#e8283a', TC_IN_ON = '#ffd0d8', TC_IN_OFF = '#c87080';
const TC_BACK = Math.PI / 4.2; // 背面の開き（片側）
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function tcRing(X, Z, R, face, on){
  const back = a => Math.abs(angDiff(a, face + Math.PI)) < TC_BACK, c = on ? TC_ON : TC_OFF, c2 = on ? TC_IN_ON : TC_IN_OFF;
  alpha(on ? .16 : .08, () => disc(X, Z, R, TC_FILL));
  const arc = (r, col, skip) => { const n = Math.max(60, Math.round(r * 9)); ctx.fillStyle = col; for (let i = 0; i < n; i++){ const a = i / n * Math.PI * 2; if (skip(a)) continue; ctx.fillRect(Math.round(X + Math.cos(a) * r), Math.round(Z + Math.sin(a) * r), 1, 1); } };
  if (on) arc(R + 1, '#fff0f4', back);
  arc(R, c, back); arc(R - 1, c, back);
  arc(R - 3, c2, a => back(a) || Math.abs(angDiff(a, face)) < .25);
  // 背面の開きの端：小さな四角
  [1, -1].forEach(sd => { const a = face + Math.PI + sd * TC_BACK; rect(Math.round(X + Math.cos(a) * R) - 1, Math.round(Z + Math.sin(a) * R) - 1, 3, 3, c); });
  // 側面：輪の内側に、正面を向いた小さな「＾」
  [1, -1].forEach(sd => {
    const a = face + sd * Math.PI / 2, ux = Math.cos(a), uz = Math.sin(a), fx = Math.cos(face), fz = Math.sin(face), tx = X + ux * (R - 6), tz = Z + uz * (R - 6);
    for (let k = 0; k < 3; k++) for (const s of [1, -1]) rect(Math.round(tx + fx * (1 - k) + ux * k * s), Math.round(tz + fz * (1 - k) + uz * k * s), 1, 1, c2);
  });
}
// 正面のしずく（ボスの絵より手前に描く）
function tcTip(X, Z, R, face, on){
  const fx = Math.cos(face), fz = Math.sin(face), nx = -fz, nz = fx;
  const tri = (tip, base, hw) => [[X + fx * tip, Z + fz * tip], [X + fx * base + nx * hw, Z + fz * base + nz * hw], [X + fx * base - nx * hw, Z + fz * base - nz * hw]];
  fillTri(tri(R + 9, R - 2.5, 5.5), '#101018');
  fillTri(tri(R + 7.5, R - 1.5, 3.8), on ? '#fff0f4' : '#ff7a8a');
  fillTri(tri(R + 4, R - 1, 1.6), on ? TC_ON : TC_OFF);
}
// ボスが1体（中央・北向き）：P4・P5 など
function drawBoss(){
  if (S.inst?.bosses){ drawBosses(); return; }
  const R = Math.round((S.inst?.bossR ?? BOSS_R) * PPY), face = -Math.PI / 2; // ギミックごとにターゲットサークルの大きさを変えられる（P2 のゴッドケフカは 6）
  // ボスの絵があるとき（P1・P2）は、殴れない間はターゲットサークルを消して絵だけ（ユーザー 2026-10-16）。絵のない P5 は輪を残す
  const ring0 = !(S.inst?.targetable && !S.inst.targetable(S.t)); // ターゲットサークルは殴れるときだけ（ユーザー 2026-10-17）
  if (ring0){ tcRing(C0, C0, R, face, true); tcTip(C0, C0, R, face, true); }
  if (ring0 && performance.now() - A.bossFlash < 90) alpha(.5, () => disc(C0, C0, R, P.white)); // 被ダメの白フラッシュ
  drawBossSprite(S.inst?.bossArt, C0, C0);
}
// ボスの絵（P1 のケフカ・P2 のゴッドケフカ。kefka_art.ts）。art：'kefka' | 'god'、または { id, a（濃さ）, dy（上へずらす）, k（大きさ）, gray（白黒）, dx（揺れ） }
function drawBossSprite(art, X, Z){
  if (!art) return;
  const o = typeof art === 'string' ? { id:art } : art, sp = kefkaSprite(o.id);
  if (!sp || (o.a ?? 1) <= 0) return;
  const k = o.k ?? 1, w = sp.width * k, h = sp.height * k;
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, o.a ?? 1)); ctx.imageSmoothingEnabled = false;
  if (o.gray) ctx.filter = 'grayscale(1) brightness(1.6)';
  ctx.drawImage(sp, Math.round(X - w / 2 + (o.dx || 0)), Math.round(Z - h / 2 - (o.dy || 0)), Math.round(w), Math.round(h)); // 絵の真ん中を輪の中心に
  ctx.restore();
}

// ボスが2体（P3）：ターゲットしている方を最後に（最前面に）描く。正面の印とターゲットのピンは drawBossFace（ボスの絵の後）
const targetLast = list => { const id = curBoss().id; return [...list].sort((a, b) => (a.id === id ? 1 : 0) - (b.id === id ? 1 : 0)); };
function drawBosses(){
  const cur = curBoss(), flash = performance.now() - A.bossFlash < 90;
  targetLast(S.inst.bosses(S.t)).forEach(b => {
    const X = px(b.x), Z = px(b.z), R = Math.round(b.r * PPY), on = b.id === cur.id;
    const ring0 = !b.hideRing && !(S.inst.targetable && !S.inst.targetable(S.t)); // ターゲットサークルは殴れるときだけ（hideRing：出てくる前）
    if (ring0) tcRing(X, Z, R, b.face ? Math.atan2(b.face.z, b.face.x) : -Math.PI / 2, on);
    if (ring0 && on && flash) alpha(.5, () => disc(X, Z, R, P.white)); // 被ダメの白フラッシュ
    drawBossSprite(b.art, X, Z);
  });
}

// ボスの正面（ヘイトを持っているタンクの方）のしずくと、ターゲット中のボスの頭上の白いピン。ボスの絵より手前に描く（ギミックの draw から呼ぶ）
function fillTri(pts, c){
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(q => ctx.lineTo(q[0], q[1])); ctx.closePath(); ctx.fill();
}
function drawBossFace(b){
  const X = px(b.x), Z = px(b.z), R = Math.round(b.r * PPY), on = b.id === curBoss().id;
  if (b.face) tcTip(X, Z, R, Math.atan2(b.face.z, b.face.x), on);
  if (on){ // しずく型のピン（丸が上・先が下）
    const cy = Z - R - 15;
    fillTri([[X, cy + 9], [X - 5, cy + 1], [X + 5, cy + 1]], '#101018');
    disc(X, cy, 5, '#101018');
    fillTri([[X, cy + 7.5], [X - 3.5, cy + 1], [X + 3.5, cy + 1]], '#ffe8f0');
    disc(X, cy, 4, '#ffe8f0');
    disc(X, cy, 2, '#ff7aa8');
  }
}

function drawSafe(){
  const inst = S.inst;
  if (!opt.safe || S.phase !== 'run' || !inst.safeActive?.(S.t)) return;
  const R2 = ARENA_R * ARENA_R;
  ctx.globalAlpha = .45; ctx.fillStyle = P.safe;
  for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2){
    const wx = (x - C0 + 1) / PPY, wz = (y - C0 + 1) / PPY;
    if (wx * wx + wz * wz > R2) continue;
    if (inst.safe(wx, wz, S.t)) ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

// 被弾（1回の判定につき1カウント）
let missStack = 0, missStackT = 0;
const misses = new Map(); // 理由 → 回数
function hurt(reason, onBoard = reason){
  if (window.__noHurt){ (window.__hurts ||= []).push(reason); return; } // テスト用（?debug のときだけ使う）
  const now = performance.now();
  S.hits++; S.hurtT = now; sfx.hurt();
  // 画面（ゲーム機の画面の枠の中）全体を赤く光らせる。続けて当たったら最初から光り直す
  const scr = document.querySelector('.screen') as HTMLElement;
  scr.classList.remove('hurt'); void scr.offsetWidth; scr.classList.add('hurt');
  // 被弾・死亡した時点で失敗（同じ瞬間の他のミスも数えるため、少しだけ待って終了）
  if (S.phase === 'run' && S.failAt == null) S.failAt = S.t + .8;
  misses.set(reason, (misses.get(reason) || 0) + 1);
  // 同時に2つミスしたときは縦にずらして両方見せる
  missStack = now - missStackT < 200 ? missStack + 1 : 0; missStackT = now;
  const el = document.createElement('div');
  el.className = 'dmg outline miss';
  el.innerHTML = onBoard ? `MISS<small>${onBoard}</small>` : 'MISS';
  el.style.left = (px(S.player.x) / W * 100) + '%';
  el.style.top = Math.max(2, (px(S.player.z) - 34) / W * 100 - missStack * 9) + '%';
  fxEl.appendChild(el);
  setTimeout(() => el.remove(), 1450);
}
// 被弾の赤い光は画面全体（style.css の .screen.hurt）に移した。フィールドには描かない
function drawHurtFlash(){}

export { W, C0, PPY, setPPY, cv, ctx, px, P, rect, disc, donut, ring, line, alpha, thickRing, fillArena, fillTell, GLYPH, glyph, icon5, corner, ICON, ROLE_COLOR, jobIconSvg, drawIcon, drawField, drawBoss, drawBossFace, targetLast, drawSafe, missStack, missStackT, misses, hurt, drawHurtFlash };
