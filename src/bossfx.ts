// @ts-nocheck
// =====================================================================
// ボスの出方・消え方（ユーザーの説明と動画 2026-10-17）
//   カオス：上から降ってくる／真上にジャンプして消える
//   ケフカ：手品のように白い煙を出しながら出る・消える
//   ゴッドケフカ：上から神々しくゆっくり舞い降りる／羽ばたいて一瞬で真上へ飛び去る
//   エクスデス：縦の白い光の筋を放ちながら出る・消える
//   ネオエクスデス：黒いもやを出しながら出る・消える
// どれも絵（sp：dw・dh があればその大きさ）を画面の X,Z（ボスの中心）に描く。k は 0〜1 の進み
// =====================================================================
import { ctx, alpha, disc, rect, ring } from './gfx.js';

const ease = k => k * k * (3 - 2 * k);
const clamp = k => Math.max(0, Math.min(1, k));
const size = sp => [sp.dw || sp.width, sp.dh || sp.height];
// 絵を描く（dy：上へずらす、sx・sy：横・縦の倍率、a：濃さ、white：白く）
function sprite(sp, X, Z, { dy = 0, sx = 1, sy = 1, a = 1, white = false } = {}){
  if (!sp || a <= 0) return;
  const [w, h] = size(sp), W = Math.max(1, Math.round(w * sx)), H = Math.max(1, Math.round(h * sy));
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.imageSmoothingEnabled = false; if (white) ctx.filter = 'brightness(4) saturate(0)';
  ctx.drawImage(sp, Math.round(X - W / 2), Math.round(Z + h / 2 - H - dy), W, H); // 足元（絵の下の端）をそろえる
  ctx.restore();
}
// 足元の土ぼこりの輪（着地・跳び上がり）
function dust(X, Z, k, col = '#d8c8a8'){ if (k <= 0 || k >= 1) return; alpha(1 - k, () => { for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2, r = 6 + k * 34; disc(Math.round(X + Math.cos(a) * r), Math.round(Z + Math.sin(a) * r * .4), Math.round(4 - k * 2), col); } ring(X, Z, Math.round(8 + k * 30), '#ffffff'); }); }

// ---- カオス：上から降ってくる（k：0〜1。最後に着地） ----
function chaosFall(sp, X, Z, k){
  const [, h] = size(sp), drop = (1 - k * k) * (Z + h + 20);  // 加速して落ちる
  if (k < 1) sprite(sp, X, Z, { dy:drop, sy:1 + (1 - k) * .15, sx:1 - (1 - k) * .08 });
  if (k > .85) dust(X, Z + h / 2 - 2, (k - .85) / .15 * .5);
}
function chaosLand(X, Z, sp, k){ const [, h] = size(sp); dust(X, Z + h / 2 - 2, .5 + k * .5); } // 着地のあとの土ぼこり（k：0〜1）
// ---- カオス：真上にジャンプして消える（k：0〜1。0〜.2 はかがむ、そのあと上へ） ----
function chaosJump(sp, X, Z, k){
  const [, h] = size(sp);
  if (k < .2){ const c = k / .2; sprite(sp, X, Z, { sy:1 - c * .12, sx:1 + c * .06 }); return; }
  const u = (k - .2) / .8; sprite(sp, X, Z, { dy:u * u * (Z + h + 40), sy:1 + u * .3, sx:1 - u * .15 });
  dust(X, Z + h / 2 - 2, u * 1.4);
}

// ---- ケフカ：白い煙（手品）。k：0〜1。appear なら煙の中から出る、そうでなければ煙の中に消える ----
function smoke(X, Z, k, n = 14){
  const cols = ['#ffffff', '#e8e4f0', '#d0cce0'];
  for (let i = 0; i < n; i++){
    const a = i * 2.39, r = 4 + k * (16 + (i % 4) * 4), s = Math.round(6 + (i % 3) * 2 + k * 6);
    alpha(.95 * (1 - k * k), () => disc(Math.round(X + Math.cos(a) * r), Math.round(Z - 6 + Math.sin(a) * r * .6 - k * 10), s, cols[i % 3]));
  }
  if (k < .3) alpha(1 - k / .3, () => disc(X, Z - 6, 18, '#ffffff')); // ぱっと白く
  for (let i = 0; i < 8; i++){ const a = i * .79 + k * 2, r = 10 + k * 30; rect(Math.round(X + Math.cos(a) * r), Math.round(Z - 8 + Math.sin(a) * r * .6), 2, 2, i % 2 ? '#ffe070' : '#ffffff'); } // きらきら
}
function kefkaSmoke(sp, X, Z, k, appear){
  // 出る：0〜.35 は煙だけ → 煙が晴れながら姿が見える。消える：0〜.25 姿が煙に隠れていく → 煙だけ
  if (appear){ if (k > .3) sprite(sp, X, Z, { a:(k - .3) / .2 }); }
  else if (k < .3) sprite(sp, X, Z, { a:1 - k / .3 });
  smoke(X, Z, appear ? Math.min(1, k * 1.2) : k);
}

