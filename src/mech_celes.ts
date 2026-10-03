import { opt } from './store.js';
import { S, pick, shuffle } from './state.js';
import { sfx } from './audio.js';
import { FXC, fxAdd, fxFlash, fxParts, fxShake } from './fx.js';
import { healerHit } from './action.js';
import { C0, P, PPY, alpha, disc, donut, hurt, icon5, px, ring, thickRing } from './gfx.js';
import { ARENA_R, BOSS_R } from './config.js';

// =====================================================================
// ギミック3：スリースターズ（属性の塔 × 3セット + 二択のカタストロフ）
// =====================================================================
const CELES = (() => {
  // 時計回りに 火（ファイガ）→雷（サンダガ）→氷（ブリザガ） の3本ずつ（北から20°、40°刻み、半径10）
  const EL = [
    { name:'火', spell:'ファイガ', color:'#ff6a3a', icon:['..x..','.xx..','.xxx.','xxxxx','.xxx.'] },
    { name:'雷', spell:'サンダガ', color:'#c08cff', icon:['..xx.','.xx..','xxxx.','..xx.','.xx..'] },
    { name:'氷', spell:'ブリザガ', color:'#6ad8ff', icon:['x.x.x','.xxx.','xxxxx','.xxx.','x.x.x'] },
  ];
  const RING = 10, SOAK = 3, OFFSET = [1, 2, 0];
  const TOWER_ON = [6.1, 14.4, 20.6], RESOLVE = [14.18, 20.5, 26.34], OFF = [14.3, 20.6, 26.44];
  const CC_AT = [10.18, null, 22.34], CC_LEN = 4.0, DEBUFF_AT = 6.1, DEBUFF_LEN = 20;
  const towerPos = i => { const a = (20 + i * 40) * Math.PI / 180; return { x:Math.sin(a) * RING, z:-Math.cos(a) * RING }; };
  const TOWERS = Array.from({ length:9 }, (_, i) => ({ i, el:(i / 3) | 0, ...towerPos(i) }));
  // CC：quake=円（ボスから10y以内が危険）/ tornado=ドーナツ（10yより外が危険）
  const CC = { quake:{ name:'クエイク', color:'#e0a040', inner:true }, tornado:{ name:'トルネド', color:'#58e07a', inner:false } };
  return {
    id:'celes', name:'スリースターズ', sub:'属性の塔', view:24, start:{ x:0, z:4 },
    gen(){
      const debuff = opt.debuff === 'rand' ? pick([0, 0, 1, 1, 2, 2, -1, -1]) : Number(opt.debuff);
      const dbl = shuffle([0, 1, 2]);
      const active = [0, 1, 2].map(s => [0, 1, 2].flatMap(e => shuffle([0, 1, 2]).slice(0, e === dbl[s] ? 2 : 1).sort().map(sub => e * 3 + sub)));
      const cc = [pick(['quake','tornado']), null, pick(['quake','tornado'])];
      return { debuff, dbl, active, cc };
    },
    create(p){
      // その人が入る塔：デバフ持ちは属性をずらして（時計回り隣→さらに隣→自分の属性）、なしは2本ある属性のもう1本
      const target = [0, 1, 2].map(s => {
        const act = p.active[s];
        if (p.debuff < 0) return act.filter(i => TOWERS[i].el === p.dbl[s])[1];
        const el = (p.debuff + OFFSET[s]) % 3, mine = act.filter(i => TOWERS[i].el === el);
        return mine.length === 2 ? mine[opt.dbl === 'second' ? 1 : 0] : mine[0];
      });
      const done = [false, false, false], flash = [-9, -9, -9], towerMiss = [false, false, false];
      // 耐性低下デバフ：最初の1つ + 塔を踏むたびにその属性が20秒付く
      const debuffs = p.debuff < 0 ? [] : [{ el:p.debuff, from:DEBUFF_AT, until:DEBUFF_AT + DEBUFF_LEN }];
      const setAt = t => { for (let s = 2; s >= 0; s--) if (t >= TOWER_ON[s]) return s; return -1; };
      const casts: { name:string; start:number; len:number; color?:string }[] = [{ name:'スリースターズ', start:1.0, len:4.7 }];
      CC_AT.forEach((at, s) => { if (at != null) casts.push({ name:'二択のカタストロフ', start:at, len:CC_LEN, color:CC[p.cc[s]].color }); });
      const inTarget = (s, x, z) => { const tw = TOWERS[target[s]]; return (x - tw.x) ** 2 + (z - tw.z) ** 2 <= SOAK * SOAK; };
      const ccSafe = (s, x, z) => { const c = p.cc[s]; if (!c) return true; const d = Math.hypot(x, z); return CC[c].inner ? d > RING : d < RING; };
      return {
        end: OFF[2] + 1.2,
        casts,
        progress: t => `SET ${Math.max(0, setAt(t) + 1)}/3`,
        status(t){
          const on = debuffs.filter(d => t >= d.from && t < d.until).map(d => ({ art:['fireDown', 'thunderDown', 'iceDown'][d.el], name:`${EL[d.el].name}属性耐性低下`, sec:Math.ceil(d.until - t) }));
          return on;
        },
        tick(t){
          for (let s = 0; s < 3; s++){
            if (done[s] || t < RESOLVE[s]) continue;
            done[s] = true; flash[s] = t; sfx.big();
            // 演出：光った塔が属性ごとに弾ける（炎＝火柱、雷＝落雷、氷＝結晶）
            p.active[s].forEach(i => {
              const tw = TOWERS[i];
              if (tw.el === 0){ fxAdd('pillar', tw.x, tw.z, { r:SOAK, cols:FXC.fire, h:80, dur:.5 }); fxParts(10, tw.x, tw.z, { cols:FXC.fire, speed:5, up:12, life:.7, spread:SOAK }); }
              else if (tw.el === 1){ fxAdd('bolt', tw.x, tw.z, { cols:FXC.thunder, dur:.35, seed:i * 11, dx:(i % 3 - 1) * 20 }); fxAdd('burst', tw.x, tw.z, { r:SOAK, cols:FXC.thunder, dur:.4 }); }
              else { fxAdd('pillar', tw.x, tw.z, { r:SOAK, cols:FXC.ice, h:60, dur:.45 }); fxParts(12, tw.x, tw.z, { cols:FXC.ice, speed:7, up:8, life:.6, size:3, spread:SOAK }); }
            });
            // 二択のカタストロフ：トルネド（緑の渦が外側を回る）／クエイク（内側に岩が飛ぶ）
            if (p.cc[s] === 'tornado'){ fxAdd('swirl', 0, 0, { r:RING + 6, cols:FXC.wind, dur:.8 }); fxAdd('swirl', 0, 0, { r:RING + 3, cols:FXC.wind, dur:.8, spin:-1 }); fxFlash('#3ac860', .3, .2); }
            if (p.cc[s] === 'quake'){ fxParts(36, 0, 0, { cols:FXC.rock, speed:5, up:10, life:.8, size:3, spread:RING * 1.6 }); fxShake(4, .35); fxFlash('#b08850', .25, .2); }
            const { x, z } = S.player;
            const inTower = p.active[s].find(i => (x - TOWERS[i].x) ** 2 + (z - TOWERS[i].z) ** 2 <= SOAK * SOAK);
            if (inTower != null){
              debuffs.push({ el:TOWERS[inTower].el, from:t, until:t + DEBUFF_LEN });
              healerHit(s === 0 ? [147500, 162000, 180000][TOWERS[inTower].el] : 180000, s === 0 ? ['ファイガ', 'サンダガ', 'ブリザガ'][TOWERS[inTower].el] : '塔'); // 塔のダメージ（ファイガ／サンダガ／ブリザガ）
            }
            if (!inTarget(s, x, z)){ towerMiss[s] = true; hurt(inTower == null ? '塔に入っていない' : '担当と違う塔'); }
            else fxAdd('ring', x, z, { r:4, cols:['#ffffff', '#ffe070', '#ffffff'], dur:.4 }); // 踏めた
            if (!ccSafe(s, x, z)) hurt(`${CC[p.cc[s]].name}に被弾`); // 塔ミスとは別に数える
          }
        },
        safeActive: t => { const s = setAt(t); return s >= 0 && !done[s]; },
        safe(x, z, t){ const s = setAt(t); return inTarget(s, x, z) && (t < (CC_AT[s] ?? 99) || ccSafe(s, x, z)); },
        guide(t){
          const s = setAt(t); if (s < 0 || done[s]) return;
          const tw = TOWERS[target[s]];
          ring(px(tw.x), px(tw.z), Math.round((SOAK + .8) * PPY), P.white);
        },
        draw(t){
          if (t < DEBUFF_AT) return;
          const s = setAt(t), blink = (Math.floor(performance.now() / 160) & 1) === 0;
          const lit = s >= 0 && t < OFF[s] ? p.active[s] : [];
          TOWERS.forEach(tw => {
            const X = px(tw.x), Z = px(tw.z), R = Math.round(SOAK * PPY), c = EL[tw.el].color;
            if (lit.includes(tw.i)){
              alpha(.45, () => disc(X, Z, R, c));
              thickRing(X, Z, R, blink ? P.white : c, 2);
            } else {
              alpha(.5, () => ring(X, Z, R, c));
            }
            icon5(EL[tw.el].icon, X, Z, lit.includes(tw.i) ? P.white : c);
          });
          // 二択のカタストロフ：詠唱中はボスが色で光り、着弾時に範囲が出る
          for (let k = 0; k < 3; k++){
            const cc = p.cc[k]; if (!cc) continue;
            if (t >= CC_AT[k] && t < RESOLVE[k]) thickRing(C0, C0, BOSS_R * PPY + 3, blink ? CC[cc].color : P.white, 2);
            const dt = t - RESOLVE[k];
            if (dt >= 0 && dt < .5){
              const R = RING * PPY;
              alpha(.55 * (1 - dt / .5), () => CC[cc].inner ? disc(C0, C0, R, CC[cc].color) : donut(C0, C0, R, ARENA_R * PPY, CC[cc].color));
            }
          }
          towerMiss.forEach((m, k) => {
            const dt = t - RESOLVE[k]; if (!m || dt < 0 || dt > 1.6) return;
            const tw = TOWERS[target[k]], R = Math.round((SOAK + .8) * PPY);
            thickRing(px(tw.x), px(tw.z), R, blink ? P.hurt : P.white, 2);
          });
          flash.forEach((f, k) => { const dt = t - f; if (dt >= 0 && dt < .35) p.active[k].forEach(i => alpha(.7 * (1 - dt / .35), () => disc(px(TOWERS[i].x), px(TOWERS[i].z), Math.round(SOAK * PPY), P.white))); });
        },
      };
    }
  };
})();

export { CELES };
