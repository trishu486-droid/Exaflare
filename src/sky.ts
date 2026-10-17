// @ts-nocheck
// =====================================================================
// 画面全体の背景の空（ドット絵）。実機の雰囲気に寄せて描いたオリジナル（ユーザーの画像 2026-10-16。公式の絵は使わない）
//   storm：暗い嵐の雲と、青白い結晶のかけら（P1 第一・第二楽章）
//   gold ：左上から光が差す金色がかった緑の空と、岩のかけら（P1 第三楽章）
//   ruins：青い雲の空と、浮かぶ石の塔・がれき（P3）
// w×h はフィールドのドット。res 倍の細かさで描く。色は段で塗り分けて 8bit らしく
// =====================================================================
import { clearOutside } from './mech_p2m.js';
const hash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const smooth = v => v * v * (3 - 2 * v);
// なめらかな雲（値ノイズを3段重ねる）。0〜1
function noise(x, y, s){
  let v = 0, a = .5, f = 1 / 48;
  for (let o = 0; o < 3; o++){
    const X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), fx = smooth(X - xi), fy = smooth(Y - yi);
    const h00 = hash(xi, yi, s + o), h10 = hash(xi + 1, yi, s + o), h01 = hash(xi, yi + 1, s + o), h11 = hash(xi + 1, yi + 1, s + o);
    v += a * ((h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy);
    a /= 2; f *= 2.1;
  }
  return v / .875;
}
const PAL = {
  storm:['#121418', '#1a1d23', '#23272f', '#2d323b', '#3a404a', '#4a515c'],
  gold: ['#1e2010', '#2e3014', '#43451c', '#5c5d26', '#787832', '#96953e', '#b8b45a', '#d8d488', '#f4f0cc'],
  ruins:['#162236', '#1d2c44', '#253852', '#2f4664', '#3b5778', '#4b6a8e', '#5e7fa2'],
  nebula:['#0c0e18', '#141826', '#2a1626', '#4a1a26', '#721e24', '#9a2a26', '#c43a2a', '#e45a38'],
};
const pick = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];

// かけら（縦長のひし形）：結晶（storm）と岩（gold）
function shard(g, res, x, y, len, wid, tilt, cols){
  // cols：[暗い側, 明るい側, ふち]
  for (let i = -len; i <= len; i++){
    const k = 1 - Math.abs(i) / len, hw = Math.max(1, Math.round(wid * k)), cx = Math.round(x + i * tilt);
    for (let j = -hw; j <= hw; j++){
      g.fillStyle = j === -hw || j === hw ? cols[2] : j < 0 ? cols[1] : cols[0];
      g.fillRect((cx + j) * res, (y + i) * res, res, res);
    }
  }
}
// 石の塔（ruins）：れんがの四角い塔。少し傾いた平行四辺形で
function tower(g, res, x, y, w, h, lean, seed){
  for (let j = 0; j < h; j++){
    const dx = Math.round(j * lean);
    for (let i = 0; i < w; i++){
      const brick = (j % 4 === 0) || ((i + (Math.floor(j / 4) % 2) * 3) % 6 === 0);
      const edge = i === 0 || i === w - 1;
      g.fillStyle = edge ? '#2a3038' : brick ? '#4a525c' : hash(i, j, seed) > .85 ? '#6a7480' : '#5c6570';
      g.fillRect((x + i + dx) * res, (y + j) * res, res, res);
    }
  }
  // 窓
  for (let j = 6; j < h - 4; j += 10) for (let i = 3; i < w - 3; i += 6){ g.fillStyle = '#1a2028'; g.fillRect((x + i + Math.round(j * lean)) * res, (y + j) * res, 2 * res, 4 * res); }
}

