// =====================================================================
// 3D 視点（エクサ。2026-10-30 ユーザー）：真上から見ると難易度が下がるので、実機のように自キャラの後ろから見る
// 作り：いつもの真上の床（予兆・安地・床の効果）をいったんキャンバスに描いて、それを斜めに見た形に描き直す（昔のゲームの疑似3D）。
// 小さい解像度（OW×OW）で描いてから拡大するので、ドット絵のまま。ケフカ・自キャラ・マーカーの柱と文字・爆発の炎・破片は板として立てる
// カメラ：ふだんは動いた向きへゆっくり回って自キャラの後ろにつく。フィールドを横にスワイプ（PC はドラッグ）すると回せる。
// 縦にスワイプすると高さが変わる（ほぼ真上〜ほぼ真横。2026-10-30 ユーザー。前の高さを覚える）
// 移動：スティック・キーの「上」がカメラの向き（奥）になる（game.ts の movePlayer）
// =====================================================================
import { ARENA_R, SQ2 } from './config.js';
import { W, C0, PPY, P, cv, ctx, drawField, drawBoss, drawIcon, drawSafe } from './gfx.js';
import { FX, fxDraw } from './fx.js';
import { kefkaSprite } from './kefka_art.js';
import { mech } from './mechs.js';
import { opt, store } from './store.js';
import { S } from './state.js';

// エクサはいつも 3D（2026-10-30 ユーザー：真上の見え方はメニューから消した。opt.view は見ない）
// P5 通し（全通しの P5 も）は、エクサの間だけ 3D（inst.in3d。mech_run.ts）
const on3d = () => S.phase !== 'menu' && !!S.inst && (mech().id === 'exa' || !!S.inst.in3d?.(S.t));
// yaw：カメラの向き（0＝北を向く。右回りが＋）。elev：見下ろす角度（0＝真横、π/2＝真上）
// はじめの角度は実機のスクリーンショット（2026-10-30 ユーザー）に合わせて高め（約35°）。前の版の保存値は使わない（cam3dElev2）
const ELEV0 = .62, ELEV_MIN = .06, ELEV_MAX = 1.45;
const V = { yaw:0, elev:(() => { const v = Number(store.get('cam3dElev2', ELEV0)); return Number.isFinite(v) ? Math.max(ELEV_MIN, Math.min(ELEV_MAX, v)) : ELEV0; })() };
const OW = 176;                          // 3D を描く解像度（正方形）。キャンバス（288）に拡大する
// 実機に寄せる（2026-10-30 ユーザー：遠くて広く見えると易しくなる）：自キャラ（胸の高さ LOOK_Y）を画面の真ん中に、距離 DIST（実機の一番引いた所は約20）、視野は狭め
const KEFKA_K = .42; // ケフカの板の大きさ（真上の絵の何倍か。2026-10-30 ユーザー：0.6 の 0.7 倍）。実機のスクリーンショットでは自キャラの近くでも画面をふさがない
const DIST = 17, LOOK_Y = 1.5, FOV = 1.05, HOR = .5, THICK = 3; // カメラから自キャラまでの距離、見る高さ、視野、画面の中心の行、足場の厚み
const fwdOf = yaw => ({ x:Math.sin(yaw), z:-Math.cos(yaw) });
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
function resetView(){ V.yaw = 0; }
// スティックの向き（画面の上＝-z）を、カメラから見た向きに直す
function moveDir(mx, mz){ const f = fwdOf(V.yaw); return { x:-f.z * mx + f.x * -mz, z:f.x * mx + f.z * -mz }; }
// 前寄りに動いているときだけ、その向きへカメラをゆっくり回す（真横・手前へ動くときは回さない。横によけている間に景色が回らないように）
// 2026-10-30 ユーザー：ななめに動いたときに勝手に回るのはやめて、スワイプしたときだけ回す（作りは AUTO_TURN で残す）
const AUTO_TURN = false;
function follow(dx, dz, dt){
  if (!AUTO_TURN) return;
  const want = Math.atan2(dx, -dz), d = wrap(want - V.yaw);
  if (Math.abs(d) < 1.1) V.yaw = wrap(V.yaw + d * (1 - Math.exp(-.8 * dt)));
}
function turn(rad){ V.yaw = wrap(V.yaw + rad); }
function tilt(rad){ V.elev = Math.max(ELEV_MIN, Math.min(ELEV_MAX, V.elev + rad)); try { store.set('cam3dElev2', V.elev); } catch {} }

