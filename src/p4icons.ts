// @ts-nocheck
// P4 の状態異常アイコン（30×33 のドット絵）。実機アイコンの色合い・構図に寄せて描き起こしたもの（画像は使っていない）
// 描画は起動時に1回だけ行い、data URL にして使い回す
const W4 = 30, H4 = 34;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { t = Math.max(0, Math.min(1, t)); const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const inShape = (x, y) => { if (x < 1 || x > 28 || y < 1) return false;
  const bottom = 29 + Math.max(0, 4 - Math.abs(x - 14.5)) * .45; // 下の辺の真ん中が少し下へとがる（V）
  if (y > bottom) return false;
  const cx = x < 4 ? 4 : x > 25 ? 25 : x, cy = y < 4 ? 4 : y > bottom - 3 ? bottom - 3 : y; return Math.hypot(x - cx, y - cy) <= 3.2; };
function frame4(P, fill){
  for (let y = 0; y < H4; y++) for (let x = 0; x < W4; x++){
    if (!inShape(x, y)) continue;
    const edge = !inShape(x - 1, y) || !inShape(x + 1, y) || !inShape(x, y - 1) || !inShape(x, y + 1);
    const edge2 = !inShape(x - 2, y) || !inShape(x + 2, y) || !inShape(x, y + 2);
    if (edge) P.px(x, y, '#2a2a30');
    else if (edge2) P.px(x, y, x < 15 ? '#6a6a72' : '#4a4a52');
    else { const c = fill((x - 3) / 23, (y - 3) / 25, x, y); if (c) P.px(x, y, c); }
  }
}
// 立っている人影（u,v は 0〜1）
const person4 = (u, v, cx = .5, top = .15, s = 1) => { const dx = (u - cx) / s, dy = (v - top) / s;
  return Math.hypot(dx * 2.2, dy - .05) < .075 || (Math.abs(dx) < .07 && dy > .1 && dy < .48) || (Math.abs(dx) < .16 && dy > .12 && dy < .17) || (Math.abs(Math.abs(dx) - .14) < .035 && dy > .14 && dy < .42) || (Math.abs(Math.abs(dx) - .045) < .03 && dy > .46 && dy < .8); };
// 手足を広げた人（星形）：頭・胴・斜め上の腕・斜め下の脚
const star = (dx, dy, k = 1) => { dx /= k; dy /= k;
  const seg = (x0, y0, x1, y1, w) => { const vx = x1 - x0, vy = y1 - y0, t = Math.max(0, Math.min(1, ((dx - x0) * vx + (dy - y0) * vy) / (vx * vx + vy * vy))); return Math.hypot(dx - x0 - vx * t, dy - y0 - vy * t) < w; };
  return Math.hypot(dx, dy + .3) < .085 || seg(0, -.2, 0, .12, .07) || seg(0, -.16, -.3, -.36, .045) || seg(0, -.16, .3, -.36, .045) || seg(0, .1, -.22, .42, .05) || seg(0, .1, .22, .42, .05); };
// なめらかなまだら模様（値ノイズ）。x,y はドット、0〜1 を返す
const hash4 = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
const noise4 = (x, y, s = 0) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash4(xi, yi, s), b = hash4(xi + 1, yi, s), c = hash4(xi, yi + 1, s), d = hash4(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
// 正面向きに立つ人影（腕を少し開き、足を少し開く）。top＝頭のてっぺん、h＝全体の高さ（u,v は 0〜1）
const body4 = (u, v, top = .1, h = .78, spread = 1) => { const dx = Math.abs(u - .5), t = (v - top) / h;
  if (t < 0 || t > 1) return false;
  if (Math.hypot(dx * 1.1, t - .09) < .085) return true;                                  // 頭
  if (t > .16 && t < .2 && dx < .05) return true;                                         // 首
  if (t >= .19 && t < .27 && dx < .07 + (t - .19) * .6) return true;                       // 肩
  if (t >= .26 && t < .58 && dx < .1 - (t - .26) * .06) return true;                     // 胴
  if (t >= .24 && t < .62 && Math.abs(dx - (.125 + (t - .24) * .14 * spread)) < .035) return true; // 腕
  if (t >= .56 && dx < .085 + (t - .56) * .2 * spread && dx > Math.max(0, (t - .62) * .3)) return true; // 脚（股のあいだを空ける）
  return false; };
// 五芒星（頂点が上、辺はまっすぐ）。R＝外の半径、ri＝内のくぼみの半径
const star5 = (dx, dy, R, ri = R * .42) => { const pts = [];
  for (let i = 0; i < 10; i++){ const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : R; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  let inside = false;
  for (let i = 0, j = 9; i < 10; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > dy) !== (yj > dy) && dx < (xj - xi) * (dy - yi) / (yj - yi) + xi) inside = !inside; }
  return inside; };
const ICONS4 = {
  dead:{ name:'死者の傷', draw(P){ frame4(P, (u, v) => {
    const dx = u - .5;
    // 上の白いひし形（下向きの三角）
    if (v < .42 && Math.abs(dx) < .26 * (1 - v / .42) + .02 && v > .02) return Math.abs(dx) < .1 * (1 - v / .42) + .03 ? '#ffffff' : '#a8d8ff';
    // 同心の弧
    const r = Math.hypot(dx * 1.05, (v - .2) * 1.1);
    if (v > .3){ if (Math.abs(r - .5) < .045) return '#4ab8ff'; if (Math.abs(r - .62) < .055) return '#2a6aff'; if (Math.abs(r - .76) < .07) return '#3a2ae8'; if (r > .82) return '#5a3ad8'; }
    return mix('#0a1a3a', '#020208', v); }); } },
  live:{ name:'生者の傷', draw(P){ frame4(P, (u, v) => {
    const dx = u - .5, rr = Math.hypot(dx, (v - .17) * 1.1);
    if (rr < .1) return '#2a1018'; if (rr < .26) return Math.sin(Math.atan2(v - .17, dx) * 5) > .3 ? '#ffffff' : '#ff9ac0';
    const r = Math.hypot(dx * 1.05, (v - .2) * 1.1);
    if (v > .35){ if (Math.abs(r - .52) < .05) return '#e84ae8'; if (Math.abs(r - .64) < .05) return '#8a3ae8'; if (Math.abs(r - .76) < .07) return '#3a2ae8'; if (r > .82) return '#4a3ad8'; }
    return mix('#1a0a1a', '#020208', v); }); } },
  field:{ name:'アラガンフィールド', draw(P){ frame4(P, (u, v) => {
    const dx = u - .5, dy = v - .5;
    if (star(dx, dy, 1.15)) return '#000000';
    const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    const k = ((a / (Math.PI * 2) * 8 + .5) % 1 + 1) % 1, ray = r > .12 && Math.abs(k - .5) < .13 + r * .12;
    if (v > .6 && Math.abs(dx) > .18 && !ray) return mix('#8a2a1a', '#5a1010', v);
    if (v > .86 && Math.abs(dx) < .12) return '#e8c83a';
    if (v < .1) return '#4a4a3a';
    return ray ? mix('#fff05a', '#e8c020', r * 1.4) : mix('#2a2410', '#14100a', v); }); } },
  beyond:{ name:'死の超越', draw(P){ frame4(P, (u, v, x) => {
    const dx = u - .5;
    // 黒い影の人：大きめの頭（白い2つの目）＋肩幅の広いマントが下いっぱいに広がる
    if (Math.hypot(dx * 1.15, v - .38) < .17){ if (v > .35 && v < .42 && Math.abs(Math.abs(dx) - .08) < .035) return '#ffffff'; return '#1a0418'; }
    const w = v < .5 ? 0 : .22 + (v - .5) * 1.1;
    if (v >= .5 && Math.abs(dx) < w){ if (Math.abs(Math.abs(dx) - w) < .06 && v < .75) return '#c84ad8'; return v > .7 ? '#4a0a3a' : '#2a0628'; }
    if (v > .78 && Math.abs(dx) > .34) return '#c8b8ff';
    const st = Math.sin(x * 1.6) > .2;
    if (v < .55) return st ? mix('#c08aff', '#8a4ae8', v * 2) : mix('#6a3ac8', '#3a1a8a', v * 2);
    return mix('#7a2ab8', '#3a0a6a', v); }); } },
  bomb:{ name:'加速度爆弾', draw(P){ frame4(P, (u, v) => {
    const dx = u - .5, dy = v - .45, r = Math.hypot(dx, dy);
    if (r < .11) return '#ffffff'; if (r < .19) return mix('#ffffff', '#e8f0ff', (r - .11) * 10);
    if (u < .1) return mix('#1a2a4a', '#0a1430', v);
    if (v > .82) return Math.abs(dx) < .3 ? '#7a0a2a' : '#3a0a24';
    const diag = (u - v);                       // 右上が＋
    if (diag > .15 && v < .55) return mix('#9af8d8', '#3ab8a0', v * 1.8);          // 右上：青緑
    if (u < .5 && v < .5) return mix('#f8d8f8', '#a868c8', r * 2.2);               // 左上：白っぽいピンク〜紫
    if (Math.abs(diag + .05) < .12 && v > .5) return mix('#f0a8e8', '#c86ab8', r);  // 右下へのピンクのすじ
    return mix('#7a4aa8', '#4a1a5a', v); }); } },
  water:{ name:'水属性圧縮', draw(P){ frame4(P, (u, v) => {
    const dx = u - .5;
    const drop = v > .12 && v < .88 && (v > .55 ? Math.hypot(dx, v - .62) < .24 : Math.abs(dx) < (v - .12) * .52);
    if (drop) return Math.hypot(dx + .02, v - .6) < .14 ? '#ffffff' : mix('#f0ffff', '#8ae8ff', Math.hypot(dx, v - .55) * 3);
    return mix('#4ab8c8', '#0a3a6a', v * 1.1); }); } },
  fork:{ name:'フォークライトニング', draw(P){ frame4(P, (u, v, x, y) => {
    // 右上→左下に走るギザギザの稲妻と、まわりの白い光
    const path = vv => .78 - vv * .62 + (hash4(Math.floor(vv * 7), 0, 9) - .5) * .14;
    const d = Math.abs(u - path(v));
    const br = Math.min(Math.abs(u - (.36 - (v - .3) * .9)) + (v < .18 || v > .42 ? 1 : 0), Math.abs(u - (.66 + (v - .62) * .7)) + (v < .58 || v > .82 ? 1 : 0)); // 枝
    if (d < .05 || br < .03) return '#ffffff';
    if (d < .12 || br < .07) return '#f0e8ff';
    const glow = Math.max(0, .36 - d) * 2.2;
    const n = noise4(x * .2, y * .2, 1), m = noise4(x * .3 + 9, y * .3, 2);
    let c = n > .62 ? '#e83a7a' : n > .45 ? '#c040b0' : n > .3 ? '#8a3ad8' : '#4a50e0';
    if (m > .8) c = '#ffe0f4'; else if (m > .68) c = '#ff8ac8'; else if (m < .18) c = '#3a3ab8';
    return mix(c, '#ffffff', glow * glow); }); } },
  flame:{ name:'混沌の炎', draw(P){ frame4(P, (u, v, x, y) => {
    // 下から燃え上がる炎の地（上は暗い赤、下ほど明るいピンクがかった赤）
    const f = noise4(x * .5, y * .12 + 3, 5) + (1 - v) * -.2;
    let bg = mix('#7a0a14', '#e8303a', Math.min(1, v * 1.3));
    if (v > .55) bg = mix(bg, '#ff9a8a', (v - .55) * 1.8);
    if (f > .55) bg = mix(bg, '#ffb090', .45); else if (f < .2) bg = mix(bg, '#5a0408', .35);
    // 人影は暗い赤。足もとは炎に溶ける
    if (body4(u, v, .1, .76, .8)) return v > .72 ? mix('#5a0810', bg, (v - .72) * 4) : '#4a050c';
    return bg; }); } },
  wave:{ name:'混沌の水', draw(P){ frame4(P, (u, v, x, y) => {
    // 上から落ちる水の筋（暗い紺〜青緑）、下は明るい水しぶき
    const fall = noise4(x * .7, y * .08, 7);
    let bg = mix('#0a1a2a', '#1a4a6a', v * 1.2);
    if (fall > .6 && v < .7) bg = mix('#9ac8e0', bg, .25 + v * .6); else if (fall > .45) bg = mix(bg, '#3a7a9a', .4);
    const surf = .78 + Math.sin(x * .9) * .03;
    if (v > surf) bg = mix('#c8f4ff', '#5ac8f0', (v - surf) * 3 + noise4(x * .8, y * .8, 8) * .4);
    else if (v > surf - .06) bg = '#e8ffff';
    if (body4(u, v, .07, .8, 1.2)) return v > surf ? mix('#0a2030', bg, .35) : '#02060c';
    return bg; }); } },
  shriek:{ name:'呪詛の叫声', draw(P){ frame4(P, (u, v) => {
    const r = Math.hypot(u - .5, (v - .38) * 1.05);
    if (r < .38 && r > .28) return r > .34 ? '#e8701a' : '#ff9a3a';
    if (r <= .28) return mix('#6a3a1a', '#3a1a0a', r * 3);
    return mix('#3a3a40', '#1a1a1e', v); }); } },
};

let urls = null;
// アイコン名 → 画像の URL（最初に呼ばれたときに描く）
function p4IconUrl(id){
  if (!urls){
    urls = {};
    for (const [k, ic] of Object.entries(ICONS4)){
      const c = document.createElement('canvas'); c.width = W4; c.height = H4;
      const g = c.getContext('2d');
      const P = { px(x, y, col){ if (x < 0 || y < 0 || x >= W4 || y >= H4) return; g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); } };
      ic.draw(P); urls[k] = c.toDataURL();
    }
  }
  return urls[id];
}

export { p4IconUrl };
