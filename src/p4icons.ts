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
// 少ない色で描いたドット絵（文字＝色）を、アイコンの中の大きさに合わせて広げる（となりの色となめらかにつなぐ）
const grid4 = (rows, pal) => (u, v) => {
  const H = rows.length, W = rows[0].length, gx = Math.max(0, Math.min(W - 1, u * W - .5)), gy = Math.max(0, Math.min(H - 1, v * H - .5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = gx - x0, fy = gy - y0;
  const c = (x, y) => hex(pal[rows[y][x]]);
  const k = [[c(x0, y0), (1 - fx) * (1 - fy)], [c(x1, y0), fx * (1 - fy)], [c(x0, y1), (1 - fx) * fy], [c(x1, y1), fx * fy]];
  return '#' + [0, 1, 2].map(i => Math.round(k.reduce((a, [q, w]) => a + q[i] * w, 0)).toString(16).padStart(2, '0')).join(''); };
// P3 のファースト〜サードターゲット：格子の入った黒い球に光る点が n 個、上にローマ数字
const p3target = n => (u, v) => {
  const purple = n === 2, rim = purple ? '#e070e8' : '#6a9aff';
  // 上のローマ数字（白・黒ぶち、上下にひげ飾り）：縦棒 n 本
  const gap = n === 2 ? .22 : .18, x0 = .5 - gap * (n - 1) / 2, sx = Array.from({ length:n }, (_, i) => x0 + i * gap);
  const L = sx[0] - .07, R = sx[n - 1] + .07, inV = v > -.02 && v < .36;
  if (inV){
    const serif = (v < .07 || v > .27) && sx.some(c => Math.abs(u - c) < .08), stem = sx.some(c => Math.abs(u - c) < .04);
    if (serif || stem) return v < .07 || v > .27 ? '#e8e8ec' : '#ffffff';
    const serif2 = (v < .1 || v > .24) && sx.some(c => Math.abs(u - c) < .12), stem2 = sx.some(c => Math.abs(u - c) < .085);
    if ((serif2 || stem2) && u > L - .05 && u < R + .05) return '#0a0a10';
  }
  const dx = u - .5, dy = v - .68, r = Math.hypot(dx, dy) / .3;
  if (r < 1){
    const dots = n === 1 ? [[.5, .68]] : n === 2 ? [[.33, .66], [.67, .66]] : [[.5, .53], [.34, .77], [.66, .77]];
    for (const [cx, cy] of dots){ const d = Math.hypot(u - cx, v - cy); if (d < .05) return '#ffffff'; if (d < .085) return purple ? '#ffc0ff' : '#b8dcff'; if (d < .12) return purple ? '#d050e0' : '#4a7aff'; }
    if (r > .9) return rim;
    if (Math.abs(dx) < .012 || Math.abs(dy) < .012) return purple ? '#7a2a8a' : '#2a3a8a'; // 格子
    return mix('#1e1e30', '#020206', r);
  }
  return purple ? mix('#e070e0', '#6a1878', v) : mix('#6a8ae8', '#1a2a78', v); };
// 文字や人影の形（'#'＝形）を、アイコンの中の位置 [x0,y0,x1,y1] に広げて、その点が形の中かを返す
const mask4 = (rows, box) => (u, v) => { const [x0, y0, x1, y1] = box; if (u < x0 || u >= x1 || v < y0 || v >= y1) return false;
  const c = Math.floor((u - x0) / (x1 - x0) * rows[0].length), r = Math.floor((v - y0) / (y1 - y0) * rows.length); return rows[r][c] === '#'; };
const near4 = (m, u, v, d) => m(u - d, v) || m(u + d, v) || m(u, v - d) || m(u, v + d) || m(u - d, v - d) || m(u + d, v + d) || m(u - d, v + d) || m(u + d, v - d);
// 決戦α／β：つやのある地に、明るい三角（ピラミッド）。真ん中に白い文字（濃い色のふち）
const p3hero = (glyph, c0, c1, tri, edge, ink) => (u, v) => {
  if (glyph(u, v)) return v < .5 ? '#ffffff' : ink;
  if (near4(glyph, u, v, .04)) return edge;
  const inTri = v > .02 + Math.abs(u - .5) * 1.2;
  const gloss = v < .32 ? .25 : 0;
  return mix(mix(inTri ? tri : c0, c1, v * .9), '#ffffff', gloss); };
// 線分（太さ w）とリングで形を作る
const segIn = (u, v, ax, ay, bx, by, w) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(u - ax - dx * t, v - ay - dy * t) < w; };
const ALPHA = (u, v) => Math.abs(Math.hypot((u - .4) / .95, v - .6) - .17) < .065 || segIn(u, v, .56, .62, .8, .36, .065) || segIn(u, v, .56, .62, .82, .88, .065);
const BETA = (u, v) => segIn(u, v, .36, .3, .36, 1.05, .065) || (u > .36 && Math.abs(Math.hypot(u - .46, v - .38) - .13) < .06 && !(u < .46 && v > .38)) || (u > .36 && Math.abs(Math.hypot(u - .48, v - .7) - .17) < .065 && !(u < .48 && v < .7 && v > .55)) || segIn(u, v, .36, .52, .5, .52, .05);
// 混沌の風・逆風：青緑のうずまきの地に、白い人影
const p3wind = fig => (u, v) => {
  if (fig(u, v)) return '#f4f8f8';
  if (near4(fig, u, v, .04)) return '#0a2a30';
  const dx = u - .55, dy = v - .3, r = Math.hypot(dx, dy), an = Math.atan2(dy, dx), n = noise4(u * 6, v * 6, 31);
  const arm = Math.sin(an * 2 - Math.log(r + .03) * 4.5 + n);
  if (arm > .6) return mix('#b8f0f0', '#5ac8d0', 1 - (arm - .6) / .4);
  if (arm > .1) return mix('#5ac0cc', '#2a8a9a', r);
  return mix('#2a8494', '#0e3a48', r * 1.1); };
// 前かがみで走る（背中に風を受ける）／のけぞって倒れる（正面から風を受ける）：頭は丸、手足と胴は太い線
const RUNNER = (u, v) => Math.hypot(u - .78, v - .34) < .1 || segIn(u, v, .62, .54, .4, .67, .09) || segIn(u, v, .6, .56, .86, .7, .055) || segIn(u, v, .88, .7, .92, .82, .05)
  || segIn(u, v, .42, .66, .26, .82, .07) || segIn(u, v, .26, .82, .08, .9, .06) || segIn(u, v, .42, .66, .6, .82, .07) || segIn(u, v, .6, .82, .5, .98, .06);
const FALLER = (u, v) => Math.hypot(u - .3, v - .44) < .1 || segIn(u, v, .47, .6, .66, .78, .09) || segIn(u, v, .48, .58, .62, .32, .055) || segIn(u, v, .62, .32, .66, .14, .05)
  || segIn(u, v, .66, .78, .86, .72, .07) || segIn(u, v, .86, .72, 1, .62, .06) || segIn(u, v, .64, .8, .74, .94, .07) || segIn(u, v, .74, .94, .98, .96, .06);
// 混沌の炎・水：正面向きの黒い人影（光るふち）。背景は炎（赤〜橙）または水しぶき（青〜水色）、足もとに白い輪
const p3elem = fire => (u, v) => {
  const n = noise4(u * 4, v * 6, fire ? 41 : 42), n2 = noise4(u * 9, v * 9, 43);
  const body = (uu, vv) => body4(uu, vv, .08, .9, 1);
  if (body(u, v)) return mix(fire ? '#4a1414' : '#0a1a2a', fire ? '#c03020' : '#1a6aa8', Math.max(0, v - .5) * 1.6);
  if (body(u - .03, v) || body(u + .03, v) || body(u, v - .03) || body(u, v + .03)) return fire ? '#ff6a7a' : '#5af0f0';
  const ring = Math.abs(Math.hypot((u - .5) / .5, (v - .86) / .1) - 1);
  if (ring < .22 && v > .76) return ring < .1 ? '#ffffff' : fire ? '#ffc0a0' : '#a0e8ff';
  if (fire){ const f = n * 1.1 + v * .7 + (n2 - .5) * .3; return f > 1.2 ? '#ffd890' : f > .95 ? '#ff8a40' : f > .7 ? '#e83a3a' : f > .45 ? '#a82030' : '#5a1a2a'; }
  if (n2 > .8 && v > .3) return '#8ab0ff';
  const f = n * .8 + v * .7; return f > 1.1 ? '#5ad0e8' : f > .8 ? '#2a7ab0' : f > .5 ? '#1a4a78' : '#2a3a50'; };
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
  field:{ name:'アラガンフィールド', draw(P){ frame4(P, grid4(['nggwgggwwgggwggn', 'ggggggnggngggngg', 'ggnnggbggbggnnng', 'ggnnnyYYgYygnngg', 'nYYnnYybnYYnnYYn', 'nnyyYYynkYyYyyYn', 'YbnbbYbdknbbbnnY', 'YYYbndkkkkknnYYY', 'bYYyyYkkkkbyyYYY', 'dBBBYynkkdYybBBB', 'BBbYYynkkdYyYbBB', 'BoobbYdkkkYYbYob', 'gbBbYYkkkknYbBbo', 'BBBbynkdnkkYYBBB', 'bbboykkbYkkYYbbb', 'BbbYYkdYynknyggB', 'ddbgYknyYYdnwgdd'],
    { y:'#f0e440', Y:'#b0a828', o:'#d08030', b:'#8a3018', B:'#5a2010', k:'#080800', n:'#3a3a18', g:'#8a8a68', w:'#f0f0a0', d:'#1a1a10' })); } },
  beyond:{ name:'死の超越', draw(P){ frame4(P, grid4(['PLLLLLLLLLLLLLLLLL', 'PllPPPPPllBlPPPPPP', 'PPPPPPPllPllVPPlPP', 'lPlPPPPPPPllVPPPPP', 'PPVVPPPPPPPVVPvVPP', 'PvvVvvvVVVmVVVvvVP', 'PDDvvDvVVVVVvvvvVv', 'PDDVvvVvDvvDvvvPlP', 'HDvVvvVvDHHxDVVlBV', 'HDvVVDVDDxKKDVVBBV', 'HDVmVvVvExKEDVVlBP', 'DvVmmVmvHKKHHmmEBV', 'vVmmVVVvHKKHvVVVEm', 'PmVvvvHHKKKKxHvPvV', 'PvHHKKKKKKKKKKKKHH', 'PHKKKKKKKKKKKKKKKK', 'HKKPPKKKKKKKKKKPvx', 'KvlBBDxxxHHxxHDlEE', 'PEBBBPHHHHHHHHvllB', 'HlBBBlDHHHHHHHllBB'],
    { L:'#c8bcd8', l:'#8a70b0', P:'#6a4a88', V:'#8030a8', v:'#5a1080', D:'#3a0058', K:'#1a0018', m:'#a850d8', B:'#a8a0e8', E:'#d8a8e8', H:'#4a0a48', x:'#201828' })); } },
  bomb:{ name:'加速度爆弾', draw(P){ frame4(P, grid4(['sMMMMMMMMMMMMMMm', 'lssMMMmmmmmmmmmg', 'lsMMsMsmmmmmmmmt', 'lsssMsllmmmmtmmt', 'lpsMpplllmmttttt', 'lkpspssllmgttttg', 'kpssslspMslgTTtt', 'kllllsWWWWsguTTt', 'lluulsWWWWsluTtg', 'uuuulsWWWWpluTTg', 'uuTulMWWWWpluTTu', 'rTTglsMWWpsluruu', 'nnTgmllllspluuuu', 'nnTgguuuulsslslu', 'nnnTnnnrrRupklpl', 'durnnnrrrRRukksu'],
    { W:'#ffffff', M:'#c4ecdc', m:'#78ecd0', t:'#3a9a84', T:'#2a6a64', p:'#e8d4ea', s:'#c4c4d0', l:'#a890b0', u:'#6a5a7a', g:'#5a8a98', n:'#1a2a40', r:'#5a2048', R:'#9a1a58', k:'#f4d4f4', d:'#0a1a1a' })); } },
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
  // ---- P3 前半 ----
  heroA:{ name:'決戦α［被］', draw(P){ frame4(P, p3hero(ALPHA, '#d82020', '#8a0808', '#f05050', '#5a0408', '#ffd8d8')); } },
  heroB:{ name:'決戦β［被］', draw(P){ frame4(P, p3hero(BETA, '#c89818', '#7a5a08', '#e8c040', '#3a2604', '#f8e8c0')); } },
  windBack:{ name:'混沌の風', draw(P){ frame4(P, p3wind(RUNNER)); } },   // 背中から受けると解除（前かがみで走る絵）
  windFront:{ name:'混沌の逆風', draw(P){ frame4(P, p3wind(FALLER)); } }, // 正面から受けると解除（のけぞる絵）
  fireP3:{ name:'混沌の炎', draw(P){ frame4(P, p3elem(true)); } },
  waterP3:{ name:'混沌の水', draw(P){ frame4(P, p3elem(false)); } },
  // ---- P3 じしん＆ブラックホール（実機アイコンの色合い・構図に寄せて描き起こしたもの） ----
  // ファースト／セカンド／サードターゲット：青（II は紫）の地に、格子の入った黒い球。球の中に光る点が 1〜3 個、上に I〜III
  tgt1:{ name:'ファーストターゲット', draw(P){ frame4(P, p3target(1)); } },
  tgt2:{ name:'セカンドターゲット', draw(P){ frame4(P, p3target(2)); } },
  tgt3:{ name:'サードターゲット', draw(P){ frame4(P, p3target(3)); } },
  // 混沌の泥土：こげ茶の泥に、角ばった薄茶の小石が沈んでいく。2/3 の高さに地層の帯、下は黒い線で区切った石畳
  mud:{ name:'混沌の泥土', draw(P){ frame4(P, (u, v) => {
    const stones = [[.3, .22, .13], [.74, .1, .1], [.62, .4, .12], [.2, .5, .09], [.08, .08, .06]];
    for (const [cx, cy, r] of stones){ const d = Math.max(Math.abs(u - cx) * .85 + Math.abs(v - cy) * .75, Math.abs(u - cx) * .9, Math.abs(v - cy));
      if (d < r){ const lt = (cx - u) + (cy - v); return lt > r * .3 ? '#f8e0b0' : lt > -r * .3 ? '#e0b070' : '#a87440'; }
      if (d < r + .035) return '#1a1008'; }
    const n = noise4(u * 7, v * 7, 1);
    if (v > .6 && v < .65) return '#f0b860';
    if (v >= .65 && v < .68) return '#1a1008';
    if (v >= .68){ // 石畳：いちばん近い点・2番目に近い点の差が小さいところが黒い線
      let d1 = 9, d2 = 9, id = 0;
      for (let i = 0; i < 8; i++){ const sx = (i % 4 + .5) / 4 + (hash4(i, 1, 5) - .5) * .15, sy = .72 + (i >> 2) * .17 + (hash4(i, 2, 5) - .5) * .06, d = Math.hypot(u - sx, (v - sy) * 1.3);
        if (d < d1){ d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d; }
      if (d2 - d1 < .07) return '#1a1008';
      return ['#f8d898', '#e8b068', '#d09048', '#f0c078'][id % 4]; }
    return mix(mix('#6a4a1c', '#3a2408', v * 1.4), '#24160a', n * .5); }); } },
  // 混沌の土：太い赤茶の Z の帯（黒ぶち）を、4つの金色の三角が挟む。三角の帯側のふちは白く光る。下半分に大きな白い岩
  earth:{ name:'混沌の土', draw(P){ frame4(P, grid4(['GGGGGGGGGWKRRRRRRRRR', 'GGGGGGGGWWKRRRRRRRRK', 'GGGGGWWWKKKRRRRRKKKK', 'GGWWWKKKRRRRRRKKKWWW', 'WWKKKRRRRRRKKKWWWGGG', 'KKrrrrRRRRRKWWWWGooo', 'rrrrrrrRRRRKKKKKWWWW', 'KKKKKrrRRRRRRRRRKKKK', 'WWWWWKKKKKKKRRRRRRRR', 'GGGGGoWWWWWWKKRRRRKK', 'GGooooooooooWKKKKKKW', 'oooooddSdddSSSSdKWWo', 'oooodwSSsswwssssoooo', 'oooodwsssswwssssdoog', 'ooodwwSSwwSSSSssSdgg', 'oodwwwSSwwSSSSddssdg', 'oodSwwSSssSSSsssddSd', 'oodSSSSSsdSSssdddddg', 'oodSSSSSSSSSssSsddgg', 'ogggdSSSSSSSsdssdggg', 'gggggSSSddddddSsdggg', 'gggggdSSddddddsddggg'],
    { G:'#ecc050', W:'#fff2cc', K:'#100402', R:'#8a3418', r:'#4a1608', o:'#c08a2a', g:'#8a5c14', S:'#ece6d4', s:'#bcb09a', w:'#ffffff', d:'#6a5a44' })); } },
  // 土属性耐性低下［強］：赤い地に、薄茶と黄土色が交互の山形（＾）が積み重なる。上に白い十字（黒ぶち）
  earthDown:{ name:'土属性耐性低下［強］', draw(P){ frame4(P, (u, v) => {
    const dx = Math.abs(u - .5);
    const plus = (v < .32 && dx < .07) || (v > .06 && v < .16 && dx < .27), plus2 = (v < .36 && dx < .11) || (v > .02 && v < .2 && dx < .31);
    if (plus) return (v < .1 && dx >= .07) || v < .05 ? '#f4f4f4' : dx < .025 && v < .2 ? '#e0e0e0' : v > .13 ? '#9a9a9a' : '#c4c4c4'; // 銀色
    if (plus2) return '#1a0c08';
    const k = v - .34 - dx * .95;               // 山形（＾）の帯：頂点が上の真ん中、両はしへ下がる
    if (v > .3 && k > 0 && k < .56 && dx < .48){ const b = (k / .1) | 0; return b % 2 ? mix('#c88a34', '#a86a20', k) : mix('#f0cc8a', '#e0b070', k); }
    return mix(mix('#e07a6a', '#c0382a', v * 1.3), '#8a2018', Math.max(0, dx - .3) * 2); }); } },
  // 無の侵食（無の波動を1回受けた）：濃い青の地に、うずまき（中心は黒、腕は水色）
  void1:{ name:'無の侵食', draw(P){ frame4(P, (u, v) => {
    const dx = u - .48, dy = v - .55, r = Math.hypot(dx, dy * 1.05), an = Math.atan2(dy, dx);
    if (r < .07) return '#02040e';
    const arm = Math.sin(an * 2 + Math.log(r + .02) * 5.5), n = noise4(u * 8, v * 8, 12);
    const k = Math.min(1, r * 1.8);
    if (arm > .55) return mix('#a8d4ff', '#4a80ff', 1 - (arm - .55) / .45 + n * .3);
    if (arm > .1) return mix('#2a5ae8', '#1a2a9a', k * .5 + n * .3);
    return mix('#0a1050', '#2a3aa8', k * .8); }); } },
  // 無の蝕み（無の波動を2回受けた。次で即死）：青い稲妻の地に、上の黒い塔から真下へ落ちる白い光の柱
  void2:{ name:'無の蝕み', draw(P){ frame4(P, (u, v) => {
    const dx = Math.abs(u - .5), n = noise4(u * 9, v * 9, 13), n2 = noise4(u * 5, v * 3, 14);
    const tower = Math.hypot(dx / .26, (v - .16) / .2);
    if (tower < 1) return tower > .82 ? '#c8d4f0' : v < .12 ? mix('#8a92a8', '#3a4050', dx * 4) : '#101218';
    const beamW = .1 + Math.max(0, v - .3) * .12;
    if (v > .3 && dx < beamW) return dx < beamW * .5 ? '#ffffff' : '#c8ecff';
    if (v > .3 && dx < beamW + .05) return '#5a8af0';
    const bolt = Math.abs(Math.sin(u * 8 + n2 * 6) + Math.sin(v * 7 + n * 4)) / 2;
    if (bolt < .05) return '#f0f8ff';
    if (bolt < .12) return '#7ac0ff';
    return mix(mix('#3a6ae8', '#1a2a8a', v), '#0e1a60', n * .5); }); } },
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
