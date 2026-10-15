// @ts-nocheck
import { mySlot } from './jobs.js';
import { S, shuffle, pick } from './state.js';
import { sfx } from './audio.js';
import { healerHit } from './action.js'; // ダメージの数字はユーザーの軽減表（P1_ケフカ）から
import { FXC, fxAdd, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px, glyph } from './gfx.js';
import { makeP4Fx, drawRails } from './p4fx.js';
import { SLOTS, TH, DPS, isTH, roleOf, dist, add, at, OFF, MARKERS, WM, makeRoutes, stepBots, drawBot,
  BAND_C, thTell, thHits, thHit, rollMystery, drawTell, thunderSegs, kefkaOrbs, spreadMark, stackMark, statueScreenBg, towerRumble, TOWER_MOVE, statueLights, clearOutside, tether } from './p1lib.js';
import { arrowPlate, puddle, fillCone, TRAP_COLS, makeFireFx, statuePt, topTether, topGlow, gazeEye, topFieldFlash } from './p1lib.js';

// =====================================================================
// P1（ケフカ）：ずびずばテレポ 〜 神々の像（3回目）〜 なぞなぞマジック。docs/dmu/research-p1.md §4
// 時刻・大きさ・矢印の動きは AnoMech の再現シナリオ（実機のログから）。0 秒は AnoMech の開始（ずびずばテレポの詠唱は 1.59 秒）
// 処理（ヤーン速報の図）：矢印はマーカー1〜4の四角の角に、四隅で2×2ずつ置く。混乱した人は内側の角の矢印から入って、その隅を1周して外へ出る
//   同じ矢印：下＝北西（外の列）・左＝北東（外の行）・上＝南東（外の列）・右＝南西（外の行）。違う矢印：左上＝北西・上右＝北東・右下＝南東・下左＝南西（内側）
//   つぎつぎトラップは西タンヒラ・東DPS で頭割り＋ノックバック 14（持っている人は外のマックスメレー 8.5、ほかは内 6 → ケフカの反対側へ。2026-10-14 ユーザーの指摘と実機の画面）
//   線（混乱・睡眠）：近接は内側の角（MT 北西・ST 北東・D1 南西・D2 南東）、遠隔は四角の真ん中（D3 北西・D4 北東・H1 南西・H2 南東）。線は見なくてよい
//   なぞなぞマジック：散開＝近接はマーカー1〜4の内側（D1 1・D2 2・ST 3・MT 4）、遠隔は外周の東西南北（H1 南・H2 東・D3 西・D4 北）。頭割り＝タンヒラ 3・DPS 1
//   サンダガの帯に当たる人は、帯の外へずれる（遠隔は外周に沿って、近接は少し）
// 矢印：上に乗る（半径2に0.35秒）と矢印の向きへ 6 運ばれる（1秒）。使えるのは混乱している人だけ。混乱していない人が使う・余る・ぶつかる（4以内）と全滅
// =====================================================================
const T = { tpCast:1.59, tp:6.58, debuff:7.34, exp:[14.33, 17.32], live:[15.29, 18.32], gravenCast:15.67, graven:18.37, tether:19.41,
  trap:22.78, wills:28.46, confused:29.09, confusedEnd:35.09, gazeWind:31.61, mmMark:36.31, mmCast:36.41, thunder:41.40, gaze:41.49, fire:42.19, end:44.2 };