function paintSky(g, w, h, res, kind, seed = 1){
  const pal = PAL[kind];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    let v = noise(x, y, seed);
    if (kind === 'storm') v = v * .9 + (((x * 7 + y * 13) % 5) - 2) * .012;
    if (kind === 'gold'){
      // 左上の光源に近いほど明るい。光源から放射状の光の帯
      const dx = x + w * .1, dy = y + h * .05, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const near = 1 - r / (Math.hypot(w, h) * .9);
      v = v * .55 + near * .6 - .08 + (Math.sin(a * 22) > .45 ? .22 * Math.max(0, near) : 0);
    }
    if (kind === 'ruins') v = v * .85 + (1 - y / h) * .2;
    // 赤い星雲：上ほど赤い雲、下は暗い紺。雲の中に暗いすじ（クリア画面の空。ユーザーの画像 2026-10-17）
    if (kind === 'nebula'){ const n2 = noise(x * 1.7 + 300, y * 1.7, seed + 5); v = (v * .7 + n2 * .5 - .15) * (1.15 - y / h * .95) + (n2 < .32 ? -.2 : 0); }
    g.fillStyle = pick(pal, v); g.fillRect(x * res, y * res, res, res);
  }
  const R = (i, k) => hash(i, k, seed + 99);
  if (kind === 'storm'){
    // 青白い結晶のかけら（大小）と、細い雨のような光の筋
    for (let i = 0; i < w * h / 2600; i++){
      const big = R(i, 1) > .55, len = big ? 12 + R(i, 2) * 16 : 3 + R(i, 2) * 5;
      shard(g, res, R(i, 3) * w, R(i, 4) * h, Math.round(len), big ? 2 + Math.round(R(i, 8)) : 1, (R(i, 5) - .5) * .25, big ? ['#6a7a8c', '#b8c8d8', '#2a323c'] : ['#6a7888', '#aabccc', '#3a4450']);
    }
    for (let i = 0; i < w * h / 900; i++){ g.fillStyle = '#4a5462'; const x = Math.floor(R(i, 6) * w), y = Math.floor(R(i, 7) * h); g.fillRect(x * res, y * res, res, 3 * res); }
  }
  if (kind === 'gold'){
    // 金の筋の入った岩のかけら
    for (let i = 0; i < w * h / 4500; i++){
      const big = R(i, 1) > .4, len = big ? 16 + R(i, 2) * 18 : 4 + R(i, 2) * 6;
      shard(g, res, R(i, 3) * w, R(i, 4) * h, Math.round(len), big ? 3 + Math.round(R(i, 8)) : 1, (R(i, 5) - .5) * .4, ['#4a4a3a', '#8a8a72', '#22221a']);
      if (big){ g.fillStyle = '#d8b850'; g.fillRect(Math.round(R(i, 3) * w) * res, Math.round(R(i, 4) * h + 2) * res, res, 3 * res); }
    }
  }
  if (kind === 'nebula'){ for (let i = 0; i < w * h / 700; i++){ g.fillStyle = R(i, 9) > .7 ? '#c8a8b8' : '#6a5a72'; g.fillRect(Math.floor(R(i, 6) * w) * res, Math.floor(R(i, 7) * h) * res, res, res); } }
  if (kind === 'ruins'){
    // 浮かぶ石の塔（少なめ）と、小さながれき
    for (let i = 0; i < Math.max(3, w * h / 50000); i++) tower(g, res, Math.round(R(i, 1) * (w - 40)), Math.round(R(i, 2) * (h - 80)), 18 + Math.round(R(i, 3) * 14), 40 + Math.round(R(i, 4) * 40), (R(i, 5) - .5) * .5, i);
    for (let i = 0; i < w * h / 1200; i++){
      const s = 1 + Math.round(R(i, 6) * 2), x = Math.round(R(i, 7) * w), y = Math.round(R(i, 8) * h);
      g.fillStyle = '#2a3038'; g.fillRect(x * res, y * res, (s + 1) * res, s * res); g.fillStyle = '#5c6570'; g.fillRect(x * res, y * res, s * res, Math.max(1, s - 1) * res);
    }
  }
}
// 1枚の絵（dataURL）にする。screenBg の url に使う
function skyUrl(kind, w, h, res, seed){
  const c = document.createElement('canvas'); c.width = w * res; c.height = h * res;
  paintSky(c.getContext('2d'), w, h, res, kind, seed); return c.toDataURL();
}
const SKY_BASE = { storm:'#1a1d23', gold:'#5c5d26', ruins:'#1d2c44', nebula:'#141826' };
// ギミックに空を付ける（mechs.ts で包む）：画面全体の背景（screenBg）にこの空、フィールドの外を消して見せる。art：ボスの絵（kefka_art.ts）
const skyCache = {};
const skyBg = kind => ({ url:skyCache[kind] ??= skyUrl(kind, 600, 600, 2, kind === 'nebula' ? 11 : 7), size:600, color:SKY_BASE[kind] });
const withSky = (m, kind, art = null) => ({ ...m, create(p){
  const inst = m.create(p), f = inst.drawFloor;
  inst.screenBg ??= () => skyBg(kind); if (art) inst.bossArt ??= art;
  inst.drawFloor = t => { clearOutside(); f?.call(inst, t); };
  return inst;
} });

// 床の色と模様（gfx.ts の FLOOR）：P2＝gold、P1・P3・P4＝blue、P5＝rust（ユーザー 2026-10-17）
const withFloor = (m, theme) => ({ ...m, create(p){ const inst = m.create(p); inst.floorTheme ??= theme; return inst; } });

export { paintSky, skyUrl, SKY_BASE, skyBg, withSky, withFloor };
