// @ts-nocheck
// P2 のアイコン（ドット絵）。実機の色合い・形に寄せて描き起こしたもの（画像は使っていない）
// スペルハザード（30×34、P4 のデバフと同じ盾の形、右上に残りの数）と、頭上の予兆マーク（24×24：扇・円・頭割り）
// 描画は最初に使うときに1回だけ行い、使い回す
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { t = Math.max(0, Math.min(1, t)); const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function canvas(w, h){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  return { c, px(x, y, col){ if (x < 0 || y < 0 || x >= w || y >= h) return; g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); } };
}

// ===== スペルハザード =====
const W4 = 30, H4 = 34;
const inShape = (x, y) => { if (x < 1 || x > 28 || y < 1) return false; const bottom = 29 + Math.max(0, 4 - Math.abs(x - 14.5)) * .45; if (y > bottom) return false;
  const cx = x < 4 ? 4 : x > 25 ? 25 : x, cy = y < 4 ? 4 : y > bottom - 3 ? bottom - 3 : y; return Math.hypot(x - cx, y - cy) <= 3.2; };
const DIG = { 1:['.#.', '##.', '.#.', '.#.', '###'], 2:['##.', '..#', '.#.', '#..', '###'], 3:['##.', '..#', '.#.', '..#', '##.'], 4:['#.#', '#.#', '###', '..#', '..#'] };
function spellTrouble(P, n){
  for (let y = 0; y < H4; y++) for (let x = 0; x < W4; x++){
    if (!inShape(x, y)) continue;
    const edge = !inShape(x - 1, y) || !inShape(x + 1, y) || !inShape(x, y - 1) || !inShape(x, y + 1);
    const edge2 = !inShape(x - 2, y) || !inShape(x + 2, y) || !inShape(x, y + 2) || !inShape(x, y - 2);
    if (edge) P.px(x, y, '#24160a');
    else if (edge2) P.px(x, y, x < 15 ? '#d8b060' : '#8a6420');
    else P.px(x, y, [[6, 22], [9, 26], [23, 24], [21, 19], [7, 15], [24, 11]].some(([a, b]) => Math.hypot(x - a, y - b) < 1.1) ? '#ffb040' : mix('#2e1c08', '#b8781c', (y - 3) / 26));
  }
  const G = '#ffe9a0', G2 = '#e0a838';
  for (let y = 12; y <= 29; y++){ P.px(14, y, G); P.px(15, y, G2); }                    // 剣
  for (let x = 10; x <= 19; x++) P.px(x, 13, x < 15 ? G : G2); P.px(9, 12, G2); P.px(20, 12, G2); // つば
  [[13, 8], [14, 7], [15, 7], [16, 8], [16, 9], [15, 10], [14, 10], [13, 9]].forEach(([x, y]) => P.px(x, y, G)); P.px(14, 8, '#fff'); P.px(15, 9, '#fff');
  [[12, 10], [11, 9], [10, 9], [9, 10], [8, 11], [8, 12], [9, 13], [17, 10], [18, 9], [19, 9], [20, 10], [21, 11], [21, 12], [20, 13], [7, 10], [6, 11], [22, 10], [23, 11],
    [11, 15], [10, 16], [18, 15], [19, 16], [12, 18], [17, 18]].forEach(([x, y]) => P.px(x, y, G2)); // 羽根の渦
  const d = DIG[n], ox = 22, oy = 2, on = (y, x) => d[y]?.[x] === '#';
  for (let y = -1; y <= 5; y++) for (let x = -1; x <= 3; x++){
    if (on(y, x)) continue;
    if ([[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => on(y + a, x + b))) P.px(ox + x, oy + y, '#111');
  }
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (on(y, x)) P.px(ox + x, oy + y, '#fff');
}

// ===== 頭上の予兆マーク（24×24） =====
const S = 24, C = 11.5;
function fan(P){ // 扇（ウェーブ）：オレンジの 90 度の扇。要（かなめ）が下
  const ay = 20;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const dx = x - C, dy = ay - y, r = Math.hypot(dx, dy), ang = Math.atan2(dx, dy) * 180 / Math.PI;
    if (dy < 0 || r > 18.5 || Math.abs(ang) > 45.5) continue;
    if (r > 16.6 || Math.abs(ang) > 38){ P.px(x, y, r > 17.6 || Math.abs(ang) > 42 ? '#7a4a0c' : '#ffd25a'); continue; }
    let c = mix('#ffe070', '#d0601a', r / 16);
    if (Math.abs(Math.abs(ang) - 15) < 2.2 && r > 4) c = mix(c, '#ffd25a', .5);
    P.px(x, y, r < 3.2 ? '#fff3b0' : c);
  }
}
function circ(P){ // 円（スキャッター）：とげのある金の丸、まん中がオレンジに光る
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const dx = x - C, dy = y - C, r = Math.hypot(dx, dy), spike = (Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2) && r < 11.6;
    if (r <= 8.6) P.px(x, y, r > 7.6 ? '#7a4a0c' : r > 6.4 ? '#ffd25a' : mix('#fff0a0', '#e06818', r / 6.4));
    else if (spike) P.px(x, y, r > 10.6 ? '#7a4a0c' : '#ffd25a');
  }
}
function stack(P){ // 頭割り（ドライブ）：上下左右の金の山形（V）がまん中を向く＋まん中の光る点
  const V = ['##.....##', '###...###', '.###.###.', '..#####..', '...###...', '....#....'];
  const on = new Map();
  [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => V.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '#') return;
    const s = c - 4, d = 10 - r;
    on.set(Math.round(C + dx * d + (dy ? s : 0)) + ',' + Math.round(C + dy * d + (dx ? s : 0)), r < 2 ? '#ffd25a' : '#fff0a8');
  })));
  for (const k of on.keys()){ const [x, y] = k.split(',').map(Number); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!on.has((x + a) + ',' + (y + b))) P.px(x + a, y + b, '#7a4a0c'); }
  for (const [k, col] of on){ const [x, y] = k.split(',').map(Number); P.px(x, y, col); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){ const r = Math.hypot(x - C, y - C); if (r < 2.6) P.px(x, y, r < 1.3 ? '#fffbe0' : '#ffc040'); }
}

let urls = null, marks = null;
// スペルハザードの残り n（1〜4）→ 画像の URL（左上のデバフ用）
function spellTroubleUrl(n){
  if (!urls){ urls = {}; for (const k of [1, 2, 3, 4]){ const P = canvas(W4, H4); spellTrouble(P, k); urls[k] = P.c.toDataURL(); } }
  return urls[n];
}
// 頭上マーク（'fan' | 'circ' | 'stack'）→ canvas（フィールドに drawImage する）
function markCanvas(kind){
  if (!marks){ marks = {}; for (const [k, f] of Object.entries({ fan, circ, stack })){ const P = canvas(S, S); f(P); marks[k] = P.c; } }
  return marks[kind];
}

export { spellTroubleUrl, markCanvas };
