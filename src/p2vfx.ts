// @ts-nocheck
// ===== P2 のエフェクト（ユーザーの実機の動画・画像に合わせたもの。2026-10-15。docs/dmu/effects-p1p2.md） =====
// add(種類, データ) で再生を始め、draw(t) で毎フレーム描く。座標はフィールドの座標（x＝東、z＝南）
//   tower：塔の着弾。オレンジ〜白の大爆発と放射状の光の筋（そのあと頭上の攻撃が発動する）
//   tb：破壊の翼（強攻撃）。タンクのまわりを濃い紫の雲と白い雷で覆う
//   vertex：トラインの頂点の爆発。黄色〜白の光の玉が弾けて、茶色い煙
//   emb：終末の双腕。重なったタンクの円（黄色）が黄色〜白の光で弾ける
//   leg：消滅の脚。当たる半面の床がえぐれて、ひびが走る（hit(q) で当たる所を判定）
import { S } from './state.js';
import { PPY, ctx, alpha, disc, ring, line, rect, px } from './gfx.js';

const ARENA = 20;
const rnd = seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const DUR = { tower:.75, tb:.8, vertex:.65, emb:.55, leg:1.4 };

function makeP2Vfx(){
  const L = [];
  let seed = 7;
  const add = (k, o) => {
    const e = { k, t:S.t, ...o, seed:seed++ };
    if (k === 'leg'){ // ひび：各ケフカ（本体・分身）から、当たる側へジグザグに割れていく線をあらかじめ決めておく
      const R = rnd(e.seed * 31 + 3); e.cracks = [];
      e.srcs.forEach(src => {
        const back = src.fut ? 0 : Math.PI, base = Math.atan2(src.face.z, src.face.x) + back;
        for (let j = 0; j < 5; j++){
          const pts = [{ x:src.x, z:src.z }]; let a = base + (R() - .5) * 2.6, r = 0;
          while (r < 26){ r += 1.6 + R() * 2.4; a += (R() - .5) * .7; pts.push({ x:src.x + Math.cos(a) * r, z:src.z + Math.sin(a) * r }); }
          e.cracks.push(pts);
        }
      });
    }
    L.push(e);
  };
  const draw = t => {
    for (let i = L.length - 1; i >= 0; i--){
      const e = L[i], age = S.t - e.t; if (age > DUR[e.k]){ L.splice(i, 1); continue; } if (age < 0) continue;
      const k = age / DUR[e.k];
      if (e.k === 'tower'){
        alpha(.35 * (1 - k), () => fillDisc(px(0), px(0), Math.round(ARENA * PPY), '#ff8a2a'));
        e.pts.forEach(c => { const X = px(c.x), Z = px(c.z), r = Math.round((4 + 6 * Math.min(1, k * 3)) * PPY);
          alpha(.8 * (1 - k), () => { disc(X, Z, r, '#ffd060'); disc(X, Z, Math.round(r * .6), '#ffffff'); }); });
        const R = rnd(e.seed * 17);
        alpha(.85 * (1 - k), () => { for (let j = 0; j < 22; j++){ const c = e.pts[j % e.pts.length], a = R() * Math.PI * 2, len = (6 + R() * 22) * PPY * (.4 + k);
          line(px(c.x), px(c.z), px(c.x) + Math.cos(a) * len, px(c.z) + Math.sin(a) * len, '#fff4c0'); } });
      } else if (e.k === 'tb'){
        const R = rnd(e.seed * 13), X = px(e.q.x), Z = px(e.q.z), rr = Math.round(e.r * PPY);
        alpha(.85 * (1 - k * k), () => {
          for (let j = 0; j < 46; j++){ const a = R() * Math.PI * 2, d = Math.pow(R(), .6) * rr, s = 4 + Math.floor(R() * 6); disc(X + Math.cos(a) * d, Z + Math.sin(a) * d, s, ['#3a0a5a', '#6a1a9a', '#9a3ad8', '#c070ff'][j % 4]); }
          ring(X, Z, rr, '#d890ff');
          for (let j = 0; j < 6; j++){ let a = R() * Math.PI * 2, x0 = X, z0 = Z; for (let s = 1; s <= 6; s++){ const r = s * rr / 6, x1 = X + Math.cos(a + (R() - .5) * .6) * r, z1 = Z + Math.sin(a + (R() - .5) * .6) * r; line(x0, z0, x1, z1, '#f0d0ff'); x0 = x1; z0 = z1; } }
        });
      } else if (e.k === 'vertex'){
        const R = rnd(e.seed * 7);
        e.pts.forEach(c => { const X = px(c.x), Z = px(c.z), rr = Math.round(e.r * PPY);
          alpha(.7 * (1 - k), () => { for (let j = 0; j < 12; j++){ const a = R() * Math.PI * 2, d = rr * (.6 + R() * .6 + k * .3); disc(X + Math.cos(a) * d, Z + Math.sin(a) * d, 3 + Math.floor(R() * 4), ['#6a4a2a', '#8a5a30', '#4a3020'][j % 3]); } });
          alpha(.9 * (1 - k), () => { disc(X, Z, Math.round(rr * (.8 + k * .3)), '#ffe060'); disc(X, Z, Math.round(rr * .55), '#fff4b0'); disc(X, Z, Math.round(rr * .28), '#ffffff'); });
        });
      } else if (e.k === 'emb'){
        const X = px(e.q.x), Z = px(e.q.z), rr = Math.round(e.r * PPY);
        alpha(1 - k, () => { disc(X, Z, rr + 10, '#ffb030'); disc(X, Z, rr + 3, '#ffe060'); disc(X, Z, Math.max(2, rr - 4), '#ffffff');
          for (let j = 0; j < 16; j++){ const a = j / 16 * Math.PI * 2, r1 = rr + 22 * (.6 + k); line(X + Math.cos(a) * rr, Z + Math.sin(a) * rr, X + Math.cos(a) * r1, Z + Math.sin(a) * r1, '#fff4c0'); } });
      } else if (e.k === 'leg'){
        const fade = age < 1 ? 1 : 1 - (age - 1) / .4, R = Math.round(ARENA * PPY), C0 = px(0);
        alpha(.6 * fade, () => { for (let dy = -R; dy <= R; dy += 3) for (let dx = -R; dx <= R; dx += 3){ if (dx * dx + dy * dy > R * R) continue; if (!e.hit({ x:dx / PPY, z:dy / PPY })) continue;
          const n = Math.sin(dx * .11 + dy * .05) + Math.cos(dy * .13 - dx * .04); ctx.fillStyle = n > .4 ? '#4a2c1a' : '#33200f'; ctx.fillRect(C0 + dx, C0 + dy, 3, 3); } });
        alpha(fade, () => e.cracks.forEach(pts => { for (let j = 1; j < pts.length; j++){ const a = pts[j - 1], b = pts[j];
          if (!e.hit(b) || Math.hypot(b.x, b.z) > ARENA) break;
          line(px(a.x) - 1, px(a.z), px(b.x) - 1, px(b.z), '#ffe8c0'); line(px(a.x), px(a.z), px(b.x), px(b.z), '#ffb070'); line(px(a.x) + 1, px(a.z) + 1, px(b.x) + 1, px(b.z) + 1, '#140804'); } }));
      }
    }
  };
  return { add, draw };
}
const fillDisc = (X, Z, R, col) => { ctx.fillStyle = col; for (let dy = -R; dy <= R; dy++){ const hw = Math.floor(Math.sqrt(R * R - dy * dy)); ctx.fillRect(X - hw, Z + dy, hw * 2 + 1, 1); } };

