import { ARENA_R, BOSS_R, SQ2 } from './config.js';
import { JOBS, job } from './jobs.js';
import { opt } from './store.js';
import { A, fxEl, hasInvuln, hasMit } from './action.js';
import { S } from './state.js';
import { sfx } from './audio.js';

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
  1:'010110010010111', 2:'110001010100111', 3:'110001010001110', 4:'101101111001001', 5:'111100110001110'
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
function jobIconSvg(id){
  const role = JOBS[id].role, [bg, hi] = ROLE_COLOR[role];
  let r = `<rect x="1" y="0" width="13" height="15" fill="#d8b060"/><rect x="0" y="1" width="15" height="13" fill="#d8b060"/>` +
    `<rect x="2" y="1" width="11" height="13" fill="${bg}"/><rect x="1" y="2" width="13" height="11" fill="${bg}"/><rect x="2" y="1" width="11" height="3" fill="${hi}"/>`;
  ICON[id].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') r += `<rect x="${2 + i}" y="${2 + j}" width="1" height="1" fill="#f4d888"/>`; }));
  return `<svg viewBox="0 0 15 15" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
function drawIcon(X, Z, hurt){
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

function drawField(){
  rect(0, 0, W, W, P.space);
  for (let i = 0; i < 60; i++) rect((i * 97 + 13) % W, (i * 53 + 29) % W, 1, 1, P.star);
  const R = ARENA_R * PPY;
  disc(C0, C0, R, P.floor);
  // 床の模様：2yグリッド + 10yごとの斜め線
  ctx.fillStyle = P.grid;
  for (let k = -10; k <= 10; k++){
    const o = Math.round(k * 2 * PPY); if (Math.abs(o) >= R) continue;
    const hw = Math.floor(Math.sqrt(R * R - o * o));
    ctx.fillRect(C0 + o, C0 - hw, 1, hw * 2 + 1); ctx.fillRect(C0 - hw, C0 + o, hw * 2 + 1, 1);
  }
  ctx.fillStyle = P.diag;
  const D = Math.round(10 * PPY);
  for (let y = -R; y <= R; y++){
    const hw = Math.floor(Math.sqrt(R * R - y * y));
    for (let k = -4; k <= 4; k++){
      const xa = k * D - y, xb = y + k * D;
      if (Math.abs(xa) <= hw) ctx.fillRect(C0 + xa, C0 + y, 1, 1);
      if (Math.abs(xb) <= hw) ctx.fillRect(C0 + xb, C0 + y, 1, 1);
    }
  }
  S.inst?.drawFloor?.(S.t);
  thickRing(C0, C0, R + 3, P.rim, 3);
  ring(C0, C0, R + 4, P.rim2);
  // フィールドマーカー
  const m = 16, d = Math.round(m / SQ2);
  [['A',0,-m],['B',m,0],['C',0,m],['D',-m,0]].forEach(([t, x, z], i) => {
    alpha(.35, () => disc(px(x), px(z), 5, P.mk[i])); ring(px(x), px(z), 5, P.mk[i]); glyph(t, px(x), px(z), P.white);
  });
  const corners = opt.marker === 'nw' ? [[-d,-d],[d,-d],[d,d],[-d,d]] : [[d,-d],[d,d],[-d,d],[-d,-d]];
  corners.forEach(([x, z], i) => {
    const X = px(x), Z = px(z), c = P.mk[i];
    alpha(.35, () => rect(X - 5, Z - 5, 11, 11, c));
    line(X - 5, Z - 5, X + 5, Z - 5, c); line(X + 5, Z - 5, X + 5, Z + 5, c); line(X + 5, Z + 5, X - 5, Z + 5, c); line(X - 5, Z + 5, X - 5, Z - 5, c);
    glyph(String(i + 1), X, Z, P.white);
  });
}

// ボス：塗りつぶしのターゲットサークル + 正面の三角（北向き）
function drawBoss(){
  const R = BOSS_R * PPY;
  alpha(.6, () => disc(C0, C0, R, P.boss));
  ring(C0, C0, R, P.bossEdge);
  alpha(.5, () => ring(C0, C0, R - 6, P.bossEdge));
  for (let i = 0; i < 5; i++) line(C0 - i, C0 - R - 4 + i, C0 + i, C0 - R - 4 + i, P.bossTip);
  if (performance.now() - A.bossFlash < 90) alpha(.5, () => disc(C0, C0, R, P.white)); // 被ダメの白フラッシュ
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
function drawHurtFlash(){
  const dt = performance.now() - S.hurtT; if (dt > 400) return;
  const a = 1 - dt / 400;
  alpha(.22 * a, () => rect(0, 0, W, W, P.hurt));
  alpha(a, () => { rect(0, 0, W, 4, P.hurt); rect(0, W - 4, W, 4, P.hurt); rect(0, 0, 4, W, P.hurt); rect(W - 4, 0, 4, W, P.hurt); });
}

export { W, C0, PPY, setPPY, cv, ctx, px, P, rect, disc, donut, ring, line, alpha, thickRing, fillArena, GLYPH, glyph, icon5, corner, ICON, ROLE_COLOR, jobIconSvg, drawIcon, drawField, drawBoss, drawSafe, missStack, missStackT, misses, hurt, drawHurtFlash };
