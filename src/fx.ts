import { S } from './state.js';
import { opt } from './store.js';
import { PPY, W, alpha, disc, line, px, rect, thickRing } from './gfx.js';
import { ARENA_R } from './config.js';

// ===== 演出（8bit：色は段階的に切り替え、粒は四角いドット、画面の揺れとフラッシュ） =====
// 時刻はゲーム内の S.t。座標はフィールドの y（x, z）。揺れ・フラッシュは設定で切れる
const FX = { list:[], parts:[], shakeA:0, shakeUntil:-9, flash:null };
const FXC = {
  holy:['#ffffff', '#c8f0ff', '#8ad8ff', '#3a8aff'], flare:['#ffffff', '#ffe070', '#ff9a3a', '#e8442a', '#7a1a10'],
  magenta:['#ffffff', '#ff8af0', '#e040d0', '#7a2a9a', '#3a1a4a'], water:['#ffffff', '#c8f0ff', '#3ab8ff', '#1a6ad8'],
  ice:['#ffffff', '#c8f8ff', '#6ad8ff', '#2a8ad8'], thunder:['#ffffff', '#e8c8ff', '#b05aff', '#5a2aa8'],
  fire:['#ffffff', '#ffe070', '#ff9a3a', '#e8442a'], void:['#ff8af0', '#b05aff', '#5a1a8a', '#1a0a2a', '#000000'],
  wind:['#e8fff0', '#8af0a8', '#3ac860', '#1a7a3a'], rock:['#e8c890', '#b08850', '#6a4a2a', '#3a2a1a'],
  orange:['#ffffff', '#ffe08a', '#ff7a1f', '#a8400a'],
};
const fxStep = (k, n) => Math.min(n - 1, Math.floor(k * n)); // 0〜1 の進み具合 → 何段目の色か
function fxReset(){ FX.list.length = 0; FX.parts.length = 0; FX.flash = null; FX.shakeUntil = -9; }
function fxAdd(kind, x, z, o = {}){ FX.list.push({ kind, x, z, at:S.t, dur:.5, ...o }); }
function fxShake(a, dur = .25){ if (!opt.fx) return; FX.shakeA = FX.shakeUntil > S.t ? Math.max(FX.shakeA, a) : a; FX.shakeUntil = S.t + dur; }
// 攻撃の光：画面（ゲーム機の画面の枠の中）全体を光らせる（style.css の .screen.flash）。3段階で消える。
// 赤は被弾（.screen.hurt）だけに使う決まりなので、ここでは赤い色を使わない
function fxFlash(color, a = .55, dur = .15){
  if (!opt.fx) return;
  const scr = document.querySelector('.screen') as HTMLElement;
  scr.style.setProperty('--flash', color); scr.style.setProperty('--flash-a', String(a)); scr.style.setProperty('--flash-d', (dur / (opt.speed || 1)) + 's');
  scr.classList.remove('flash'); void scr.offsetWidth; scr.classList.add('flash');
}
// 粒：n 個。speed は y/秒、up は上向きの初速（重力で落ちる）
function fxParts(n, x, z, { cols = FXC.flare, speed = 8, up = 6, life = .6, size = 2, spread = 0, grav = 18 } = {}){
  for (let i = 0; i < n && FX.parts.length < 500; i++){
    const a = Math.random() * Math.PI * 2, v = speed * (.4 + Math.random() * .6);
    FX.parts.push({ x:x + (Math.random() - .5) * spread, z:z + (Math.random() - .5) * spread, vx:Math.cos(a) * v, vz:Math.sin(a) * v * .6,
      vh:up * (.5 + Math.random() * .8), g:grav, at:S.t, life:life * (.6 + Math.random() * .6), cols, size });
  }
}
function fxShakeOffset(){
  if (!opt.fx || S.t >= FX.shakeUntil) return [0, 0];
  const a = Math.round(FX.shakeA * Math.min(1, (FX.shakeUntil - S.t) / .15));
  const f = Math.floor(S.t * 40); // 1/40 秒ごとにガタガタ
  return [((f * 7) % 3 - 1) * a, ((f * 5) % 3 - 1) * a];
}
function fxDraw(){
  const t = S.t;
  FX.list = FX.list.filter(e => t - e.at < e.dur);
  FX.list.forEach(e => {
    const age = t - e.at; if (age < 0) return;
    const k = Math.floor(age * 20) / (e.dur * 20), X = px(e.x), Z = px(e.z); // 1/20 秒刻みでコマ送り
    const cols = e.cols || FXC.flare, c = cols[fxStep(k, cols.length)];
    const R = Math.round((e.r || 3) * PPY);
    if (e.kind === 'burst'){ // 広がって色が落ちていく丸い爆発
      const r = Math.max(2, Math.round(R * (.35 + .65 * Math.min(1, k * 2.2))));
      alpha(k < .6 ? .9 : .9 * (1 - k) / .4, () => disc(X, Z, r, c));
      if (k < .5) disc(X, Z, Math.round(r * .45), cols[0]);
      thickRing(X, Z, r + 1, k < .3 ? '#ffffff' : c, 2);
    } else if (e.kind === 'ring'){ // 衝撃波の輪
      const r = Math.round(R * (.2 + .8 * k));
      thickRing(X, Z, r, c, k < .5 ? 3 : 2);
    } else if (e.kind === 'pillar'){ // 地面から立ち上がる光の柱
      const w = Math.max(4, Math.round(R * 1.2 * (1 - k * .6))), h = Math.round((e.h || 60) * Math.min(1, k * 3));
      alpha(1 - k * .7, () => { rect(X - (w >> 1), Z - h, w, h, c); rect(X - (w >> 2), Z - h, Math.max(2, w >> 1), h, cols[0]); });
      disc(X, Z, Math.round(R * .8), c);
    } else if (e.kind === 'star'){ // 十字のきらめき
      const L = Math.round((e.L || 14) * (1 - k));
      for (let i = -1; i <= 1; i++){ line(X - L, Z + i, X + L, Z + i, i ? c : cols[0]); line(X + i, Z - L, X + i, Z + L, i ? c : cols[0]); }
      const d = Math.round(L * .6); line(X - d, Z - d, X + d, Z + d, c); line(X - d, Z + d, X + d, Z - d, c);
    } else if (e.kind === 'beam'){ // 横一文字の光
      const hgt = Math.max(1, Math.round(8 * (1 - k)));
      rect(0, Z - hgt, W, hgt * 2, c); rect(0, Z - (hgt >> 1), W, Math.max(1, hgt), cols[0]);
    } else if (e.kind === 'bolt'){ // 上から落ちるギザギザの雷
      if ((Math.floor(age * 30) & 1) && k > .3) return;
      let x0 = X + (e.dx || 0), y0 = 0; const seg = 8;
      for (let i = 1; i <= seg; i++){ const y1 = Math.round(Z * i / seg), x1 = Math.round(X + (e.dx || 0) * (1 - i / seg) + ((i * 37 + Math.round(e.seed || 0)) % 13 - 6));
        line(x0, y0, x1, y1, c); line(x0 + 1, y0, x1 + 1, y1, cols[0]); x0 = x1; y0 = y1; }
    } else if (e.kind === 'implode'){ // 縮んで消える穴
      const r = Math.round(R * (1 - k));
      alpha(.85, () => disc(X, Z, r, c)); thickRing(X, Z, r + 1, cols[0], 2);
    } else if (e.kind === 'swirl'){ // 回るドットの渦
      const n = 18, rr = R;
      for (let i = 0; i < n; i++){ const a = i / n * Math.PI * 2 + age * 6 * (e.spin || 1), r2 = rr * (.5 + .5 * ((i * 7) % 5) / 4) * (e.inward ? 1 - k * .8 : 1);
        rect(X + Math.round(Math.cos(a) * r2) - 1, Z + Math.round(Math.sin(a) * r2) - 1, 3, 3, cols[i % cols.length]); }
    } else if (e.kind === 'scorch'){ // 床に残る焦げ跡
      alpha(.5 * (1 - k), () => disc(X, Z, R, c));
    }
  });
  // 粒
  FX.parts = FX.parts.filter(p => t - p.at < p.life);
  FX.parts.forEach(p => {
    const a = t - p.at; if (a < 0) return;
    const x = p.x + p.vx * a, z = p.z + p.vz * a, h = Math.max(0, p.vh * a - .5 * p.g * a * a);
    rect(px(x) - (p.size >> 1), Math.round(px(z) - h * PPY) - (p.size >> 1), p.size, p.size, p.cols[fxStep(a / p.life, p.cols.length)]);
  });
}
function fxFlashDraw(){} // 攻撃の光は画面全体（fxFlash）に移した。フィールドには描かない
// よく使う組み合わせ
const FXK = {
  holy(x, z, r){ fxAdd('burst', x, z, { r, cols:FXC.holy, dur:.55 }); fxAdd('ring', x, z, { r:r * 1.3, cols:FXC.holy, dur:.4 }); fxParts(10, x, z, { cols:FXC.holy, speed:6, up:8, life:.6 }); },
  flare(x: number, z: number, r: number, big = false){ fxAdd('burst', x, z, { r, cols:FXC.flare, dur:big ? .8 : .55 }); fxParts(big ? 30 : 12, x, z, { cols:FXC.fire, speed:big ? 14 : 8, up:10, life:.7, spread:r }); fxShake(big ? 5 : 2, big ? .45 : .2); if (big) fxFlash('#ffe8a0', .6, .2); },
  stack(x, z, r, cols = FXC.magenta){ fxAdd('pillar', x, z, { r, cols, dur:.45, h:70 }); fxAdd('star', x, z - 2, { cols, L:18, dur:.3 }); fxParts(12, x, z, { cols:[cols[1], cols[2], cols[3]], speed:4, up:3, life:.9, size:3, grav:2, spread:r }); },
};
const inArena = (x, z) => x * x + z * z <= ARENA_R * ARENA_R;

export { FX, FXC, fxStep, fxReset, fxAdd, fxShake, fxFlash, fxParts, fxShakeOffset, fxDraw, fxFlashDraw, FXK, inArena };