const ARROW_R = 2, ARROW_PUSH = 6, ARROW_BIND = 1, ARROW_DWELL = .35, ARROW_GRACE = 3, ARROW_LIFE = 18.687, ARROW_COLLIDE = 4;
const CHASE_SPEED = 6, AA_RANGE = 2, AA_DWELL = 1, POST_CARRY_WAIT = 2, KILL_WAIT = 1;
const TRAP_R = 6, TRAP_KB = 14, KB_SPEED = 20, SLEEP_R = 5, SPREAD_R = 5, STACK_R = 6;
const DVEC = { U:{ x:0, z:-1 }, R:{ x:1, z:0 }, D:{ x:0, z:1 }, L:{ x:-1, z:0 } }, CYC = ['U', 'R', 'D', 'L'], DIR_JA = { U:'上', D:'下', L:'左', R:'右' };
// 矢印の置き場所：マーカー1〜4（中心 (±9.3,±9.3)）の四角の角＝中心から 5.9 と 12.7。運ばれる 6 で次の矢印の上（0.8 手前）に着く
const IN = 5.9, OUT = 12.7;
const SAME = { D:[{ x:-OUT, z:-OUT }, { x:-OUT, z:-IN }], L:[{ x:OUT, z:-OUT }, { x:IN, z:-OUT }], U:[{ x:OUT, z:OUT }, { x:OUT, z:IN }], R:[{ x:-OUT, z:OUT }, { x:-IN, z:OUT }] };
const DIFF = { LU:{ L:{ x:-IN, z:-OUT }, U:{ x:-IN, z:-IN } }, UR:{ U:{ x:OUT, z:-IN }, R:{ x:IN, z:-IN } },
  RD:{ R:{ x:IN, z:OUT }, D:{ x:IN, z:IN } }, DL:{ D:{ x:-OUT, z:IN }, L:{ x:-IN, z:IN } } };
const pairKey = (a, b) => ['LU', 'UR', 'RD', 'DL'].find(k => k.includes(a) && k.includes(b));
// 像（北のフィールドの外）：混乱の像は北西、睡眠の像は北東。視線は「？」の北西の像を見る（アヴェ・マリア）か、北東の像から目をそらす（惰眠の神気）
const CONF_STATUE = { x:-5, z:-75 }, SLEEP_STATUE = { x:7, z:-57 }, GAZE_INV = { x:-5, z:-75 }, GAZE_NORM = { x:5.25, z:-66 };
// 線（混乱・睡眠）の位置：同じ隅の近接と遠隔が組（混乱した人は一番近い人＝組の相手へ歩き、間にある入口の矢印に乗る）
const MI = 4.2, RI = 9.3;
const TETHER = { MT:{ x:-MI, z:-MI }, ST:{ x:MI, z:-MI }, D1:{ x:-MI, z:MI }, D2:{ x:MI, z:MI }, D3:{ x:-RI, z:-RI }, D4:{ x:RI, z:-RI }, H1:{ x:-RI, z:RI }, H2:{ x:RI, z:RI } };
const FINAL_SPREAD = { D1:{ x:-7.3, z:-7.3 }, D2:{ x:7.3, z:-7.3 }, ST:{ x:7.3, z:7.3 }, MT:{ x:-7.3, z:7.3 }, H1:{ x:0, z:18.5 }, H2:{ x:18.5, z:0 }, D3:{ x:-18.5, z:0 }, D4:{ x:0, z:-18.5 } };
const FINAL_STACK = { T:{ x:6.5, z:6.5 }, D:{ x:-7.5, z:-7.5 } };