// ---- 背景（上）：岩の崖のパノラマ。一度だけ作る（横 PANO_W・縦 PANO_H、縦は地平線から上の角度） ----
const PANO_W = 1024, PANO_H = 96, PANO_TOP = .9;
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const vn = (s, k, per) => { const i = Math.floor(s), fr = s - i, a = hash((i % per) + k), b = hash(((i + 1) % per) + k); return a + (b - a) * fr; };
let pano = null;
function makePano(){
  pano = new Uint8ClampedArray(PANO_W * PANO_H * 3);
  const ROCK = [[34, 16, 12], [52, 24, 16], [74, 34, 20]];
  for (let x = 0; x < PANO_W; x++){
    const u = x / PANO_W, tops = [0, 1, 2].map(L => { const f1 = 7 + L * 4, f2 = 23 + L * 9, f3 = 70 + L * 20; const r = vn(u * f1, L * 100, f1) * .55 + vn(u * f2, L * 200 + 5, f2) * .3 + vn(u * f3, L * 300 + 9, f3) * .15; return .01 + Math.pow(r, 2.2) * (.55 - L * .15); });
    for (let y = 0; y < PANO_H; y++){
      const elev = (1 - y / PANO_H) * PANO_TOP, g = Math.max(0, 1 - elev / .5), band = Math.floor(g * 5) / 5;
      let col = [22 + 90 * band * band, 10 + 34 * band * band, 10 + 8 * band];
      for (let L = 0; L < 3; L++) if (elev < tops[L]){ col = ROCK[L]; const sh = hash(Math.floor(u * 700) * 1.7 + Math.floor(elev * 40) * 3.3 + L); if (sh > .8) col = col.map(v => v * .7); else if (sh < .08) col = col.map(v => v * 1.35); if (tops[L] - elev < .012) col = [150 - L * 20, 70, 30]; }
      if (hash(x * 13 + y * 7.3) > .993) col = [120, 60, 30]; // 浮いている破片
      const i = (y * PANO_W + x) * 3; pano[i] = col[0]; pano[i + 1] = col[1]; pano[i + 2] = col[2];
    }
  }
}
// ---- マーカーの文字（光る大きな文字）・爆発の炎。一度だけ作る ----
const glyphs = {};
function glyphC(ch, col){
  const key = ch + col; if (glyphs[key]) return glyphs[key];
  const g = document.createElement('canvas'); g.width = 12; g.height = 14; const x = g.getContext('2d');
  x.font = 'bold 13px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(ch, 6, 7.5);
  const im = x.getImageData(0, 0, 12, 14); for (let q = 0; q < im.data.length; q += 4) im.data[q + 3] = im.data[q + 3] > 110 ? 255 : 0; x.putImageData(im, 0, 0);
  const o = document.createElement('canvas'); o.width = 14; o.height = 16; const ox = o.getContext('2d');
  ox.globalAlpha = .55; [[0, 1], [2, 1], [1, 0], [1, 2]].forEach(([a, b]) => ox.drawImage(g, a, b)); ox.globalAlpha = 1; ox.filter = 'brightness(1.6)'; ox.drawImage(g, 1, 1);
  return glyphs[key] = o;
}
const flames = {};
function flame(seed, step){ // step：0（出たて）〜5（消えかけ）
  const key = seed + ':' + step; if (flames[key]) return flames[key];
  const fw = 28, fh = 34, age = step / 6, g = document.createElement('canvas'); g.width = fw; g.height = fh; const x = g.getContext('2d'), im = x.createImageData(fw, fh);
  for (let yy = 0; yy < fh; yy++) for (let xx = 0; xx < fw; xx++){
    const u = (xx - fw / 2) / (fw / 2), v = 1 - yy / fh, n = hash(Math.floor(xx / 2) * 5.1 + Math.floor(yy / 2) * 9.7 + seed * 3.3) * .5;
    const shape = (1 - Math.abs(u)) * (1 - v * .9) + n * .4 - age * .6 - .35; if (shape <= 0) continue;
    const heat = Math.min(1, shape * 2.2), q = (yy * fw + xx) * 4, C = heat > .8 ? [255, 250, 220] : heat > .55 ? [255, 220, 90] : heat > .3 ? [255, 150, 40] : [220, 70, 20];
    im.data[q] = C[0]; im.data[q + 1] = C[1]; im.data[q + 2] = C[2]; im.data[q + 3] = 255;
  }
  x.putImageData(im, 0, 0); return flames[key] = g;
}

