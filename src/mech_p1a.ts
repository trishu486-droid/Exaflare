// @ts-nocheck
import { mySlot } from './jobs.js';
import { S, shuffle, pick } from './state.js';
import { sfx } from './audio.js';
import { FXC, fxAdd, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px, glyph } from './gfx.js';
import { makeP4Fx, drawRails } from './p4fx.js';
import { SLOTS, TH, DPS, isTH, dist, add, at, OFF, MARKERS, makeRoutes, stepBots, drawBot,
  BAND_C, quadOf, iceTell, thTell, iceHit, thHit, rollMystery, drawTell, thunderSegs, icePts, kefkaOrbs, spreadMark, stackMark, drawStatue, tether } from './p1lib.js';

// =====================================================================
// P1（ケフカ）：神々の像（1回目）〜 波動砲 〜 つぎつぎトラップ 〜 なぞなぞマジック（2回目）。docs/dmu/research-p1.md §2
// 時刻は cactbot のタイムライン −24 秒（24.8 秒の「中央へ」のあと）。立ち位置はヤーン速報の図から読んだもの
// ① 神々の像：タンヒラか DPS（4人）に像から線 → 波動弾で北の像から押される（距離は推定）
// ② なぞなぞマジック：ひろげるブリザガ（向かい合う扇2つ）＋めらめらファイガ（散開か頭割り）。真偽はケフカのまわりの玉
//    タンヒラは西、DPS は東。ブリザガの当たらない側（北か南）で、決まった形に散開／頭割り（形は北なら図のまま、南なら上下反転）
// ③ 波動砲：横一列（西から H2・H1・ST・MT・D1・D2・D3・D4）。像からタンヒラ2人・DPS2人へ直線。当たった所に塔 → 当たっていない同じロールの人が左から順に入る
// ④ つぎつぎトラップ：タンヒラ1人・DPS1人。持っている人は外（6.6）、ほかは内（3.2）で頭割り → 反対側へ 14 飛ばされる。デバフは同じ組の人に移る
// ⑤ なぞなぞマジック：ブリザガ＋サンダガ。飛ばされた所から近い安全な所へ
// =====================================================================
const T = { gravenCast:2.5, graven:5.2, mmMark:8.6, mm1Cast:8.7, pulse:11.1, ice1:13.4, fire1:14.3, cannonWarn:13.5, cannon:18.5, explosion:22.0,
  trapCast:17.6, trap1:20.6, trapHit:25.6, mm2Cast:25.0, mm2:29.7, end:31.2 };
const STATUE = { x:0, z:-44 }; // 神々の像（1回目）：北の外（Splatoon のスクリプトの座標）
const PULSE_KB = 6, KB_SPEED = 20, SPREAD_R = 5, STACK_R = 6, BEAM_HW = 2, TOWER_R = 2.5, TRAP_R = 6, TRAP_KB = 8; // トラップのノックバックはヤーンの図（2回目の沼に入る位置）から 8 と推定
// ② の形（ブリザガが南に当たる＝北が安全なとき。南が安全なら z を反転）。タンヒラは北西、DPS は南東が基本で、点対称
const SPREAD_N = { MT:{ x:-2, z:-9.5 }, H1:{ x:-11.3, z:-10 }, ST:{ x:-7.5, z:-1.8 }, H2:{ x:-17.5, z:-1.8 } };
const STACK_N = { T:{ x:-5, z:-5.5 } };
const LINEUP = { H2:-18, H1:-13.4, ST:-8.8, MT:-4.2, D1:4.2, D2:8.8, D3:13.4, D4:18 };
const PAIR_DPS = { MT:'D1', H1:'D3', ST:'D2', H2:'D4' }; // DPS は点対称の位置
const unit = (a, b) => { const d = dist(a, b) || 1; return { x:(b.x - a.x) / d, z:(b.z - a.z) / d }; };

