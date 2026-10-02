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
    // 斜めに走る白い光（左下→右上）
    const d = Math.abs((u - .5) + (v - .5) * 1.1 - Math.sin(v * 9) * .06);
    if (d < .06) return '#ffffff'; if (d < .11) return '#e8f0ff';
    const n = Math.sin(x * .9 + 1.3) + Math.cos(y * .8 - .7) + Math.sin((x + y) * .4);
    if (n > 1.2) return '#ff6a9a'; if (n > .4) return '#c84ab8';
    if (n < -1.1) return '#4a6ae8'; if (n < -.3) return '#8a5ae8';
    return '#b878e0'; }); } },
  flame:{ name:'混沌の炎', draw(P){ frame4(P, (u, v, x) => {
    if (person4(u, v, .5, .1, 1)) return '#120404';
    const st = Math.sin(x * 1.9) > .35;
    if (v > .62) return st ? mix('#ff6a4a', '#d83a2a', v) : mix('#c82a2a', '#7a1010', v);
    return st ? mix('#ffa080', '#ff6a5a', v) : mix('#ff5a4a', '#e8303a', v); }); } },
  wave:{ name:'混沌の水', draw(P){ frame4(P, (u, v, x) => {
    if (person4(u, v, .5, .04, 1)) return '#020a10';
    const st = Math.sin(x * 1.9 + 1) > .45;
    if (v > .62) return st ? '#c8f8ff' : mix('#5ad8f0', '#2a8ab0', v);
    return st ? mix('#8af0ff', '#4ac8e0', v) : mix('#1a4a5a', '#2a6a8a', v); }); } },
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