// 塔の上の青い球（大きく明るく、中に白い雷の筋）。ph：ゆらぎ
function towerOrb(X, Z, ph){
  disc(X, Z, 11, '#1a3a9a'); disc(X, Z, 9, '#3a8ae8'); disc(X, Z, 5, '#c8f0ff');
  for (let j = 0; j < 5; j++){ let a = j * 1.3 + ph, x0 = X, z0 = Z; for (let s = 1; s <= 3; s++){ const r = s * 3, x1 = X + Math.cos(a + s * .6) * r, z1 = Z + Math.sin(a + s * .6) * r; line(x0, z0, x1, z1, '#ffffff'); x0 = x1; z0 = z1; } }
}
// 着弾の寸前：フィールド全体がうすく白く光る
function fieldWhite(k){ alpha(.35 * k, () => fillDisc(px(0), px(0), Math.round(ARENA * PPY), '#ffffff')); }
// 終末の双腕の予兆：重なったタンクの足元に黄色い円（半径 r）
function embTell(q, r){ const X = px(q.x), Z = px(q.z), R = Math.round(r * PPY); alpha(.3, () => disc(X, Z, R, '#ffe040')); ring(X, Z, R, '#ffe040'); ring(X, Z, R - 1, '#ffe040'); ring(X, Z, R - 2, '#fff4a0'); }
// 破壊の翼（半面）の予兆：攻撃が来る半面（side：1＝東、-1＝西）に、中心から外へ流れていく光。k：詠唱の進み
function wingFlow(t, side, k){
  const R = Math.round(ARENA * PPY), C0 = px(0);
  alpha(.12 + .14 * k, () => { ctx.fillStyle = '#ffe0f4'; for (let dy = -R; dy <= R; dy++){ const hw = Math.floor(Math.sqrt(R * R - dy * dy)); side > 0 ? ctx.fillRect(C0 + 1, C0 + dy, hw, 1) : ctx.fillRect(C0 - hw, C0 + dy, hw, 1); } });
  const ph = (t * .6) % 1;
  for (let n = 0; n < 3; n++){ const r = ((ph + n / 3) % 1) * R, a0 = (1 - r / R * .7) * (.4 + .6 * k);
    alpha(a0, () => { for (let a = -90; a <= 90; a += 2){ const th = a * Math.PI / 180, x = C0 + side * Math.cos(th) * r, y = C0 + Math.sin(th) * r; rect(Math.round(x), Math.round(y), 1, 1, '#ffffff'); rect(Math.round(x - side * Math.cos(th)), Math.round(y - Math.sin(th)), 1, 1, '#ffc8f0'); } }); }
  const RN = rnd(21);
  for (let j = 0; j < 44; j++){
    const a = (RN() * 170 - 85) * Math.PI / 180, off = RN(), ln = 10 + RN() * 12, r0 = ((t * .84 + off) % 1) * (R + ln) - ln;
    alpha(.4 + .5 * k, () => { for (let s = 0; s < ln; s += 1){ const r = r0 + s; if (r > 4 && r < R) rect(Math.round(C0 + side * Math.cos(a) * r), Math.round(C0 + Math.sin(a) * r), 1, 1, s > ln * .6 ? '#ffffff' : '#ffd8f4'); } });
  }
}

export { makeP2Vfx, towerOrb, fieldWhite, embTell, wingFlow };
