// @ts-nocheck
// P4 のエフェクト（実機の演出の色・順番・動きを 8bit の短いアニメにしたもの）
// add(種類, 引数) で再生を始め、draw(t) で毎フレーム描く。座標はフィールドの座標（x＝東、z＝南）
import { S } from './state.js';
import { opt } from './store.js';
import { PPY, ctx, disc, donut, fillArena, line, px, rect, ring } from './gfx.js';
import { fxFlash } from './fx.js';

const ARENA = 20;
// 透明度を掛け合わせて描く（入れ子にしても崩れない）
const ga = (a, fn) => { const p = ctx.globalAlpha; ctx.globalAlpha = p * Math.max(0, Math.min(1, a)); fn(); ctx.globalAlpha = p; };
const R = () => Math.round(ARENA * PPY);
const arenaFill = col => { const r = ARENA; fillArena(z => { const h = r * r - z * z; return h < 0 ? null : [-Math.sqrt(h), Math.sqrt(h)]; }, col); };
// ジグザグの稲妻
const bolt = (x0, y0, x1, y1, col, seed = 1, n = 6, amp = 4) => {
  let px0 = x0, py0 = y0;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i <= n; i++){
    const f = i / n, j = i === n ? 0 : Math.sin(seed * 12.9 + i * 78.2) * amp;
    const qx = x0 + dx * f + nx * j, qy = y0 + dy * f + ny * j;
    line(Math.round(px0), Math.round(py0), Math.round(qx), Math.round(qy), col); px0 = qx; py0 = qy;
  }
};
const cross4 = (X, Y, s, col) => { line(X - s, Y, X + s, Y, col); line(X, Y - s, X, Y + s, col); };
// 黒い火の玉（オレンジの芯）／光る水の玉
const fireball = (X, Y, r) => { disc(X, Y, r, '#1a0a08'); disc(X, Y, Math.max(1, Math.round(r * .55)), '#ff8a2a'); rect(X - 1, Y - 1, 1, 1, '#ffe070'); };
const waterball = (X, Y, r) => { disc(X, Y, r, '#1a6ad8'); disc(X, Y, Math.max(1, Math.round(r * .6)), '#c8f0ff'); rect(X - 1, Y - 1, 1, 1, '#ffffff'); line(X - r - 3, Y, X + r + 3, Y, '#e0f8ff'); };
// 円周上の点（ランダムだけど毎回同じ並び）
const scatter = (n, seed) => Array.from({ length:n }, (_, i) => { const a = (i * 137.5 + seed * 31) * Math.PI / 180, r = 5 + ((i * 53 + seed * 17) % 100) / 100 * 13; return { x:Math.cos(a) * r, z:Math.sin(a) * r }; });