// ---- ゴッドケフカ：上から神々しくゆっくり舞い降りる（k：0〜1） ----
function godDescend(sp, X, Z, k){
  const e = ease(k), [w, h] = size(sp);
  // 上から差す光は、つなぎの光の柱（mech_link.ts の pillar・上の層）に任せる。ここでも描くと柱の下に短い帯がはみ出す（ユーザー 2026-10-17）
  alpha(.5 * k, () => disc(X, Z, Math.round(w * .6), '#fff2b0'));                    // 後ろの光の輪
  sprite(sp, X, Z, { dy:(1 - e) * (Z + h), a:Math.min(1, k * 3) });
  for (let i = 0; i < 6; i++){ const a = i * 1.05 + k * 3, r = w * .45; rect(Math.round(X + Math.cos(a) * r), Math.round(Z - (1 - e) * (Z + h) + Math.sin(a) * r * .5), 2, 2, '#ffe888'); }
}
// ---- ゴッドケフカ：羽ばたいて一瞬で真上へ飛び去る（k：0〜1。0〜.5 で2回羽ばたき、そのあと一気に上へ） ----
function godFlyAway(sp, X, Z, k){
  const [, h] = size(sp);
  if (k < .5){ const f = Math.sin(k / .5 * Math.PI * 4); sprite(sp, X, Z, { sx:1 + f * .12, sy:1 - Math.abs(f) * .05, dy:Math.max(0, f) * 3 }); return; }
  const u = (k - .5) / .5; sprite(sp, X, Z, { dy:u * u * (Z + h + 60), sy:1 + u * .6, sx:1 - u * .3, a:1 - u * .3 });
  alpha(1 - u, () => rect(X - 3, 0, 6, Z, '#ffffff')); // 飛んだ跡の光
  for (let i = 0; i < 10; i++){ const a = i * .63, r = 8 + u * 30; rect(Math.round(X + Math.cos(a) * r), Math.round(Z + Math.sin(a) * r * .5), 3, 2, '#ffffff'); } // 散る羽根
}

// ---- エクスデス：縦の白い光の筋（k：0〜1。appear なら光の中から出る、そうでなければ光の中に消える） ----
function whiteLines(X, Z, k, w, h){
  const f = Math.sin(clamp(k) * Math.PI);
  for (let i = 0; i < 9; i++){
    const x = Math.round(X + (i - 4) * (w / 9) + Math.sin(i * 7.1 + k * 20) * 2), lw = 1 + (i % 3 === 1 ? 2 : 0), top = Math.round(Z - h * (1.4 + (i % 4) * .4));
    alpha(f * (.55 + (i % 2) * .4), () => rect(x, top, lw, Math.round(Z + h / 2 - top), i % 3 ? '#ffffff' : '#c8e0ff'));
  }
  alpha(f * .45, () => rect(Math.round(X - w / 2), Math.round(Z - h * 1.2), Math.round(w), Math.round(h * 1.7), '#e8f0ff'));
}
function exdeathLight(sp, X, Z, k, appear){
  const [w, h] = size(sp);
  if (appear){ if (k > .4) sprite(sp, X, Z, { a:(k - .4) / .3 }); if (k > .4 && k < .8) sprite(sp, X, Z, { white:true, a:1 - (k - .4) / .4 }); }
  else { if (k < .5) sprite(sp, X, Z, { sx:1 - k * .6, a:1 }); if (k < .5) sprite(sp, X, Z, { sx:1 - k * .6, white:true, a:k / .5 }); }
  whiteLines(X, Z, k, w, h);
}

// ---- ネオエクスデス：黒いもや（k：0〜1） ----
function blackMist(X, Z, k, w, h, gather){
  const cols = ['#05060e', '#0e1430', '#1a2450', '#2a3a70'];
  const n = 22;
  for (let i = 0; i < n; i++){
    const a = i * 2.39 + k * (gather ? -3 : 3), base = gather ? (1 - k) : k, r = w * (.25 + base * .7) * (.7 + (i % 3) * .2);
    const s = Math.round(5 + (i % 4) * 2 + (gather ? (1 - k) : k) * 5);
    alpha(.85 * Math.sin(clamp(k) * Math.PI) + (gather ? 0 : .1 * (1 - k)), () => disc(Math.round(X + Math.cos(a) * r), Math.round(Z + Math.sin(a) * r * .55 - h * .1), s, cols[i % 4]));
  }
  for (let i = 0; i < 5; i++){ const x = Math.round(X + (i - 2) * w * .22); alpha(.5 * Math.sin(clamp(k) * Math.PI), () => rect(x, Math.round(Z - h), 1, Math.round(h * 1.2), '#8ab0ff')); } // 青白い光の筋が少し
}
function neoMist(sp, X, Z, k, appear){
  const [w, h] = size(sp);
  if (appear){ if (k > .45) sprite(sp, X, Z, { a:(k - .45) / .35 }); }
  else if (k < .55) sprite(sp, X, Z, { a:1 - k / .55 });
  blackMist(X, Z, k, w, h, appear);
}

export { chaosFall, chaosLand, chaosJump, kefkaSmoke, godDescend, godFlyAway, exdeathLight, neoMist };
