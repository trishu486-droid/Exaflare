import { P, PPY, alpha, corner, disc, hurt, px, rect, ring, thickRing } from './gfx.js';
import { opt } from './store.js';
import { S, pick, shuffle } from './state.js';
import { FXC, fxAdd, fxParts } from './fx.js';
import { sfx } from './audio.js';

// =====================================================================
// ギミック1：混沌の終末（エクサ）
// =====================================================================
const EXA = (() => {
  const EXA_R = 6, HIT_COUNT = 6, SET_INTERVAL = 2.5, FIRST_HIT = 4.6, HIT_GAP = 0.51;
  const PATTERNS = { A:[-25, 5], B:[-15, 15], C:[-5, 25] }; // レーン i と i+3
  const END = SET_INTERVAL * 5 + FIRST_HIT + HIT_GAP * (HIT_COUNT - 1);
  function laneHit(dir, off, k){
    if (dir === 'NW'){ const s = -35 + 10 * k; return { x:(s + off) / 2, z:(s - off) / 2 }; }
    const d = 35 - 10 * k; return { x:(off + d) / 2, z:(off - d) / 2 };
  }
  function exaMark(X, Z, sx, sz, on){
    const R = EXA_R * PPY;
    alpha(.35, () => disc(X, Z, R, P.exa));
    thickRing(X, Z, R, on ? P.exa : '#c9561a', 2);
    ([[-7, '#c98a5a'], [1, '#ffd9a8'], [9, P.chev]] as [number, string][]).forEach(([o, c]) => corner(X + sx * o, Z + sz * o, sx, sz, 10, c));
  }
  return {
    id:'exa', name:'混沌の終末', sub:'エクサフレア', view:36, start:{ x:0, z:5 },
    gen(){
      const first = opt.first === 'rand' ? pick(['NW','NE']) : opt.first, second = first === 'NW' ? 'NE' : 'NW';
      const p1 = shuffle(['A','B','C']), p2 = shuffle(['A','B','C']), list = [];
      for (let i = 0; i < 3; i++){ list.push({ dir:first, pat:p1[i] }); list.push({ dir:second, pat:p2[i] }); }
      return list;
    },
    create(list){
      const sets = list.map((w, k) => {
        const start = SET_INTERVAL * k;
        const lanes = PATTERNS[w.pat].map(off => ({
          spawn: laneHit(w.dir, off, 0),
          hits: Array.from({ length:HIT_COUNT }, (_, i) => { const p = laneHit(w.dir, off, i + 1); return { t:start + FIRST_HIT + HIT_GAP * i, x:p.x, z:p.z, done:false }; })
        }));
        return { ...w, start, lanes };
      });
      const all = sets.flatMap(s => s.lanes.flatMap(l => l.hits));
      const pending = t => sets.filter(s => t >= s.start).flatMap(s => s.lanes.flatMap(l => l.hits.filter(h => !h.done)));
      return {
        end: END,
        casts: [{ name:'混沌の終末', start:0, len:3.9 }],
        progress: t => `SET ${sets.filter(s => t >= s.start).length}/6`,
        tick(t){
          let boom = false;
          all.forEach(h => {
            if (h.done || t < h.t) return;
            h.done = true; boom = true;
            fxParts(3, h.x, h.z, { cols:FXC.fire, speed:5, up:7, life:.5 }); fxAdd('scorch', h.x, h.z, { r:EXA_R * .8, cols:['#7a2a10'], dur:.9 });
            if ((S.player.x - h.x) ** 2 + (S.player.z - h.z) ** 2 <= EXA_R * EXA_R) hurt('エクサに被弾', '');
          });
          if (boom) sfx.boom();
        },
        safeActive: t => pending(t).length > 0,
        safe(x, z, t){ return pending(t).every(h => (x - h.x) ** 2 + (z - h.z) ** 2 > EXA_R * EXA_R); },
        guide(){ [[0,-5],[5,0],[0,5],[-5,0]].forEach(([x, z]) => { ring(px(x), px(z), 3, P.white); rect(px(x), px(z), 1, 1, P.white); }); },
        draw(t){
          const blink = (Math.floor(performance.now() / 150) & 1) === 0;
          sets.forEach(s => {
            if (t < s.start) return;
            s.lanes.forEach(l => {
              const h1 = l.hits[0], h2 = l.hits[1];
              const sx = Math.sign(h2.x - h1.x), sz = Math.sign(h2.z - h1.z);
              if (opt.path && !l.hits[HIT_COUNT - 1].done) l.hits.forEach(h => { if (!h.done) ring(px(h.x), px(h.z), EXA_R * PPY, '#8a7ad0'); });
              if (t - s.start < FIRST_HIT) exaMark(px(l.spawn.x), px(l.spawn.z), sx, sz, blink); // 予兆は場外の発生地点
              l.hits.forEach(h => {
                const dt = t - h.t;
                if (dt < 0 || dt > .4) return;
                const X = px(h.x), Z = px(h.z), R = EXA_R * PPY, k = dt / .4;
                if (k < .3){ alpha(.85, () => disc(X, Z, R, P.exa)); disc(X, Z, Math.round(R * .55), P.exaHi); disc(X, Z, Math.round(R * .2), P.white); }
                else { alpha(.5 * (1 - k), () => disc(X, Z, R, P.exa)); ring(X, Z, Math.round(R * (.55 + k * .45)), P.exaHi); }
              });
            });
          });
        },
      };
    }
  };
})();

export { EXA };