const out = document.createElement('canvas'); out.width = out.height = OW;
const oc = out.getContext('2d'); oc.imageSmoothingEnabled = false;
const img = oc.createImageData(OW, OW);
const icon = document.createElement('canvas'); icon.width = icon.height = 24;
// フィールドの外の予兆（エクサの発生地点）の円の中の濃さ。実機は中が暗く透けていて、縁と「>>>」だけが明るい（2026-10-30 ユーザー。サンプル C）
const MARK_FILL = .4;
const SPACE = [28, 26, 60], STAR = [74, 68, 120]; // 真上の画面のフィールドの外の色（P.space・P.star）。これ以外は予兆なので外でも描く

function draw3d(){
  if (!pano) makePano();
  // 1) 真上の床を描く（ボスの絵・自キャラ・粒は描かない。板として立てる）
  const art = S.inst.bossArt; S.inst.bossArt = null;
  const parts = FX.parts.splice(0);
  ctx.save(); ctx.clearRect(0, 0, W, W);
  drawField();
  if (opt.spots) S.inst.guide?.(S.t);
  drawBoss(); S.inst.draw(S.t); if (S.phase !== 'menu') fxDraw(); drawSafe();
  ctx.restore();
  FX.parts.push(...parts); S.inst.bossArt = art;
  const tex = ctx.getImageData(0, 0, W, W).data;
  ctx.clearRect(0, 0, 24, 24); drawIcon(12, 12, performance.now() - S.hurtT < 500);
  const ic = icon.getContext('2d'); ic.clearRect(0, 0, 24, 24); ic.drawImage(cv, 0, 0, 24, 24, 0, 0, 24, 24);

  // 2) カメラ
  const Pl = S.player, f = fwdOf(V.yaw), rx = -f.z, rz = f.x;
  const e = V.elev, back = DIST * Math.cos(e);
  const cam = { x:Pl.x - f.x * back, z:Pl.z - f.z * back, y:LOOK_Y + DIST * Math.sin(e) };
  const fl = (OW / 2) / Math.tan(FOV / 2), cp = Math.cos(e), sp = Math.sin(e), R2 = ARENA_R * ARENA_R, d = img.data;
  const setPx = (i, r, g, b) => { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  for (let sy = 0; sy < OW; sy++){
    const vy = -(sy - OW * HOR) / fl, dy = vy * cp - sp, dfw = vy * sp + cp;
    for (let sx = 0; sx < OW; sx++){
      const vx = (sx - OW / 2) / fl, i = (sy * OW + sx) * 4;
      if (dy >= -1e-3){ // 空：岩の崖のパノラマ
        const elev = Math.atan2(dy, Math.hypot(dfw, vx)), u = ((V.yaw + Math.atan2(vx, dfw)) / (Math.PI * 2) % 1 + 1) % 1;
        const px = Math.floor(u * PANO_W) % PANO_W, py = Math.max(0, Math.min(PANO_H - 1, Math.floor((1 - elev / PANO_TOP) * PANO_H))), j = (py * PANO_W + px) * 3;
        setPx(i, pano[j], pano[j + 1], pano[j + 2]); continue;
      }
      const t = cam.y / -dy, wx = cam.x + (f.x * dfw + rx * vx) * t, wz = cam.z + (f.z * dfw + rz * vx) * t;
      const tx = Math.round(C0 + wx * PPY), tz = Math.round(C0 + wz * PPY), inTex = tx >= 0 && tz >= 0 && tx < W && tz < W, j = (tz * W + tx) * 4;
      if (wx * wx + wz * wz <= R2 && inTex){ setPx(i, tex[j], tex[j + 1], tex[j + 2]); continue; }
      // 足場の外：足場の側面（厚み THICK）か、下の暗い谷。谷の上にも予兆（場外のエクサの発生地点）は描く
      const t2 = (cam.y + THICK) / -dy, x2 = cam.x + (f.x * dfw + rx * vx) * t2, z2 = cam.z + (f.z * dfw + rz * vx) * t2;
      if (x2 * x2 + z2 * z2 <= R2){ setPx(i, 96, 48, 26); continue; }
      let r = 16, g = 9, b = 7; if (hash(Math.floor(wx * 1.3) * 3.1 + Math.floor(wz * 1.3) * 7.7) > .9){ r = 38; g = 20; b = 12; }
      if (inTex){ const c0 = tex[j], c1 = tex[j + 1], c2 = tex[j + 2]; if (!(c0 === SPACE[0] && c1 === SPACE[1] && c2 === SPACE[2]) && !(c0 === STAR[0] && c1 === STAR[1] && c2 === STAR[2])){ const al = Math.min(1, tex[j + 3] / 255 / .35 * MARK_FILL); r = r + (c0 - r) * al; g = g + (c1 - g) * al; b = b + (c2 - b) * al; } } // 薄く消えていく予兆は、谷の色と混ぜる（予兆の円の地の濃さ 0.35 を「くっきり」とする）
      setPx(i, r, g, b);
    }
  }
  // 足場の上の縁を明るいオレンジに
  for (let sy = OW - 1; sy > 0; sy--) for (let sx = 0; sx < OW; sx++){ const i = (sy * OW + sx) * 4, u = i - OW * 4; if (d[i] === 96 && d[i + 1] === 48 && d[i + 2] === 26 && !(d[u] === 96 && d[u + 1] === 48 && d[u + 2] === 26)) setPx(i, 230, 140, 60); }
  oc.putImageData(img, 0, 0);

  // 3) 立っているもの（奥から順に描く）
  const proj = (wx, wy, wz) => { const qx = wx - cam.x, qz = wz - cam.z, qy = wy - cam.y, right = qx * rx + qz * rz, fwd = qx * f.x + qz * f.z, cz = fwd * cp - qy * sp, cy = fwd * sp + qy * cp; return { x:OW / 2 + right / cz * fl, y:OW * HOR - cy / cz * fl, s:fl / cz, z:cz }; };
  const items = [], pz = proj(Pl.x, 0, Pl.z).z;
  // 自キャラより手前（カメラ寄り）にあるものは薄くして、自キャラが隠れないようにする
  const near = z => z < pz ? .35 : 1;
  // フィールドマーカー：光の柱＋浮いた大きな文字（gfx.ts の drawField と同じ置き方）
  const mk = S.inst.markers, m = mk?.card ?? 16, dd = Math.round((mk?.num ?? m) / SQ2);
  const corners = (mk?.corner || S.inst.fieldMarker || opt.marker) === 'nw' ? [[-dd, -dd], [dd, -dd], [dd, dd], [-dd, dd]] : [[dd, -dd], [dd, dd], [-dd, dd], [-dd, -dd]];
  const MK = [['A', 0, -m, 0], ['B', m, 0, 1], ['C', 0, m, 2], ['D', -m, 0, 3], ...corners.map(([x, z], k) => [String(k + 1), x, z, k])];
  MK.forEach(([ch, x, z, k]) => { const q = proj(x, 0, z); if (q.z <= 1) return; const col = P.mk[k]; items.push({ z:q.z, draw:() => {
    const w = Math.max(2, Math.round(1.6 * q.s)), h = Math.round(2.4 * q.s), x0 = Math.round(q.x - w / 2), y0 = Math.round(q.y - h);
    const k = near(q.z);
    oc.fillStyle = col; oc.globalAlpha = .18 * k; oc.fillRect(x0, y0, w, h);
    oc.globalAlpha = .45 * k; for (let yy = y0 + 1; yy < y0 + h; yy += 3) oc.fillRect(x0 + 1, yy, w - 2, 1);
    oc.globalAlpha = .6 * k; oc.fillRect(x0, y0, 1, h); oc.fillRect(x0 + w - 1, y0, 1, h);
    const g = glyphC(ch, col), gs = 1.7 * q.s / 14; oc.globalAlpha = k; oc.drawImage(g, Math.round(q.x - 7 * gs), Math.round(y0 - 17 * gs), Math.round(14 * gs), Math.round(16 * gs)); oc.globalAlpha = 1;
  } }); });
  // 爆発（fx の scorch＝エクサの着弾）：円（半径6）と同じ幅の炎と、床の光。実機のように、まわりや奥が一瞬見えにくくなる
  let flash = 0;
  FX.list.forEach((e, n) => { if (e.kind !== 'scorch') return; const a = (S.t - e.at) / e.dur; if (a < 0 || a >= 1) return; const q = proj(e.x, 0, e.z); if (q.z <= 1) return;
    const seed = Math.round((e.x + 40) * 7 + (e.z + 40) * 3) % 5; flash = Math.max(flash, 1 - (S.t - e.at) / .25);
    items.push({ z:q.z, draw:() => {
      oc.save(); oc.globalCompositeOperation = 'lighter'; oc.globalAlpha = .55 * (1 - a); oc.fillStyle = '#ff8a2a'; oc.beginPath(); oc.ellipse(q.x, q.y, 6 * q.s, 6 * q.s * sp, 0, 0, 7); oc.fill();
      oc.globalAlpha = .5 * (1 - a); oc.fillStyle = '#ffe08a'; oc.beginPath(); oc.ellipse(q.x, q.y, 3.5 * q.s, 3.5 * q.s * sp, 0, 0, 7); oc.fill(); oc.restore();
      const w = 12 * q.s, h = 27 * q.s * (1 - a * .35), top = q.y - h * .92, img = flame(seed, Math.min(5, Math.floor(a * 6)));
      const nk = q.z >= pz ? 1 : pz - q.z < 8 ? .5 : .25; // 自キャラより手前の炎は薄く（カメラに近いと大きな四角になって画面をふさぐ）。自キャラのすぐ手前（8 以内）は 0.5 の濃さで残して、自キャラを少し隠す（2026-10-30 ユーザー。サンプル B）
      if (top > 2 && nk === 1){ oc.save(); oc.globalCompositeOperation = 'lighter'; // 炎の上へ、画面の上まで薄くのびる炎（2段で上ほど薄い）
        const ew = Math.round(w * .8), ex = Math.round(q.x - ew / 2), eb = Math.round(top + h * .4);
        oc.globalAlpha = .2 * (1 - a); oc.drawImage(img, ex, 0, ew, eb);
        oc.globalAlpha = .2 * (1 - a); oc.drawImage(img, ex, Math.round(top * .5), ew, eb - Math.round(top * .5));
        oc.restore(); }
      oc.globalAlpha = (1 - a * .5) * nk; oc.drawImage(img, Math.round(q.x - w / 2), Math.round(q.y - h * .92), Math.round(w), Math.round(h)); oc.globalAlpha = 1; } }); });
  // 飛び散る粒（高さつき）
  FX.parts.forEach(pt => { const a = S.t - pt.at; if (a < 0 || a > pt.life) return; const y = Math.max(0, pt.vh * a - pt.g * a * a / 2), q = proj(pt.x + pt.vx * a, y, pt.z + pt.vz * a); if (q.z <= 1) return;
    items.push({ z:q.z, draw:() => { oc.fillStyle = pt.cols[Math.min(pt.cols.length - 1, Math.floor(a / pt.life * pt.cols.length))]; const s = Math.max(1, Math.round(.35 * q.s)); oc.fillRect(Math.round(q.x), Math.round(q.y), s, s); } }); });
  // ケフカ
  const ko = typeof art === 'string' ? { id:art } : art, ksp = ko && kefkaSprite(ko.id);
  if (ksp){ const bp = proj(0, 0, 0); if (bp.z > 1) items.push({ z:bp.z, draw:() => { const kk = (ko.k ?? 1) * KEFKA_K, hw = ksp.width * kk / PPY, hh = ksp.height * kk / PPY; oc.globalAlpha = bp.z < pz ? .45 : 1; oc.drawImage(ksp, Math.round(bp.x - hw * bp.s / 2), Math.round(bp.y - hh * bp.s * .8), Math.round(hw * bp.s), Math.round(hh * bp.s)); oc.globalAlpha = 1; } }); }
  // 自キャラ（落ちたときは小さくなって消える）
  const fall = S.fall ? Math.min(1, (performance.now() - S.fall.at) / 750) : 0;
  if (fall < 1){ const pp = proj(Pl.x, -fall * 4, Pl.z), sz = 2.4 * pp.s * (1 - fall * fall); items.push({ z:pp.z, draw:() => {
    if (!fall){ oc.strokeStyle = '#ffd84a'; oc.lineWidth = 1; oc.beginPath(); oc.ellipse(pp.x, pp.y, 1.6 * pp.s, 1.6 * pp.s * sp, 0, 0, 7); oc.stroke();
      oc.globalAlpha = .4; oc.fillStyle = '#000'; oc.beginPath(); oc.ellipse(pp.x, pp.y, sz * .3, sz * .1, 0, 0, 7); oc.fill(); oc.globalAlpha = 1; }
    oc.drawImage(icon, Math.round(pp.x - sz / 2), Math.round(pp.y - sz * .95), Math.round(sz), Math.round(sz));
  } }); }
  items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
  // 着弾の瞬間は画面全体を少し明るく（3D のときだけ。真上の画面は光らせない決まりのまま）
  // 爆発が続いている間は画面全体がオレンジにかすむ（2026-10-30 ユーザー：実機は床も予兆も見えにくい）。自キャラの近くの爆発ほど濃い。4段に分けて変える
  let haze = 0;
  FX.list.forEach(e => { if (e.kind !== 'scorch') return; const a = (S.t - e.at) / e.dur; if (a < 0 || a >= 1) return; haze += (1 - a) * Math.max(0, 1 - Math.hypot(e.x - Pl.x, e.z - Pl.z) / 18); });
  const HZ = [.6, .62, .24]; // 濃くなる速さ・オレンジの濃さ・明るさ（2026-10-30 ユーザー：サンプル C。はじめの 1.6 倍）
  haze = Math.ceil(Math.min(1, haze * HZ[0]) * 4) / 4;
  if (haze > 0){ oc.save(); oc.globalAlpha = HZ[1] * haze; oc.fillStyle = '#ff8a3a'; oc.fillRect(0, 0, OW, OW); oc.globalCompositeOperation = 'lighter'; oc.globalAlpha = HZ[2] * haze; oc.fillStyle = '#ffd08a'; oc.fillRect(0, 0, OW, OW); oc.restore(); }
  if (flash > 0){ oc.save(); oc.globalCompositeOperation = 'lighter'; oc.globalAlpha = .3 * flash; oc.fillStyle = '#ffb060'; oc.fillRect(0, 0, OW, OW); oc.restore(); }

  // 4) キャンバスに拡大して出す
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, W); ctx.drawImage(out, 0, 0, W, W); ctx.restore();
}
export { on3d, draw3d, moveDir, follow, turn, tilt, resetView };