function makeP4Fx(){
  const list = [];
  const add = (kind, o = {}) => list.push({ kind, o, t:S.t, dur:DUR[kind] || .8 });
  const DUR = { gc:1.1, fire:1.1, water:1.1, thunder:.7, ice:.7, flood:.8, surge:.9, spread:.6, stack:.7, gaze:.6, ultima:1.1, burst:.8, geyser:1, wring:.9, release:1, launch:1.2, beams:.6 };

  const DRAW = {
    // グランドクロス：紫と白の光の渦 → ケフカへ白い光の柱 → 青い稲妻の輪
    gc(k){
      const X = px(0), Y = px(0), r = R();
      if (k < .4){ const s = 1 - k / .4; for (let i = 1; i <= 6; i++){ const rr = Math.round(r * (i / 6) * (.3 + s * .9)); ga(.7, () => ring(X, Y, rr, i % 2 ? '#c87aff' : '#ffffff')); } }
      else if (k < .65){ ga(.45, () => arenaFill('#e8d8ff')); rect(X - 4, 0, 9, Y, '#ffffff'); disc(X, Y, 8, '#ffffff'); }
      else { const s = (k - .65) / .35, rr = Math.round(8 + s * r * .9); ga(1 - s, () => { ring(X, Y, rr, '#3a8aff'); for (let a = 0; a < 12; a++){ const t0 = a * Math.PI / 6; bolt(X + Math.cos(t0) * rr * .7, Y + Math.sin(t0) * rr * .7, X + Math.cos(t0 + .3) * rr, Y + Math.sin(t0 + .3) * rr, '#8ad0ff', a, 3, 2); } }); }
    },
    // ほのお：白く煙る → オレンジの芯の黒い火の玉が散って消える
    fire(k){ ga(.55 * (1 - k), () => arenaFill('#d8d4d8')); scatter(7, 3).forEach((q, i) => { const r = Math.round((5 - k * 3) * PPY / 3); if (r > 0) fireball(px(q.x * (.8 + k * .3)), px(q.z * (.8 + k * .3)), r + (i % 2)); }); },
    // つなみ：白く煙る → 光る青い水の玉が散って消える
    water(k){ ga(.55 * (1 - k), () => arenaFill('#d8d4e0')); scatter(7, 5).forEach((q, i) => { const r = Math.round((5 - k * 3) * PPY / 3); if (r > 0) waterball(px(q.x * (.8 + k * .3)), px(q.z * (.8 + k * .3)), r + (i % 2)); }); },
    // サンダガ着弾：帯の上に白とピンクの雷
    thunder(k, o){ o.segs.forEach(([a, b], i) => ga(1 - k, () => { bolt(px(a.x), px(a.z), px(b.x), px(b.z), '#ffffff', i + 1, 9, 5); bolt(px(a.x), px(a.z), px(b.x), px(b.z), '#ff9ae8', i + 7, 9, 7); })); },
    // ブリザガ着弾：扇の中に青白い突風と白い結晶
    ice(k, o){ o.pts.forEach((q, i) => { const s = 1 + Math.round(k * 3); ga(1 - k, () => { cross4(px(q.x), px(q.z), 2 + s, '#ffffff'); rect(px(q.x) - 1, px(q.z) - 1, 3, 3, '#c8f0ff'); }); }); },
    // 無の氾濫の着弾：白とピンクの光線が床を斜めに走る
    // 無の氾濫の着弾：左右それぞれの色（紫／青）の光が、ネオエクスデスから床を走る（真ん中は生死の境界）
    flood(k, o){ const { fwd, right, colL, colR } = o; ga(1 - k, () => { for (let i = -5; i <= 5; i++){ if (!i) continue; const off = i * 3.6, s = Math.sign(i), col = (s < 0 ? colL : colR) === 'white' ? (i % 2 ? '#e8a0ff' : '#ffffff') : (i % 2 ? '#8ac0ff' : '#ffffff'); const u = Math.sqrt(Math.max(0, ARENA * ARENA - off * off)), len = u * 2 * Math.min(1, k * 3), a = { x:right.x * off - fwd.x * u, z:right.z * off - fwd.z * u }, b = { x:a.x + fwd.x * len, z:a.z + fwd.z * len }; for (let w = -1; w <= 1; w++) line(px(a.x) + w, px(a.z), px(b.x) + w, px(b.z), col); } }); },
    // デスサージ：黄緑の光で染まる
    surge(k){ ga(.4 * (1 - k), () => arenaFill('#b8f05a')); },
    // 散開（フォークライトニング）：左上から紫の雷が落ちて、足元に輪
    spread(k, o){ const X = px(o.x), Y = px(o.z); ga(1 - k, () => { bolt(X - 30, Y - 50, X, Y, '#d8a0ff', 3, 7, 4); bolt(X - 30, Y - 50, X, Y, '#ffffff', 5, 7, 2); ring(X, Y, Math.round((2 + k * 4) * PPY), '#b05aff'); }); },
    // 頭割り（水属性圧縮）：足元へ水が渦を巻いて集まる
    stack(k, o){ const X = px(o.x), Y = px(o.z); for (let i = 0; i < 10; i++){ const a = i * .63 + k * 6, r = (1 - k) * 5 * PPY; ga(1 - k * .7, () => rect(Math.round(X + Math.cos(a) * r) - 1, Math.round(Y + Math.sin(a) * r * .8) - 1, 3, 3, i % 2 ? '#5ad0ff' : '#c8f0ff')); } ga(.6 * (1 - k), () => ring(X, Y, Math.round(4 * PPY), '#5ad0ff')); },
    // 呪詛の叫声：床全体が白く光る
    gaze(k){ ga(.75 * (1 - k), () => arenaFill('#ffffff')); },
    // どきどきアルテマ：青い光のドームに包まれる
    ultima(k){ const s = Math.min(1, k * 2.5); ga(.55 * (1 - k * .8), () => { arenaFill('#3a8aff'); disc(px(0), px(0), Math.round(R() * s * .6), '#8ac8ff'); }); ga(1 - k, () => ring(px(0), px(0), Math.round(R() * s), '#c8e8ff')); },
    // 混沌の炎（円）：置いた場所でオレンジの大爆発
    burst(k, o){ o.pts.forEach(b => { const X = px(b.x), Y = px(b.z), r = Math.round(o.r * PPY * (.6 + k * .5)); ga(.8 * (1 - k), () => { disc(X, Y, r, '#ff8a2a'); disc(X, Y, Math.round(r * .55), '#fff0a0'); }); }); },
    // 混沌の水（タケノコ＝円）：置いた場所から水柱が立って、しぶきが散る（ほのお・つなみの演出からの予測）
    geyser(k, o){ o.pts.forEach((b, i) => { const X = px(b.x), Y = px(b.z), r = Math.round(o.r * PPY); ga(.5 * (1 - k), () => disc(X, Y, r, '#2a8ad8')); const h = Math.round(Math.sin(Math.min(1, k * 1.6) * Math.PI) * r * 1.4); ga(1 - k * .6, () => { rect(X - 3, Y - h, 7, h, '#5ad0ff'); rect(X - 1, Y - h, 3, h, '#e0f8ff'); }); for (let j = 0; j < 6; j++){ const a = j * 1.05 + i, d = r * (.3 + k * .8); ga(1 - k, () => rect(Math.round(X + Math.cos(a) * d), Math.round(Y + Math.sin(a) * d * .7 - k * 6), 2, 2, '#c8f0ff')); } }); },
    // 混沌の炎・水（ドーナツ）：外側に炎／水の輪
    wring(k, o){ o.pts.forEach(b => { const X = px(b.x), Y = px(b.z), r = Math.round(o.r * PPY); ga(.5 * (1 - k), () => donut(X, Y, r, r + Math.round(4 * PPY), o.col)); ga(1 - k, () => { ring(X, Y, r + Math.round(k * 3 * PPY), '#ffffff'); }); }); },
    // マジックアウトの着弾：大きな白い閃光
    release(k){ ga(.7 * (1 - k), () => { disc(px(0), px(0), Math.round(R() * (.2 + k)), '#ffffff'); }); },
    // 加速度爆弾のミス：爆発して上へ打ち上がる
    launch(k, o){ const X = px(o.x), Y = px(o.z); if (k < .3){ const s = k / .3; disc(X, Y, Math.round(4 + s * 8), '#ffb84a'); disc(X, Y, Math.round(2 + s * 4), '#ffffff'); } const h = Math.round(Math.min(1, k * 1.5) * 60); ga(1 - k * .5, () => { rect(X - 1, Y - h, 3, h, '#ffe070'); disc(X, Y - h, 4, '#ffffff'); }); },
    // もりもりサンダガ：ケフカのまわりの玉から赤い光線が左右へ
    beams(k, o){ const X = px(0), Y = px(0), d = o.dir, L = R() * 1.3; ga(1 - k, () => { [1, -1].forEach(s => { const ex = X + d.x * L * s, ey = Y + d.z * L * s; line(X, Y, Math.round(ex), Math.round(ey), '#ff3a5a'); line(X, Y + 1, Math.round(ex), Math.round(ey) + 1, '#ffffff'); }); disc(X, Y, 6, '#ffffff'); }); },
  };

  function draw(){
    for (let i = list.length - 1; i >= 0; i--){
      const f = list[i], k = (S.t - f.t) / f.dur;
      if (k < 0 || k > 1){ list.splice(i, 1); continue; }
      DRAW[f.kind](k, f.o);
    }
  }
  const reset = () => { list.length = 0; };
  return { add, draw, reset, ga, flash:(col, a, dur) => { if (opt.fx) fxFlash(col, a, dur); } };
}

