import { P, PPY, alpha, corner, disc, hurt, line, px, rect, ring, thickRing } from './gfx.js';
import { opt } from './store.js';
import { S, pick, shuffle } from './state.js';
import { FXC, fxAdd, fxParts } from './fx.js';
import { sfx } from './audio.js';

// =====================================================================
// ギミック1：混沌の終末（エクサ）
// =====================================================================
const EXA = (() => {
  const EXA_R = 6, HIT_COUNT = 6, SET_INTERVAL = 2.5, FIRST_HIT = 4.6, HIT_GAP = 0.51;
  // 着弾した床：溶岩の円が同じ大きさのまま約0.9秒残り、次の1〜2発と重なる（見た目だけ。判定は着弾の瞬間）
  const LAVA = .9, FLASH = .08;
  // 実機は判定が先で、爆発の見た目は通信とエフェクトのぶん遅れて出る。判定は着弾の時刻のまま、見た目だけ VIS_DELAY 秒遅らせる
  const VIS_DELAY = .1;
  const PATTERNS = { A:[-25, 5], B:[-15, 15], C:[-5, 25] }; // レーン i と i+3
  const END = SET_INTERVAL * 5 + FIRST_HIT + HIT_GAP * (HIT_COUNT - 1) + VIS_DELAY;
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
          hits: Array.from({ length:HIT_COUNT }, (_, i) => { const p = laneHit(w.dir, off, i + 1); return { t:start + FIRST_HIT + HIT_GAP * i, x:p.x, z:p.z, done:false, shown:false }; })
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
            if (!h.done && t >= h.t){
              h.done = true;
              if ((S.player.x - h.x) ** 2 + (S.player.z - h.z) ** 2 <= EXA_R * EXA_R) hurt('エクサに被弾', '');
            }
            if (!h.shown && t >= h.t + VIS_DELAY){
              h.shown = true; boom = true;
              fxParts(3, h.x, h.z, { cols:FXC.fire, speed:5, up:7, life:.5 }); fxAdd('scorch', h.x, h.z, { r:EXA_R * .8, cols:['#7a2a10'], dur:.9 });
              fxParts(8, h.x, h.z, { cols:FXC.rock, speed:9, up:8, life:.45, size:2, spread:EXA_R * .6, grav:22 }); // 床が割れて飛ぶ破片
            }
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
                const dt = t - h.t - VIS_DELAY;
                if (dt < 0 || dt > LAVA) return;
                const X = px(h.x), Z = px(h.z), R = EXA_R * PPY;
                if (dt < FLASH){ alpha(.9, () => disc(X, Z, R, P.exaHi)); disc(X, Z, Math.round(R * .5), P.white); return; } // 着弾の一瞬の光（床の中だけ）
                const fade = Math.min(1, (LAVA - dt) / .2); // 最後だけ薄くなる
                alpha(.75 * fade, () => {
                  disc(X, Z, R, P.exa);
                  // 溶岩のひび（着弾点ごとに決まった形）
                  for (let i = 0; i < 5; i++){
                    const a = (h.x * 7 + h.z * 13 + i * 1.3) % (Math.PI * 2), b = a + .6;
                    const r0 = R * (.15 + (i % 2) * .2), r1 = R * .85;
                    line(X + Math.cos(a) * r0, Z + Math.sin(a) * r0, X + Math.cos(b) * r1, Z + Math.sin(b) * r1, P.exaDk);
                  }
                });
                alpha(fade, () => ring(X, Z, R, P.exaHi));
              });
            });
          });
        },
      };
    }
  };
})();

export { EXA };