const P1C = {
  id:'p1c', name:'神々の像　第三楽章', sub:'', view:24, start:{ x:0, z:3 }, slots:true,
  gen(){
    const dpsDiff = Math.random() < .5;
    const matching = dpsDiff ? TH : DPS, different = dpsDiff ? DPS : TH;
    const md = shuffle(['U', 'R', 'D', 'L']), cr = shuffle([...different]), deb = {};
    matching.forEach((k, i) => { deb[k] = { a:md[i], b:md[i], same:true, first7:true }; });
    cr.forEach((k, i) => { deb[k] = { a:CYC[i], b:CYC[(i + 1) % 4], same:false, first7:Math.random() < .5 }; });
    return { me:mySlot(), deb, dpsConf:Math.random() < .5, trapT:pick(TH), trapD:pick(DPS), gazeInv:Math.random() < .5, mm:rollMystery(), fireT:pick(TH), fireD:pick(DPS) };
  },
  create(p){
    const me = p.me, mm = p.mm;
    const isConf = k => p.dpsConf ? !isTH(k) : isTH(k);
    const shownStack = mm.fireTrue ? mm.fireStack : !mm.fireStack;
    // ---- 矢印の置き場所：7秒で切れる方が先 ----
    const arrowPlan = k => {
      const d = p.deb[k];
      const spots = d.same ? SAME[d.a] : [DIFF[pairKey(d.a, d.b)][d.a], DIFF[pairKey(d.a, d.b)][d.b]];
      const dirs = [d.a, d.b];
      return d.first7 ? { spots, dirs } : { spots:[spots[1], spots[0]], dirs:[dirs[1], dirs[0]] };
    };
    const PLAN = Object.fromEntries(SLOTS.map(k => [k, arrowPlan(k)]));
    // ---- つぎつぎトラップ：西タンヒラ・東DPS。持っている人は外側、ほかは中心側に寄って頭割り → 反対側へ 14 飛ばされる ----
    const holderOf = k => isTH(k) ? p.trapT : p.trapD;
    const trapSpot = k => { const w = isTH(k) ? -1 : 1; return k === holderOf(k) ? { x:8.5 * w, z:0 } : add({ x:6 * w, z:0 }, OFF(k, .3)); }; // ほかの人は内 6 → 14 飛ばされてケフカの反対側の 8 へ（ユーザーの実機の画面：東 6 → 西 6 くらい）
    // ---- 線の位置へ：遠隔は四角の内側の辺の真ん中（矢印から 3.4）を通って四角の真ん中へ入る ----
    const isRangedSpot = k => Math.abs(TETHER[k].x) > 8;
    const gapIn = k => { const q = TETHER[k]; return isRangedSpot(k) ? { x:q.x, z:Math.sign(q.z) * 2.6 } : q; };
    // ---- 最後（なぞなぞマジック）：散開／頭割りの基本の位置から、本当のサンダガの帯を避けた一番近い所 ----
    const realBands = thHits(mm).map(i => BAND_C[i]);
    const inReal = q => realBands.some(c => Math.abs((mm.thO * q.x + q.z) / Math.SQRT2 - c) <= 5.8);
    const nearestSafe = (base, ok = q => true) => {
      let best = null, bd = 1e9;
      for (let r = 0; r <= 9; r += .25) for (let a = 0; a < 360; a += 10){
        const q = add(base, at(a, r)); if (Math.hypot(q.x, q.z) > 18.8 || inReal(q) || !ok(q)) continue;
        const d = dist(q, base); if (d < bd){ bd = d; best = q; }
        if (r === 0) break;
      }
      return best || base;
    };
    const FINAL = {};
    if (mm.fireStack){
      const sT = nearestSafe(FINAL_STACK.T, q => Math.hypot(q.x, q.z) > 2), sD = nearestSafe(FINAL_STACK.D, q => dist(q, sT) > STACK_R * 2 + 1);
      SLOTS.forEach(k => { FINAL[k] = add(isTH(k) ? sT : sD, OFF(k, .8)); });
    } else {
      ['D1', 'D2', 'ST', 'MT', 'H1', 'H2', 'D3', 'D4'].forEach(k => { FINAL[k] = nearestSafe(FINAL_SPREAD[k], q => Object.values(FINAL).every(o => dist(q, o) > SPREAD_R + 1.2)); });
    }
    // ---- 道のり（期限＝その場所に着いている時刻） ----
    const startSpot = k => add({ x:0, z:3 }, at(SLOTS.indexOf(k) * 45, 2));
    // 矢印の置き場所から出るとき：その隅の四角の真ん中 → 内側の辺の真ん中（どちらも矢印から 3.4 以上）を通る
    const sgn = v => v < 0 ? -1 : 1;
    const blockMid = q => ({ x:sgn(q.x) * RI, z:sgn(q.z) * RI });
    const blockGate = q => ({ x:sgn(q.x) * RI, z:sgn(q.z) * 2.6 });
    // 線の位置へ：近接は横の軸（z＝0）を通って角へ、遠隔は内側の辺の真ん中から四角の真ん中へ
    const hub = k => isRangedSpot(k) ? gapIn(k) : { x:TETHER[k].x, z:0 };
    // P1 通し：前の楽章との間（裁きの光・ハイパードライブ）は p.pre.spot の位置（ヘイト1位のタンクはケフカの正面、ほかは後ろ）。p.pre.until（この区切りの時刻）まで
    const spot0 = k => p.pre?.spot(k) ?? startSpot(k);
    const { spotAt, botGoal } = makeRoutes([
      ...(p.pre ? [{ until:p.pre.until, spot:spot0 }] : []),
      { until:T.debuff + .3, spot:startSpot },
      { until:T.exp[0] - .3, spot:k => PLAN[k].spots[0] },
      { until:T.exp[0] + .2, spot:k => PLAN[k].spots[0] },   // 矢印が置かれるまで動かない
      { until:T.exp[1] - .3, spot:k => PLAN[k].spots[1] },
      { until:T.exp[1] + .2, spot:k => PLAN[k].spots[1] },
      { until:T.exp[1] + 1.3, spot:k => blockMid(PLAN[k].spots[1]) },  // 1回目の矢印が使えるようになる（18.3 秒）前に、矢印のない所へ
      { until:T.exp[1] + 2.6, spot:k => blockGate(PLAN[k].spots[1]) },
      { until:T.trap, spot:trapSpot },
      { until:T.wills - 1.3, spot:hub },                        // DPS は西へ、タンヒラは東へ飛ばされるので、反対側の隅へ行く人は遠い
      { until:T.wills - .2, spot:k => TETHER[k] },
      { until:T.confusedEnd + .3, spot:k => TETHER[k] },     // 混乱・睡眠の間は動けない（下の lock）
      { until:T.thunder - .1, spot:k => FINAL[k] },
      { until:T.end + 9, spot:k => FINAL[k] },
    ]);
    // ---- 人（味方7人＋自分） ----
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...spot0(k) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);
    const st = Object.fromEntries(SLOTS.map(k => [k, { carry:null, wait:0, aa:0, aaTarget:null, kb:null, dead:false }]));
    const locked = (k, t) => { const s = st[k]; return !!s.carry || !!s.kb || (t >= T.confused && t < T.confusedEnd) || s.dead; };
    bots.forEach(b => { b.lock = t => locked(b.k, t); });
    // ---- 矢印 ----
    const arrows = []; // { x, z, dir, spawn, live, used, gone, by, dwell:{} }
    let placed = 0, soaked = 0, soakFail = [], judged = false;
    const fail = why => { if (!soakFail.includes(why)) soakFail.push(why); };
    const placeArrows = w => SLOTS.forEach(k => { const q = pos(k), d = PLAN[k].dirs[w]; arrows.push({ x:q.x, z:q.z, dir:d, spawn:T.live[w], by:k, dwell:{}, gone:false }); placed++;
      fxAdd('burst', q.x, q.z, { r:2.2, cols:['#8a3ad8', '#c87aff', '#ffffff'], dur:.5 }); });
    const liveArrows = t => arrows.filter(a => !a.gone && t >= a.spawn);
    const carryTo = (k, a, t) => { const q = pos(k), v = DVEC[a.dir]; st[k].carry = { t0:t, from:{ x:q.x, z:q.z }, to:{ x:a.x + v.x * ARROW_PUSH, z:a.z + v.z * ARROW_PUSH } }; sfx.blip(880, .05); };
    const tickArrows = (t, dt) => {
      // ぶつかった矢印は両方消える
      const live = liveArrows(t);
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++){
        const a = live[i], b = live[j]; if (a.gone || b.gone) continue;
        if (dist(a, b) <= ARROW_COLLIDE){ a.gone = b.gone = true; fail('矢印どうしが近すぎて消えた（4以内）'); fxAdd('burst', a.x, a.z, { r:2, cols:FXC.flare, dur:.4 }); }
      }
      liveArrows(t).forEach(a => {
        if (t >= a.spawn + ARROW_LIFE){ a.gone = true; fail('使われない矢印が残った'); return; }
        if (t < a.spawn + ARROW_GRACE) return;
        for (const k of SLOTS){
          if (st[k].dead) continue;
          const q = pos(k);
          if (dist(q, a) > ARROW_R){ delete a.dwell[k]; continue; }
          a.dwell[k] = (a.dwell[k] || 0) + dt;
          if (a.dwell[k] < ARROW_DWELL || st[k].carry) continue;
          const conf = isConf(k) && t >= T.confused && t < T.confusedEnd;
          if (conf) soaked++; else fail(k === me ? '混乱していないのに矢印に乗った' : `混乱していない ${k} が矢印に乗った`);
          if (k === me && !conf) hurt('混乱していないのに矢印に乗った（全滅）');
          a.gone = true; carryTo(k, a, t);
          break;
        }
      });
    };
    // ---- 混乱：一番近い人へ歩く（6/秒）。2 以内に 1 秒いると攻撃する ----
    const others = k => SLOTS.filter(o => o !== k && !st[o].dead);
    const tickConfused = (t, dt) => {
      SLOTS.forEach(k => {
        const s = st[k]; if (s.dead) return;
        if (s.carry){
          const f = Math.min(1, (t - s.carry.t0) / ARROW_BIND), q = pos(k);
          q.x = s.carry.from.x + (s.carry.to.x - s.carry.from.x) * f; q.z = s.carry.from.z + (s.carry.to.z - s.carry.from.z) * f;
          if (f >= 1){ s.carry = null; s.wait = POST_CARRY_WAIT; }
          return;
        }
        if (!(isConf(k) && t >= T.confused && t < T.confusedEnd)) return;
        if (s.wait > 0){ s.wait -= dt; return; }
        const q = pos(k), near = others(k).map(o => ({ o, d:dist(q, pos(o)) })).sort((a, b) => a.d - b.d)[0]; if (!near) return;
        if (near.o !== s.aaTarget){ s.aaTarget = near.o; s.aa = 0; }
        if (near.d <= AA_RANGE){
          s.aa += dt; if (s.aa < AA_DWELL) return;
          s.aa = 0; s.wait = KILL_WAIT;
          if (near.o === me) hurt('混乱した味方に攻撃された（矢印に運ばれなかった）');
          else if (k === me) hurt('混乱中に味方を攻撃した（矢印に乗れなかった）');
          else fail(`混乱した ${k} が ${near.o} を攻撃した`);
          return;
        }
        const g = pos(near.o), d = near.d, m = Math.min(d, CHASE_SPEED * dt);
        q.x += (g.x - q.x) / d * m; q.z += (g.z - q.z) / d * m;
        if (k === me){ S.face = { x:(g.x - q.x) / d, z:(g.z - q.z) / d }; }
      });
    };
    // ---- つぎつぎトラップ（頭割り＋ノックバック） ----
    const tickKb = (t) => SLOTS.forEach(k => {
      const s = st[k]; if (!s.kb) return;
      const f = Math.min(1, (t - s.kb.t0) / s.kb.len), q = pos(k);
      q.x = s.kb.from.x + (s.kb.to.x - s.kb.from.x) * f; q.z = s.kb.from.z + (s.kb.to.z - s.kb.from.z) * f;
      if (f >= 1) s.kb = null;
    });
    const resolveTrap = t => {
      const holders = [p.trapT, p.trapD]; healerHit(65000, 'つぎつぎトラップ');
      const inT = holders.filter(h => dist(S.player, pos(h)) <= TRAP_R || h === me);
      if (me !== p.trapT && me !== p.trapD){
        if (inT.length >= 2) hurt('つぎつぎトラップの頭割りに2つ入った');
        else if (!inT.includes(holderOf(me))) hurt(`つぎつぎトラップ：自分の組（${isTH(me) ? '西のタンヒラ' : '東のDPS'}）の頭割りに入っていない`);
      } else if (holders.some(h => h !== me && dist(S.player, pos(h)) <= TRAP_R)) hurt('つぎつぎトラップ：もう一つの頭割りに入った');
      holders.forEach(h => {
        const c = { x:pos(h).x, z:pos(h).z };
        fxAdd('burst', c.x, c.z, { r:TRAP_R, cols:TRAP_COLS, dur:.5 }); fxParts(14, c.x, c.z, { cols:TRAP_COLS, speed:8, up:6, life:.7, spread:3 });
        SLOTS.forEach(k => {
          if (k === h) return; const q = pos(k), d = dist(q, c); if (d > TRAP_R || d < .01) return;
          const to = { x:q.x + (q.x - c.x) / d * TRAP_KB, z:q.z + (q.z - c.z) / d * TRAP_KB };
          st[k].kb = { t0:t, from:{ x:q.x, z:q.z }, to, len:TRAP_KB / KB_SPEED };
          if (k === me && Math.hypot(to.x, to.z) > 20) hurt('つぎつぎトラップのノックバックで外へ落ちた');
        });
      });
      sfx.boom(); fxShake(3, .25);
    };
    // ---- 判定の予定 ----
    const efx = makeP4Fx();
    const ffx = makeFireFx(); // めらめらファイガの着弾（実機に合わせた炎）
    let lastT = null; // null：まだ動いていない（P1 通しでは負の時刻から動き出す）
    const fired = new Set();
    const events: [number, () => void][] = [
      // 神々の像の詠唱の手前で、塔が上段へ上る：ゴゴゴゴ（p1lib の towerRumble）
      [Math.max(0, TOWER_MOVE[3].from), () => towerRumble(3, fxShake, sfx)],
      [T.exp[0], () => { placeArrows(0); sfx.blip(520, .08); }],
      [T.exp[1], () => { placeArrows(1); sfx.blip(520, .08); }],
      [T.trap, () => resolveTrap(S.t - (p.off || 0))], // P1 通しでは p.off だけずれる
      [T.wills, () => {
        healerHit(220000, isConf(me) ? '聖母の神気' : '睡魔の神気');
        // 睡魔の神気（睡眠の人のまわり半径5）→ 聖母の神気（混乱）。混乱の人が睡眠の範囲にいると死ぬ。睡眠どうしも重ならない
        SLOTS.filter(k => !isConf(k) && k !== me).forEach(k => { if (dist(S.player, pos(k)) <= SLEEP_R) hurt(isConf(me) ? '睡魔の神気（睡眠の人のまわり）に入ったまま聖母の神気を受けた' : '睡魔の神気（睡眠の人のまわり）が重なった'); });
        SLOTS.forEach(k => fxAdd('burst', pos(k).x, pos(k).z, { r:isConf(k) ? 2 : SLEEP_R, cols:isConf(k) ? ['#ff7ad8', '#ffffff'] : ['#7ab8ff', '#ffffff'], dur:.5 }));
        sfx.boom();
      }],
      [T.confused, () => { sfx.blip(300, .2); }],
      [T.confusedEnd, () => {
        judged = true;
        const left = arrows.filter(a => !a.gone).length;
        if (left) fail(`使われない矢印が ${left} 個残った`);
        if (soakFail.length && S.failAt == null) hurt(`矢印の処理に失敗（${soakFail[0]}）→ 裁きの光で全滅`);
      }],
      [T.thunder, () => {
        if (thHit(mm, S.player)) hurt('もりもりサンダガに当たった');
        efx.add('thunder', { segs:thunderSegs(mm) }); sfx.boom();
      }],
      [T.gaze, () => {
        const src = p.gazeInv ? GAZE_INV : GAZE_NORM, q = S.player, f = S.face || { x:0, z:-1 }, d = dist(q, src);
        const cos = ((src.x - q.x) * f.x + (src.z - q.z) * f.z) / d; // 像の方を向いているほど 1
        if (p.gazeInv && cos < Math.SQRT1_2) hurt('アヴェ・マリア（？の像）を見ていなかった');
        if (!p.gazeInv && cos >= Math.SQRT1_2) hurt('惰眠の神気：像を見てしまった');
      }],
      [T.fire, () => {
        const q = S.player; healerHit(220000, 'めらめらファイガ');
        if (mm.fireStack){
          const mine = isTH(me) ? p.fireT : p.fireD, other = isTH(me) ? p.fireD : p.fireT;
          if (me !== mine && dist(q, pos(mine)) > STACK_R) hurt('めらめらファイガ：頭割りに入っていない');
          if (dist(q, pos(other)) <= STACK_R && me !== other) hurt('めらめらファイガ：もう一つの頭割りに入った');
          [p.fireT, p.fireD].forEach(k => ffx.add(pos(k).x, pos(k).z, STACK_R));
        } else {
          if (SLOTS.some(k => k !== me && dist(q, pos(k)) <= SPREAD_R)) hurt('めらめらファイガ：散開で近すぎた');
          SLOTS.forEach(k => ffx.add(pos(k).x, pos(k).z, SPREAD_R));
        }
        sfx.boom(); fxShake(2, .2);
      }],
    ];
    events.sort((a, b) => a[0] - b[0]);
    // ---- デバフ（自分） ----
    const myPlan = PLAN[me];
    const status = t => {
      const s = [];
      if (t >= T.debuff && t < T.exp[0]) s.push({ icon:'tele_' + myPlan.dirs[0].toLowerCase(), name:`ずびずばテレポ（${DIR_JA[myPlan.dirs[0]]}）`, sec:Math.ceil(T.exp[0] - t), art:1 });
      if (t >= T.debuff && t < T.exp[1]) s.push({ icon:'tele_' + myPlan.dirs[1].toLowerCase(), name:`ずびずばテレポ（${DIR_JA[myPlan.dirs[1]]}）`, sec:Math.ceil(T.exp[1] - t), art:1 });
      if ((me === p.trapT || me === p.trapD) && t < T.trap) s.push({ icon:'trap', name:'つぎつぎトラップ', sec:Math.ceil(T.trap - t), art:1 });
      if (t >= T.confused && t < T.confusedEnd) s.push({ icon:isConf(me) ? 'confused' : 'sleep', name:isConf(me) ? '混乱' : '睡眠', sec:Math.ceil(T.confusedEnd - t), art:1 });
      return s;
    };
    return {
      // ヒーラーの HP の減り方は P4 と同じ（味方の軽減の分で 0.45 倍）
      bossR:6, markers:MARKERS, healEase: () => .45, start:{ ...startSpot(me) }, intro:`あなたは ${me}`, end:T.end,
      casts:[
        { name:'ずびずばテレポ', start:T.tpCast, len:T.tp - T.tpCast },
        { name:'神々の像', start:T.gravenCast, len:T.graven - T.gravenCast },
        { name:'なぞなぞマジック', start:T.mmCast, len:4.7 },
      ],
      progress: t => t < T.exp[1] ? 'ずびずばテレポ' : t < T.trap ? 'つぎつぎトラップ' : t < T.confusedEnd ? '神々の像（混乱・睡眠）' : t < T.fire + .2 ? 'なぞなぞマジック' : '終了',
      lockMove: t => locked(me, t),
      tick(t){
        const dt = lastT == null ? 0 : Math.max(0, t - lastT); lastT = t;
        stepBots(bots, botGoal, t, dt);
        tickKb(t); tickConfused(t, dt); tickArrows(t, dt);
        events.forEach(([et, fn], i) => { if (t >= et && !fired.has(i)){ fired.add(i); fn(); } });
      },
      status,
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      // 神々の像（第三楽章の段）は画面全体の背景に。フィールドの外を消して見せる（p1lib の statueScreenBg）
      screenBg: t => statueScreenBg(3, t),
      drawFloor(t){
        clearOutside();
        // なぞなぞマジックの予兆（サンダガの帯）
        if (t >= T.mmCast && t < T.thunder){ drawTell(mm, false, true); drawRails(mm.thO, thTell(mm).map(i => BAND_C[i])); }
        // 矢印（床のテレポ）：暗い丸い台に金のふちと金の矢印（実機の動画）。使えるまでの間（3秒）は薄い
        arrows.forEach(a => {
          if (a.gone || t < a.spawn - .9) return;
          const X = px(a.x), Z = px(a.z), R = Math.round(ARROW_R * PPY), pending = t < a.spawn, grace = t < a.spawn + ARROW_GRACE;
          alpha(pending ? .35 : grace ? .6 : 1, () => arrowPlate(X, Z, R + 2, DVEC[a.dir]));
        });
      },
      draw(t){
        // 像・線・視線の目は上の層（drawTop）
        // ケフカの真偽の玉（サンダガ・ファイガ）と頭上のマーカー
        if (t >= T.mmMark && t < T.fire){
          kefkaOrbs(null, mm.thTrue, mm.fireTrue);
          if (shownStack) [p.fireT, p.fireD].forEach(k => stackMark(pos(k), Math.ceil(T.fire - t))); else SLOTS.forEach(k => spreadMark(pos(k)));
        }
        // 睡眠の印（混乱の頭上の印は出さない。ユーザー 2026-10-15）
        if (t >= T.confused && t < T.confusedEnd) SLOTS.forEach(k => { const q = pos(k), X = px(q.x), Z = px(q.z) - 12; if (!isConf(k)) glyph('Z', X, Z, '#7ab8ff'); });
        bots.forEach(drawBot);
        efx.draw(); ffx.draw();
      },
      // 上の層：線はどれも黄色い細い線（実機）。出どころで見分ける：男の像の胸の桃色の光＝睡眠（実機の動画）、女神の光＝混乱（色は推定）
      drawTop(t, g){
        // 視線：像に目が描かれる。見る（アヴェ・マリア）＝黄色の目に赤い「？」、見ない（惰眠の神気）＝紫の目。着弾でフィールドが黄／紫に光る（ユーザーの画像・動画 2026-10-15）
        if (t >= T.gazeWind && t < T.gaze + .2) gazeEye(g, statuePt(3, t, 'gaze'), p.gazeInv, (t - T.gazeWind) / (T.gaze - T.gazeWind));
        if (t >= T.gaze && t < T.gaze + .45) topFieldFlash(g, p.gazeInv ? '#ffe050' : '#a040ff', 1 - (t - T.gaze) / .45);
        if (t < T.tether || t >= T.wills) return;
        const cp = statuePt(3, t, 'conf'), sp = statuePt(3, t, 'sleep');
        topGlow(g, cp, '#fff0b0'); topGlow(g, sp, '#ff6ad8');
        SLOTS.forEach(k => topTether(g, isConf(k) ? cp : sp, pos(k)));
      },
      _debug:{ p, PLAN, FINAL, TETHER, arrows, st, pos, soak:() => ({ placed, soaked, soakFail }), isConf, bots, spotAt },
      // テスト用：自分を味方と同じに動かす（tools のテストから使う）
      _botGoal:botGoal, _me:me, _lock:t => locked(me, t),
      _face:() => { const src = p.gazeInv ? GAZE_INV : GAZE_NORM, q = S.player, d = dist(q, src) || 1, v = { x:(src.x - q.x) / d, z:(src.z - q.z) / d }; return p.gazeInv ? v : { x:-v.x, z:-v.z }; },
    };
  },
};

export { P1C };
