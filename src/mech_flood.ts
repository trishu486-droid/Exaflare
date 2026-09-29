import { SQ2 } from './config.js';
import { S, pick } from './state.js';
import { sfx } from './audio.js';
import { healerHit } from './action.js';
import { FXC, FXK, fxParts, fxShake, fxStep } from './fx.js';
import { C0, P, alpha, fillArena, glyph, hurt, px, rect } from './gfx.js';
import { opt } from './store.js';

// =====================================================================
// ギミック2：フラッド（斜めの帯 × 4回。予兆は1.2秒だけ、着弾は約6秒後）
// =====================================================================
const FLOOD = (() => {
  const HALF = 5, TELE_AT = 0.4, STAGGER = 1.02, TELE_LEN = 1.2, RESOLVE = 6.05;
  // 帯の横位置：'A' は北西→南東向きの帯（u = (x−z)/√2）、'B' は北東→南西向きの帯（v = (−x−z)/√2）
  const perp = (fam, x, z) => fam === 'A' ? (x - z) / SQ2 : (-x - z) / SQ2;
  function span(fam, c, z){
    const lo = SQ2 * (c - HALF), hi = SQ2 * (c + HALF);
    return fam === 'A' ? [z + lo, z + hi] : [-z - hi, -z - lo];
  }
  function pairs(rev){ return rev ? [[-5, 15], [-15, 5]] : [[5, -15], [15, -5]]; }
  return {
    id:'flood', name:'フラッド', sub:'カオティックフラッド', view:24, start:{ x:0, z:2 },
    gen(){ return { first:pick(['A','B']), revA:Math.random() < .5, revB:Math.random() < .5 }; },
    create(p){
      const second = p.first === 'A' ? 'B' : 'A';
      const pf = pairs(p.first === 'A' ? p.revA : p.revB), ps = pairs(second === 'A' ? p.revA : p.revB);
      const order = [[p.first, pf[0]], [second, ps[0]], [p.first, pf[1]], [second, ps[1]]];
      const ticks = order.map(([fam, offs], k) => ({ fam, offs, tele:TELE_AT + k * STAGGER, hit:TELE_AT + k * STAGGER + RESOLVE, done:false }));
      const inTick = (tk, x, z) => tk.offs.some(c => Math.abs(perp(tk.fam, x, z) - c) <= HALF);
      const next = t => ticks.find(tk => !tk.done && t >= tk.tele);
      return {
        end: ticks[3].hit + .8,
        casts: [{ name:'フラッド', start:.3, len:4.7 }],
        progress: t => `WAVE ${ticks.filter(tk => tk.done).length}/4`,
        tick(t){
          ticks.forEach(tk => {
            if (tk.done || t < tk.hit) return;
            tk.done = true; sfx.splash();
            healerHit(75000, 'カオティックフラッド'); // カオティックフラッド（頭割り）
            // 演出：帯に沿ってしぶき、頭割りはパーティの位置にピンクの光
            tk.offs.forEach(c => { for (let s = -18; s <= 18; s += 4){
              const x = tk.fam === 'A' ? (c + s) / SQ2 : (-c + s) / SQ2, z = tk.fam === 'A' ? (s - c) / SQ2 : (-c - s) / SQ2;
              if (x * x + z * z < 19 * 19) fxParts(3, x, z, { cols:FXC.water, speed:4, up:9, life:.7, size:2, spread:6 }); } });
            FXK.stack(S.player.x, S.player.z, 2.2); fxShake(2, .2);
            if (inTick(tk, S.player.x, S.player.z)) hurt('フラッドに被弾', '');
          });
        },
        safeActive: t => !!next(t),
        safe(x, z, t){ const tk = next(t); return !tk || !inTick(tk, x, z); },
        guide(){ [[0,-2],[2,0],[0,2],[-2,0]].forEach(([x, z]) => rect(px(x) - 1, px(z) - 1, 3, 3, P.white)); },
        draw(t){
          const blink = (Math.floor(performance.now() / 120) & 1) === 0;
          ticks.forEach((tk, k) => {
            // 予兆（実機は1.2秒だけ。補助表示ONなら着弾まで薄く残す）
            const showTele = t >= tk.tele && t < tk.tele + TELE_LEN;
            const keep = opt.path && t >= tk.tele && !tk.done;
            if (showTele || keep){
              tk.offs.forEach(c => {
                alpha(showTele ? .4 : .15, () => fillArena(z => span(tk.fam, c, z), P.exa));
                if (showTele && blink) alpha(.35, () => fillArena(z => span(tk.fam, c, z), P.exaHi));
                // 予兆の帯のふちに白い線
                if (showTele){ fillArena(z => { const s = span(tk.fam, c, z); return [s[0], s[0] + .45]; }, P.white); fillArena(z => { const s = span(tk.fam, c, z); return [s[1] - .45, s[1]]; }, P.white); }
              });
              if (keep && !showTele) tk.offs.forEach(c => { const s = span(tk.fam, c, 0); glyph(String(k + 1), px((s[0] + s[1]) / 2), C0, P.white); });
            }
            // 着弾：水の帯（白→水色→青の3段階。流れの縞が帯の中を走る）
            const dt = t - tk.hit, WET = .9;
            if (dt >= 0 && dt < WET){
              const k = dt / WET, step = fxStep(k, 3), base = [P.waterHi, P.water, '#1a6ad8'][step];
              tk.offs.forEach(c => {
                alpha(step === 2 ? .45 : .8, () => fillArena(z => span(tk.fam, c, z), base));
                for (let j = 0; j < 3; j++){
                  const off = ((Math.floor(dt * 20) * 1.2 + j * 3.4) % 10) - 5;
                  alpha(.85 * (1 - k), () => fillArena(z => { const s = span(tk.fam, c, z), m = (s[0] + s[1]) / 2 + off; return [m - .5, m + .5]; }, P.white));
                }
              });
            }
          });
        },
      };
    }
  };
})();

export { FLOOD };