const P1A = {
  id:'p1a', name:'神々の像（1回目）', sub:'', view:24, start:{ x:0, z:3 }, slots:true,
  gen(){
    const mm1 = rollMystery(), mm2 = rollMystery();
    const tetherTH = Math.random() < .5;
    const tgT = shuffle([...TH]).slice(0, 2), tgD = shuffle([...DPS]).slice(0, 2);
    return { me:mySlot(), mm1, mm2, tetherTH, cannon:[...tgT, ...tgD], trapT:pick(TH), trapD:pick(DPS), fireT:pick(TH), fireD:pick(DPS),
      pass:{ T:pick([0, 1, 2]), D:pick([0, 1, 2]) } };
  },
  create(p){
    const me = p.me, m1 = p.mm1, m2 = p.mm2;
    const tethered = k => isTH(k) === p.tetherTH;
    const shown1Stack = m1.fireTrue ? m1.fireStack : !m1.fireStack;
    // ---- ② ブリザガの安全な側：タンヒラ（西）は北西か南西、DPS（東）はその反対 ----
    const safeQ = [0, 1, 2, 3].filter(q => !(iceHitQ(q)));
    function iceHitQ(q){ return iceHit(m1, at(q * 90 + 45, 10)); }
    const thNorth = safeQ.includes(3); // 北西が安全ならタンヒラは北
    const flip = (q, north) => north ? q : { x:q.x, z:-q.z };
    const mirror = q => ({ x:-q.x, z:-q.z });
    const spread1 = k => isTH(k) ? flip(SPREAD_N[k], thNorth) : mirror(flip(SPREAD_N[Object.keys(PAIR_DPS).find(t => PAIR_DPS[t] === k)], thNorth));
    const stack1 = k => isTH(k) ? flip(STACK_N.T, thNorth) : mirror(flip(STACK_N.T, thNorth));
    const final1 = k => m1.fireStack ? add(stack1(k), OFF(k, .6)) : spread1(k);
    // ---- ① 波動弾：線の人は、押されたあと ② の場所の近くに着くように、先に北へずれて待つ ----
    const kbDir = q => unit(STATUE, q);
    const prePulse = k => {
      const f = final1(k); if (!tethered(k)) return f;
      const d = kbDir(f); let t = PULSE_KB;
      while (t > 0 && Math.hypot(f.x - d.x * t, f.z - d.z * t) > 18) t -= .25;
      return { x:f.x - d.x * t, z:f.z - d.z * t };
    };
    // ---- ③ 波動砲・塔 ----
    const isTarget = k => p.cannon.includes(k);
    const lineSpot = k => ({ x:LINEUP[k], z:0 });
    const towers = p.cannon.map(k => ({ k, ...lineSpot(k) }));
    const soakerOf = {}; // 塔に入る人 → 塔（同じロールで、ビームを受けていない人が西から順に）
    [TH, DPS].forEach(G => {
      const tg = G.filter(isTarget).sort((a, b) => LINEUP[a] - LINEUP[b]), sk = G.filter(k => !isTarget(k)).sort((a, b) => LINEUP[a] - LINEUP[b]);
      sk.forEach((k, i) => { soakerOf[k] = tg[i]; });
    });
    const towerSpot = k => isTarget(k) ? { x:LINEUP[k] * .55, z:3.4 } : lineSpot(soakerOf[k]);
    // ---- ④ つぎつぎトラップ ----
    const holderOf = k => isTH(k) ? p.trapT : p.trapD;
    const trapSpot = k => { const w = isTH(k) ? -1 : 1; return k === holderOf(k) ? { x:6.6 * w, z:0 } : add({ x:3.2 * w, z:0 }, OFF(k, .5)); };
    const landing = k => { const w = isTH(k) ? -1 : 1; return k === holderOf(k) ? { x:6.6 * w, z:0 } : { x:(3.2 - TRAP_KB) * w, z:0 }; };
    const nextHolder = G => { const others = G.filter(k => k !== holderOf(G[0])); return others[isTH(G[0]) ? p.pass.T : p.pass.D]; };
    const newT = nextHolder(TH), newD = nextHolder(DPS);
    // ---- ⑤ 安全な所（ブリザガの扇とサンダガの帯から 1.2 離れる）。飛ばされた所から一番近い所 ----
    const hit2 = q => iceHit(m2, q) || thHit(m2, q) || [-1.2, 1.2].some(dx => [-1.2, 1.2].some(dz => iceHit(m2, { x:q.x + dx, z:q.z + dz }) || thHit(m2, { x:q.x + dx, z:q.z + dz })));
    const nearestSafe = base => { for (let r = 0; r <= 16; r += .5) for (let a = 0; a < 360; a += 10){ const q = add(base, at(a, r)); if (Math.hypot(q.x, q.z) <= 18 && !hit2(q)) return q; if (r === 0) break; } return base; };
    const safe2 = {};
    SLOTS.forEach(k => { const L = landing(k); safe2[k] = add(nearestSafe({ x:L.x * .6, z:L.z }), k === holderOf(k) ? { x:0, z:0 } : OFF(k, .6)); });
    // ---- 道のり ----
    const startSpot = k => add({ x:isTH(k) ? -7 : 7, z:0 }, OFF(k, 1.2));
    const { spotAt, botGoal } = makeRoutes([
      { until:T.graven, spot:startSpot },
      { until:T.mm1Cast + .3, spot:startSpot },
      { until:T.pulse - .15, spot:prePulse },
      { until:T.ice1 - .2, spot:final1 },
      { until:T.fire1 + .15, spot:final1 },
      { until:T.cannon - .3, spot:lineSpot },
      { until:T.cannon + .1, spot:lineSpot },
      { until:T.explosion - .3, spot:towerSpot },
      { until:T.explosion + .1, spot:towerSpot },
      { until:T.trapHit - .2, spot:trapSpot },
      { until:T.trapHit + .9, spot:trapSpot },
      { until:T.mm2 - .2, spot:k => safe2[k] },
      { until:T.end + 9, spot:k => safe2[k] },
    ]);
    // ---- 人 ----
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...startSpot(k) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);
    const kb = {};
    bots.forEach(b => { b.lock = () => !!kb[b.k]; });
    const push = (k, from, d, t) => { const q = pos(k), to = { x:q.x + d.x, z:q.z + d.z }; kb[k] = { t0:t, from:{ x:q.x, z:q.z }, to, len:Math.hypot(d.x, d.z) / KB_SPEED }; if (k === me && Math.hypot(to.x, to.z) > 20) hurt('ノックバックで外へ落ちた'); };
    const tickKb = t => Object.keys(kb).forEach(k => { const s = kb[k], f = Math.min(1, (t - s.t0) / s.len), q = pos(k); q.x = s.from.x + (s.to.x - s.from.x) * f; q.z = s.from.z + (s.to.z - s.from.z) * f; if (f >= 1) delete kb[k]; });
    const vuln = new Set(); // 波動砲に当たった人（塔に入ると死ぬ）
    let beamShow = null;
    const efx = makeP4Fx();
    let lastT = 0;
    const fired = new Set();
    const events: [number, () => void][] = [
      [T.pulse, () => { SLOTS.filter(tethered).forEach(k => { const d = kbDir(pos(k)); push(k, STATUE, { x:d.x * PULSE_KB, z:d.z * PULSE_KB }, S.t); }); sfx.boom(); fxShake(3, .25); }],
      [T.ice1, () => { if (iceHit(m1, S.player)) hurt('ひろげるブリザガに当たった'); efx.add('ice', { pts:icePts(m1) }); sfx.boom(); }],
      [T.fire1, () => {
        const q = S.player;
        if (m1.fireStack){
          const mine = isTH(me) ? p.fireT : p.fireD, other = isTH(me) ? p.fireD : p.fireT;
          if (me !== mine && dist(q, pos(mine)) > STACK_R) hurt('めらめらファイガ：頭割りに入っていない');
          if (me !== other && dist(q, pos(other)) <= STACK_R) hurt('めらめらファイガ：もう一つの頭割りに入った');
          [p.fireT, p.fireD].forEach(k => efx.add('stack', { x:pos(k).x, z:pos(k).z }));
        } else {
          if (SLOTS.some(k => k !== me && dist(q, pos(k)) <= SPREAD_R)) hurt('めらめらファイガ：散開で近すぎた');
          SLOTS.forEach(k => efx.add('spread', { x:pos(k).x, z:pos(k).z }));
        }
        sfx.boom(); fxShake(2, .2);
      }],
      [T.cannon, () => {
        // 像から当たる人へまっすぐ（幅4）。途中の人にも当たる。当たった所に塔
        const beams = p.cannon.map(k => ({ k, a:{ ...STATUE }, d:unit(STATUE, pos(k)), at:{ x:pos(k).x, z:pos(k).z } }));
        towers.forEach((tw, i) => { tw.x = beams[i].at.x; tw.z = beams[i].at.z; });
        beams.forEach(b => SLOTS.forEach(k => {
          const q = pos(k), v = { x:q.x - b.a.x, z:q.z - b.a.z }, along = v.x * b.d.x + v.z * b.d.z, perp = Math.abs(v.x * b.d.z - v.z * b.d.x);
          if (along > 0 && perp <= BEAM_HW){ vuln.add(k); if (k === me && b.k !== me) hurt('波動砲（ほかの人へのビーム）に当たった'); }
        }));
        beamShow = { t:S.t, beams };
        sfx.big(); fxShake(4, .3);
      }],
      [T.explosion, () => {
        const inTower = q => towers.filter(tw => dist(q, tw) <= TOWER_R);
        const mine = inTower(S.player);
        if (vuln.has(me) && mine.length) hurt('波動砲を受けたのに塔に入った');
        if (!vuln.has(me) && !mine.length) hurt('塔に入っていない（ビームを受けていない人は塔へ）');
        towers.forEach(tw => { fxAdd('burst', tw.x, tw.z, { r:TOWER_R, cols:FXC.flare, dur:.5 }); fxParts(8, tw.x, tw.z, { cols:FXC.fire, speed:6, up:8, life:.5, spread:TOWER_R }); });
        sfx.boom(); fxShake(3, .25);
      }],
      [T.trapHit, () => {
        const holders = [p.trapT, p.trapD];
        const inT = holders.filter(h => h === me || dist(S.player, pos(h)) <= TRAP_R);
        if (!holders.includes(me)){
          if (inT.length >= 2) hurt('つぎつぎトラップの頭割りに2つ入った');
          else if (!inT.includes(holderOf(me))) hurt(`つぎつぎトラップ：自分の組（${isTH(me) ? '西のタンヒラ' : '東のDPS'}）の頭割りに入っていない`);
        } else if (holders.some(h => h !== me && dist(S.player, pos(h)) <= TRAP_R)) hurt('つぎつぎトラップ：もう一つの頭割りに入った');
        holders.forEach(h => {
          const c = { x:pos(h).x, z:pos(h).z };
          fxAdd('burst', c.x, c.z, { r:TRAP_R, cols:['#ff7ad8', '#ffe070', '#7ad8ff'], dur:.5 }); fxParts(14, c.x, c.z, { cols:['#ff7ad8', '#ffe070', '#7ad8ff', '#b07aff'], speed:8, up:6, life:.7, spread:3 });
          SLOTS.forEach(k => { if (k === h) return; const q = pos(k), d = dist(q, c); if (d > TRAP_R || d < .01) return; push(k, c, { x:(q.x - c.x) / d * TRAP_KB, z:(q.z - c.z) / d * TRAP_KB }, S.t); });
        });
        sfx.boom(); fxShake(3, .25);
      }],
      [T.mm2, () => {
        if (iceHit(m2, S.player)) hurt('ひろげるブリザガに当たった'); else if (thHit(m2, S.player)) hurt('もりもりサンダガに当たった');
        efx.add('thunder', { segs:thunderSegs(m2) }); efx.add('ice', { pts:icePts(m2) }); sfx.boom();
      }],
    ];
    events.sort((a, b) => a[0] - b[0]);
    const status = t => {
      const s = [];
      if ((me === p.trapT || me === p.trapD) && t >= T.trap1 && t < T.trapHit) s.push({ icon:'trap', name:'つぎつぎトラップ', sec:Math.ceil(T.trapHit - t) });
      if ((me === newT || me === newD) && t >= T.trapHit + .1) s.push({ icon:'trap', name:'つぎつぎトラップ（次は神々の像2回目）', sec:Math.ceil(T.trapHit + .1 + 68 - t) });
      return s;
    };
    const statueOnScreen = { x:0, z:-22.3 };
    return {
      bossR:6, markers:MARKERS, start:{ ...startSpot(me) }, intro:`あなたは ${me}`, end:T.end,
      casts:[
        { name:'神々の像', start:T.gravenCast, len:T.graven - T.gravenCast },
        { name:'なぞなぞマジック', start:T.mm1Cast, len:T.ice1 - T.mm1Cast },
        { name:'つぎつぎトラップ', start:T.trapCast, len:T.trap1 - T.trapCast },
        { name:'なぞなぞマジック', start:T.mm2Cast, len:T.mm2 - T.mm2Cast },
      ],
      progress: t => t < T.fire1 + .2 ? '神々の像・なぞなぞマジック' : t < T.explosion + .2 ? '波動砲・塔' : t < T.trapHit + .5 ? 'つぎつぎトラップ' : t < T.mm2 + .2 ? 'なぞなぞマジック' : '終了',
      lockMove: () => !!kb[me],
      tick(t){
        const dt = Math.max(0, t - lastT); lastT = t;
        stepBots(bots, botGoal, t, dt); tickKb(t);
        events.forEach(([et, fn], i) => { if (t >= et && !fired.has(i)){ fired.add(i); fn(); } });
      },
      status,
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      drawFloor(t){
        if (t >= T.mm1Cast && t < T.ice1) drawTell(m1, true, false);
        if (t >= T.mm2Cast && t < T.mm2){ drawTell(m2, true, true); drawRails(m2.thO, thTell(m2).map(i => BAND_C[i])); }
        // 塔
        if (t >= T.cannon && t < T.explosion) towers.forEach(tw => { const X = px(tw.x), Z = px(tw.z), R = Math.round(TOWER_R * PPY); alpha(.3, () => disc(X, Z, R, '#ff8a2a')); ring(X, Z, R, '#ffe070'); ring(X, Z, R - 2, '#ff8a2a'); });
      },
      draw(t){
        if (t >= T.gravenCast){
          if (t >= T.cannonWarn && t < T.cannon + .2){ const k = .5 + Math.sin(t * 8) * .3; alpha(k, () => { ring(px(0), px(statueOnScreen.z), 13, '#ff8a2a'); ring(px(0), px(statueOnScreen.z), 15, '#ffe070'); }); }
          drawStatue(statueOnScreen.x, statueOnScreen.z, { eye:'#ff6a3a' });
          if (t >= T.graven && t < T.pulse) SLOTS.filter(tethered).forEach(k => tether(statueOnScreen, pos(k), '#ffb84a'));
        }
        // 波動砲のビーム（0.6秒）
        if (beamShow && S.t - beamShow.t < .6){
          const k = 1 - (S.t - beamShow.t) / .6;
          beamShow.beams.forEach(b => { const far = { x:b.a.x + b.d.x * 80, z:b.a.z + b.d.z * 80 }, n = { x:-b.d.z, z:b.d.x };
            alpha(.6 * k, () => { for (let w = -BEAM_HW; w <= BEAM_HW; w += .5) line(px(b.a.x + n.x * w), px(b.a.z + n.z * w), px(far.x + n.x * w), px(far.z + n.z * w), w === 0 ? '#ffffff' : '#ff8a2a'); }); });
        }
        if (t >= T.mmMark && t < T.fire1){ kefkaOrbs(m1.iceTrue, null, m1.fireTrue); if (shown1Stack) [p.fireT, p.fireD].forEach(k => stackMark(pos(k))); else SLOTS.forEach(k => spreadMark(pos(k))); }
        if (t >= T.mm2Cast - .1 && t < T.mm2) kefkaOrbs(m2.iceTrue, m2.thTrue, null);
        // つぎつぎトラップを持っている人
        const trapHolders = t < T.trap1 ? [] : t < T.trapHit ? [p.trapT, p.trapD] : [newT, newD];
        trapHolders.forEach(k => { const q = pos(k), X = px(q.x), Z = px(q.z) - 14; [[-3, 0, '#ff7ad8'], [0, -2, '#ffe070'], [3, 1, '#7ad8ff'], [1, 2, '#b07aff']].forEach(([dx, dz, c]) => rect(X + dx, Z + dz, 2, 2, c)); });
        bots.forEach(drawBot);
        efx.draw();
      },
      _debug:{ p, towers, soakerOf, safe2, spotAt, pos, final1, prePulse },
      _botGoal:botGoal, _me:me, _lock:() => !!kb[me],
    };
  },
};

export { P1A };