// ---- 毎フレーム描く演出（時間で決まるもの） ----
// サンダガの帯の両ふちに黄色いレール
function drawRails(o, cs, hw = 5){
  const n = { x:o / Math.SQRT2, z:1 / Math.SQRT2 }, d = { x:1 / Math.SQRT2, z:-o / Math.SQRT2 };
  cs.forEach(c => [c - hw, c + hw].forEach(e => {
    if (Math.abs(e) >= ARENA) return; const u = Math.sqrt(ARENA * ARENA - e * e);
    const a = { x:n.x * e - d.x * u, z:n.z * e - d.z * u }, b = { x:n.x * e + d.x * u, z:n.z * e + d.z * u };
    line(px(a.x), px(a.z), px(b.x), px(b.z), '#ffb84a'); line(px(a.x), px(a.z) + 1, px(b.x), px(b.z) + 1, '#a86a10');
  }));
}
// カオスの詠唱中：ほのおなら赤、つなみなら青に光る
function drawChaosGlow(q, kind, t){ const X = px(q.x), Y = px(q.z), p = .5 + Math.sin(t * 8) * .3; ga(p, () => { ring(X, Y, 26, kind === 'fire' ? '#ff5a2a' : '#3aa8ff'); ring(X, Y, 28, kind === 'fire' ? '#ffb84a' : '#c8f0ff'); }); }
// 無の氾濫：ネオエクスデスの左右の目印（紫＝ピンクの多面体の玉、青＝青い輪の中の白い結晶）と光の柱
function drawFloodMarks(neo, right, colorOf, t){
  const toC = { x:-neo.x / 20, z:-neo.z / 20 };
  [-1, 1].forEach(s => {
    const q = { x:neo.x + toC.x * 5.5 + right.x * s * 10, z:neo.z + toC.z * 5.5 + right.z * s * 10 }, X = px(q.x), Y = px(q.z);
    // 泡（球）：紫／青のふちと暗い中身。下にピンクの光が伸びる
    const purple = colorOf(s) === 'white';
    for (let i = 0; i < 6; i++) ga(.6 - i * .08, () => rect(X - 1, Y + 8 + i * 3, 3, 3, '#ff7ad8'));
    disc(X, Y, 11, purple ? '#2a0a4a' : '#06143a'); ring(X, Y, 11, purple ? '#b05aff' : '#3a8aff'); ring(X, Y, 12, purple ? '#7a2ad8' : '#1a5ad8'); ring(X, Y, 10, purple ? '#5a1a9a' : '#1a3a8a');
    if (purple){
      // 白い六角形の輪が固まっている（輪の中はピンク）
      const hex = (cx, cy, r) => { for (let k = 0; k < 6; k++){ const a0 = k * Math.PI / 3 + Math.PI / 6, a1 = a0 + Math.PI / 3; line(Math.round(cx + Math.cos(a0) * r), Math.round(cy + Math.sin(a0) * r), Math.round(cx + Math.cos(a1) * r), Math.round(cy + Math.sin(a1) * r), '#ffffff'); } disc(cx, cy, Math.max(1, r - 2), '#d86ad8'); };
      [[-3, -4], [3, -4], [-4, 2], [3, 3], [0, -1]].forEach(([dx, dy]) => hex(X + dx, Y + dy, 3));
    } else {
      // 白い氷の逆三角形（上が平らで下がとがる）
      for (let r = 0; r < 9; r++){ const w = Math.round(7 * (1 - r / 9)); rect(X - w, Y - 5 + r, w * 2 + 1, 1, r < 2 ? '#ffffff' : r % 3 ? '#d8f0ff' : '#a8d8ff'); }
      line(X - 7, Y - 5, X, Y + 3, '#8ac0e8'); line(X, Y - 5, X, Y + 3, '#ffffff');
    }
    // 光の柱（その色の側に数本）
    for (let i = 0; i < 3; i++){ const f = ((t * .8 + i / 3) % 1), w = { x:right.x * s * (5 + i * 4) + toC.x * (8 + i * 5) * -1, z:right.z * s * (5 + i * 4) + toC.z * (8 + i * 5) * -1 }; ga(1 - f, () => line(px(w.x), px(w.z) - 10 + Math.round(f * 8), px(w.x), px(w.z) + Math.round(f * 8), colorOf(s) === 'white' ? '#f0c0ff' : '#c0e0ff')); }
  });
}
// マジックアウトの詠唱中：ケフカのまわりに青と紫の大きな輪が何重にも
function drawReleaseRings(t){ const X = px(0), Y = px(0); for (let i = 0; i < 3; i++){ const rx = 18 + i * 6 + Math.round(Math.sin(t * 3 + i) * 2); ga(.75, () => { for (let a = 0; a < 72; a++){ const th = a * Math.PI / 36; rect(X + Math.round(Math.cos(th) * rx), Y + Math.round(Math.sin(th) * rx * .45), 2, 1, i % 2 ? '#b05aff' : '#5ab8ff'); } }); } }

export { makeP4Fx, drawRails, drawChaosGlow, drawFloodMarks, drawReleaseRings, scatter };
