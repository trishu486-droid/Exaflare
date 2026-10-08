// @ts-nocheck
// P3 のエフェクトとクリスタル（実機の演出の色・形を 8bit の短いアニメにしたもの。提案画像で OK をもらった形）
// add(種類, 引数) で再生を始め、draw() で毎フレーム描く。座標はフィールドの座標（x＝東、z＝南）、大きさは y 単位
import { S } from './state.js';
import { PPY, ctx, disc, line, px, rect, ring } from './gfx.js';

const ARENA = 20;
// 透明度を掛け合わせて描く（入れ子にしても崩れない）
const ga = (a, fn) => { const p = ctx.globalAlpha; ctx.globalAlpha = p * Math.max(0, Math.min(1, a)); fn(); ctx.globalAlpha = p; };
const u = v => Math.round(v * PPY); // y → ドット
// ジグザグの稲妻
const bolt = (x0, y0, x1, y1, col, seed = 1, n = 6, amp = 4) => {
  let a = x0, b = y0;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i <= n; i++){
    const f = i / n, j = i === n ? 0 : Math.sin(seed * 12.9 + i * 78.2) * amp;
    const qx = x0 + dx * f + nx * j, qy = y0 + dy * f + ny * j;
    line(Math.round(a), Math.round(b), Math.round(qx), Math.round(qy), col); a = qx; b = qy;
  }
};
const thick = (X, Y, r0, r1, colA, colB) => { for (let r = r0; r <= r1; r++) ring(X, Y, r, (r - r0) % 3 ? colA : colB); };
// 毎回同じ並びの乱数
const hash = i => { const h = Math.sin(i * 12.9898) * 43758.5453; return h - Math.floor(h); };

// ---- クリスタル（斜めの数字マーカーの上）。炎＝赤く光る三角、水＝青く光る玉、風＝床の緑のひし形。大きさは最初の版の 1/3 ----
function drawCrystal(kind, q){
  const X = px(q.x), Y = px(q.z), k = PPY / 6, bob = Math.round(Math.sin(performance.now() / 300) * k); // ゆっくり上下
  if (kind === 'fire'){
    const Yb = Y + bob;
    disc(X, Y + Math.round(5 * k), Math.round(5 * k), '#3a0a08');
    ga(.5, () => disc(X, Yb + Math.round(4 * k), Math.round(7 * k), '#ff5a1a'));
    const H = Math.round(7 * k);
    for (let i = 0; i <= H; i++) rect(X - i, Yb - Math.round(6 * k) + i, i * 2 + 1, 1, i < 2 * k ? '#ffe070' : '#e83a1a');
    rect(X - Math.round(3 * k), Yb + Math.round(2 * k), Math.round(7 * k), 1, '#ffb84a');
    // 火の粉
    for (let i = 0; i < 4; i++){ const ph = (performance.now() / 500 + i * .25) % 1; rect(X + Math.round((hash(i) - .5) * 10 * k), Yb - Math.round((6 + ph * 6) * k), 1, Math.max(1, Math.round(k)), ph < .5 ? '#ffd84a' : '#ff8a2a'); }
  } else if (kind === 'water'){
    const Yb = Y + bob;
    ga(.45, () => disc(X, Yb, Math.round(9 * k), '#3ab8ff'));
    disc(X, Yb, Math.round(6 * k), '#1a6ad8'); disc(X, Yb, Math.round(4 * k), '#5ad0ff'); ring(X, Yb, Math.round(3 * k), '#c8f0ff');
    const a = performance.now() / 400; // 渦
    rect(X + Math.round(Math.cos(a) * 2 * k) - 1, Yb + Math.round(Math.sin(a) * 2 * k) - 1, 2, 2, '#ffffff');
  } else {
    const H = Math.round(9 * k), h = Math.round(6 * k);
    ga(.45, () => { for (let i = 0; i <= H; i++){ rect(X - i, Y - H + i, i * 2 + 1, 1, '#5aff8a'); rect(X - i, Y + H - i, i * 2 + 1, 1, '#5aff8a'); } });
    for (let i = 0; i <= h; i++){ rect(X - i, Y - h + i, i * 2 + 1, 1, '#1a8a4a'); rect(X - i, Y + h - i, i * 2 + 1, 1, '#1a8a4a'); }
    disc(X, Y + bob, Math.round(2 * k), '#c8ffd8'); rect(X - 1, Y - 1 + bob, 1, 1, '#ffffff');
  }
}

function makeP3Fx(){
  const list = [];
  const DUR = { bowels:.5, dome:.8, fireball:.6, fireRing:.8, waterRing:.8, geyser:.8, fan:.5, bolt:.6, cleave:.5, umbra:.8, wind:.8, tornado:.7 };
  const add = (kind, o = {}) => list.push({ kind, o, t:S.t, dur:DUR[kind] || .8 });
  const DRAW = {
    // バウル・オブ・アゴニー：画面全体が白〜黄色の光で放射状に弾ける
    bowels(k){
      const W = 288, C = W / 2;
      ga(.85 * (1 - k), () => rect(0, 0, W, W, '#fff4c8'));
      ga(1 - k, () => { for (let a = 0; a < 24; a++){ const th = a * Math.PI / 12, r0 = 10 + k * 30; line(C + Math.cos(th) * r0, C + Math.sin(th) * r0, C + Math.cos(th) * 220, C + Math.sin(th) * 220, a % 2 ? '#ffd84a' : '#ffffff'); } disc(C, C, Math.round(16 * (1 - k)) + 2, '#ffffff'); });
    },
    // 範囲サンダガ：エクスデスの紫の玉 → 白〜青の雷の嵐がドーム状に広がる
    dome(k, o){
      const X = px(o.x), Y = px(o.z), R = u(o.r) * Math.min(1, .3 + k * 1.5);
      ga(.4 * (1 - k * .6), () => disc(X, Y, Math.round(R), '#8ac8ff'));
      ga(1 - k * .5, () => { ring(X, Y, Math.round(R), '#ffffff'); ring(X, Y, Math.round(R) - 1, '#5aa8ff'); for (let a = 0; a < 10; a++){ const th = a * Math.PI / 5 + k; bolt(X, Y, X + Math.cos(th) * R, Y + Math.sin(th) * R, a % 2 ? '#ffffff' : '#8ad0ff', a + Math.floor(k * 6), 5, u(.6)); } });
      disc(X, Y, u(.8), '#c05aff');
    },
    // 混沌の炎：オレンジの火球が爆発（円）
    fireball(k, o){ o.pts.forEach((q, j) => { const X = px(q.x), Y = px(q.z), R = u(o.r) * (.6 + k * .5);
      ga(.75 * (1 - k), () => disc(X, Y, Math.round(R), '#ff8a2a')); ga(1 - k, () => { disc(X, Y, Math.round(R * .7), '#ffb84a'); disc(X, Y, Math.round(R * .4), '#ffe070'); disc(X, Y, Math.round(R * .2), '#ffffff'); });
      ga(1 - k, () => { for (let i = 0; i < 12; i++){ const a = i * .52 + j; rect(Math.round(X + Math.cos(a) * R * 1.2), Math.round(Y + Math.sin(a) * R * 1.2), 2, 2, i % 2 ? '#ff5a1a' : '#ffd84a'); } }); }); },
    // ほのお（炎クリスタル）：大きな炎の輪（ドーナツ）。真ん中は安全
    fireRing(k, o){ o.pts.forEach(q => { const X = px(q.x), Y = px(q.z), r0 = u(o.r0), r1 = u(o.r1);
      ga(.75 * (1 - k), () => thick(X, Y, r0, r1, '#ff8a2a', '#ffd84a'));
      ga(1 - k, () => { for (let i = 0; i < 20; i++){ const a = i * .314 + k * 2; rect(Math.round(X + Math.cos(a) * r1), Math.round(Y + Math.sin(a) * r1) - 2 - Math.round(k * 4), 1, 3, '#ffe070'); } ring(X, Y, r0 - 1, '#ffffff'); }); }); },
    // 混沌の水：白と水色の波が渦を巻く輪（ドーナツ）
    waterRing(k, o){ o.pts.forEach(q => { const X = px(q.x), Y = px(q.z), r0 = u(o.r0), r1 = u(o.r1);
      ga(.75 * (1 - k), () => thick(X, Y, r0, r1, '#5ad0ff', '#e0f8ff'));
      ga(1 - k, () => { for (let i = 0; i < 16; i++){ const a = i * .39 + k * 3; line(X + Math.cos(a) * (r0 + 1), Y + Math.sin(a) * (r0 + 1), X + Math.cos(a + .35) * r1, Y + Math.sin(a + .35) * r1, '#ffffff'); } ring(X, Y, r0 - 1, '#3a8aff'); }); }); },
    // つなみ（水クリスタル）：青い水柱の円
    geyser(k, o){ o.pts.forEach(q => { const X = px(q.x), Y = px(q.z), R = u(o.r), hgt = Math.round(u(4) * Math.sin(Math.min(1, k * 1.6) * Math.PI));
      ga(.7 * (1 - k), () => disc(X, Y, R, '#3ab8ff')); ga(1 - k, () => { disc(X, Y, Math.round(R * .6), '#c8f0ff'); rect(X - u(.4), Y - hgt, u(.8) + 1, hgt, '#e0f8ff'); rect(X - 1, Y - hgt - u(.6), 3, u(.6), '#ffffff');
        for (let i = 0; i < 8; i++){ const a = i * .78; rect(Math.round(X + Math.cos(a) * R * .8), Math.round(Y + Math.sin(a) * R * .8) - Math.round(k * 6), 2, 2, '#ffffff'); } }); }); },
    // インプロージョン：カオスから水色の半透明の光の扇（90°）
    fan(k, o){ const X = px(o.x), Y = px(o.z), Rmax = u(40);
      ga(.6 * (1 - k * .8), () => { o.centers.forEach(c => { const a0 = (c - 90) * Math.PI / 180; for (let rr = u(1); rr < Rmax; rr += 1) for (let j = -24; j <= 24; j++){ const a = a0 + j * Math.PI / 96, qx = Math.round(X + Math.cos(a) * rr), qy = Math.round(Y + Math.sin(a) * rr);
        const dx = (qx - px(0)) / PPY, dz = (qy - px(0)) / PPY; if (dx * dx + dz * dz > ARENA * ARENA) continue; rect(qx, qy, 2, 2, (rr + Math.round(k * 20)) % 8 < 2 ? '#ffffff' : '#8ae0ff'); } }); }); },
    // サンダガ（強攻撃）：白〜黄色の雷が落ちて爆発、青い放電
    bolt(k, o){ const X = px(o.x), Y = px(o.z), R = u(2.5);
      ga(1 - k, () => { if (k < .4){ bolt(X - u(1), Y - u(12), X, Y, '#ffffff', 2, 7, u(.8)); bolt(X - u(1), Y - u(12), X, Y, '#ffe070', 5, 7, u(1.2)); }
        ga(.6, () => disc(X, Y, Math.round(R * (1 + k)), '#fff070')); disc(X, Y, Math.round(R * .6), '#ffffff');
        for (let a = 0; a < 8; a++){ const th = a * Math.PI / 4 + k; bolt(X, Y, X + Math.cos(th) * R * 1.8, Y + Math.sin(th) * R * 1.8, '#5ab0ff', a + Math.floor(k * 5), 3, u(.6)); } }); },
    // サンダガ（タンク強攻撃）：対象を中心に、黄色い雷の円範囲
    cleave(k, o){ const X = px(o.q.x), Y = px(o.q.z), R = u(o.r);
      ga(.4 * (1 - k), () => disc(X, Y, R, '#ffe070')); ga(1 - k, () => ring(X, Y, Math.round(R * (.9 + k * .2)), '#fff4b0'));
      ga(.8 * (1 - k), () => { for (let a = 0; a < 8; a++){ const th = a * Math.PI / 4 + k * 2; bolt(X, Y, X + Math.cos(th) * R, Y + Math.sin(th) * R, '#fff4b0', a + Math.floor(k * 6), 4, u(.8)); } }); },
    // アンブラスマッシュ：着地点で赤〜紫の暗い爆発
    umbra(k, o){ const X = px(o.x), Y = px(o.z), R = u(o.r) * (.5 + k * .6);
      ga(.55 * (1 - k), () => disc(X, Y, Math.round(R), '#6a1a4a'));
      ga(1 - k, () => { ring(X, Y, Math.round(R), '#e8283a'); ring(X, Y, Math.round(R * .72), '#c05aff'); disc(X, Y, Math.round(R * .36), '#2a0818'); disc(X, Y, Math.round(R * .18), '#ff3a6a');
        for (let i = 0; i < 10; i++){ const a = i * .63; rect(Math.round(X + Math.cos(a) * R * .64), Math.round(Y + Math.sin(a) * R * .64), 2, 2, '#ff8ad8'); } }); },
    // 真空波：エクスデスから白〜水色の風の球が一気に広がる
    wind(k, o){ const X = px(o.x), Y = px(o.z), R = Math.round(u(30) * Math.min(1, k * 1.4));
      ga(.45 * (1 - k), () => disc(X, Y, R, '#e0f8ff'));
      ga(1 - k, () => { for (let r = R - 6; r <= R; r += 2) if (r > 0) ring(X, Y, r, '#ffffff'); for (let i = 0; i < 14; i++){ const a = i * .45 + k * 2; line(X + Math.cos(a) * R * .45, Y + Math.sin(a) * R * .45, X + Math.cos(a + .25) * R * .92, Y + Math.sin(a + .25) * R * .92, '#8ae0ff'); } }); },
    // たつまき（2人頭割り）：赤紫の玉が弾ける
    tornado(k, o){ o.pts.forEach(q => { const X = px(q.x), Y = px(q.z), R = u(1.6) * (1 + k * .8);
      ga(1 - k, () => { disc(X, Y, Math.round(R), '#8a1a6a'); disc(X, Y, Math.round(R * .5), '#ff5ad0'); ring(X, Y, Math.round(R) + 1, '#ffffff'); }); }); },
  };
  return {
    add,
    draw(){
      for (let i = list.length - 1; i >= 0; i--){
        const e = list[i], k = (S.t - e.t) / e.dur;
        if (k > 1 || k < 0){ list.splice(i, 1); continue; }
        DRAW[e.kind](k, e.o);
      }
    },
  };
}

// バウル・オブ・アゴニーのあと：床が消えて星空だけになる（drawFloor から呼ぶ。フィールドの中を宇宙で塗る）
function drawVoid(a){
  const R = u(ARENA) + 4, C = px(0);
  ga(a, () => { disc(C, C, R, '#1c1a3c'); for (let i = 0; i < 90; i++){ const x = Math.floor(hash(i) * 288), y = Math.floor(hash(i + 500) * 288); if ((x - C) ** 2 + (y - C) ** 2 <= R * R) rect(x, y, 1, 1, i % 5 ? '#8a84c8' : '#ffffff'); } });
}

export { makeP3Fx, drawCrystal, drawVoid };
