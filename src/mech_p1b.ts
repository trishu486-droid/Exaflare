// @ts-nocheck
import { mySlot } from './jobs.js';
import { S, shuffle, pick } from './state.js';
import { sfx } from './audio.js';
import { A, healerHit, hasInvuln, hasFull } from './action.js'; // ダメージの数字はユーザーの軽減表（P1_ケフカ）から
import { FXC, fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px, fillArena } from './gfx.js';
import { makeP4Fx } from './p4fx.js';
import { SLOTS, TH, DPS, isTH, dist, add, at, OFF, MARKERS, makeRoutes, stepBots, BOT_SPEED, drawBot,
  iceHit, rollMystery, drawTell, icePts, kefkaOrbs, statueScreenBg, towerRumble, TOWER_MOVE, statueLights, clearOutside, tether } from './p1lib.js';
import { arrowPlate, busterMark, puddle, TRAP_COLS, statuePt, topTether, topGlow, bigOrb, ruingaFx, RUINGA_DUR } from './p1lib.js';
import { R2_AT, HOW, NOGUARD, SHIRK_MISS, hateRun, hateTop as planTop, taker, guarded, tankHint, p1TankRole } from './tankplan.js';

// =====================================================================
// P1（ケフカ）：神々の像（2回目）〜 グラビガ 〜 つぎつぎトラップ（2回目）。docs/dmu/research-p1.md §3
// 時刻は cactbot のタイムライン −75 秒。立ち位置はヤーン速報の図から読んだもの
// ① 1つの像から全員に線（タンヒラと DPS で色が違う）。紫＝重力弾（真ん中へ）、黄＝岩石弾（散開）。2回目は線が入れ替わる
// ② 1回目：ひろげるブリザガ＋重力弾。全員で南に集まって頭割り（ブリザガの当たらない側に寄る）→ その場に沼（グラビガ）が残る
//    岩石弾の人は散開（沼と自分の岩（半径5）が重なるとワイプ）、重力弾の人は真ん中へ
// ③ ばりばりルインガ（タンク強攻撃2連：1発目ヘイト1位、2発目ヘイト2位）。この回（P1 で2回目のルインガ）は ST が無敵で2発とも受ける
//    （ユーザーの軽減表：0:16・0:19 は MT、1:37・1:40 は ST の列に無敵）。ST は1発目の前に挑発、MT は1発目のあとに挑発して ST を2位に（2026-10-14 ユーザーの指摘）
//    ＋半面（黄＝撲殺の神気で東が危ない／紫＝重力波で西が危ない）。ほかの人は中央の安全な側
// ④ 2回目：北で頭割り（沼は北にも）→ 散開は1回目の上下反転 → 半面
// ⑤ つぎつぎトラップ（2回目）：西タンヒラ・東DPS で頭割り＋ノックバック → タンヒラは北の沼、DPS は南の沼へ（持っている人は歩いて入る）
// 大きさ：沼・岩は半径5（Splatoon のスクリプト）、ノックバックは 8（推定）
// =====================================================================
const T = { gravenCast:2.3, graven:5.0, mmCast:7.4, ice:12.1, grav1:12.2, vit1:16.2, ruin1Cast:17.1, ruin1:22.1, ruin2:25.2, half1Tell:21.1, half1:26.1,
  grav2:30.8, vit2:34.8, half2Tell:34.4, half2:39.4, gravity:42.0, trapHit:43.0, soak:47.0, end:48.2 }; // グラビガ（沼の判定）はトラップの 4 秒後（ユーザーの軽減表：トラップ 1:58 → グラビガ 2:02。前は推定 2 秒後）
// 像は1つ（ユーザーの指摘 2026-10-14）。紫の線（重力弾）と黄の線（岩石弾）は同じ像の左と右から出る（左右ははっきり分ける。ユーザー）
// 半面の予兆の光も、危ない側（黄＝東・紫＝西）の像の端に出す
const PUDDLE_R = 5, ROCK_R = 5, KB_SPEED = 20, TRAP_R = 6, TRAP_KB = 14, CLEAVE_HALF = 45; // トラップのノックバックはゲームのデータの 14（2026-10-14。前は推定 8）
// 1回目の散開（沼が南）：岩石弾の人（4人）の位置。タンヒラなら MT・ST・H1・H2、DPS なら D1・D2・D3・D4 の順
const VIT_SPOTS = [{ x:-10.2, z:2.4 }, { x:10.2, z:2.4 }, { x:-12, z:13.5 }, { x:12, z:13.5 }]; // 沼の中心から 10 以上（岩5＋沼5）
const flipZ = q => ({ x:q.x, z:-q.z });

const P1B = {
  id:'p1b', name:'神々の像　第二楽章', sub:'', view:24, start:{ x:0, z:3 }, slots:true,
  gen(){
    return { me:mySlot(), mm:rollMystery(), gravTH:Math.random() < .5, half1East:Math.random() < .5, half2East:Math.random() < .5,
      trapT:pick(TH), trapD:pick(DPS), pass:{ T:pick([0, 1, 2]), D:pick([0, 1, 2]) } };
  },
  create(p){
    const me = p.me, mm = p.mm;
    // 1回目：p.gravTH ならタンヒラが重力弾（真ん中）、DPS が岩石弾（散開）。2回目は入れ替わる
    const isGrav = (k, round) => (isTH(k) === p.gravTH) === (round === 1);
    const vitIndex = k => (isTH(k) ? TH : DPS).indexOf(k);
    // ---- ① ブリザガの当たらない側（南東か南西）に寄って、南で頭割り ----
    const seSafe = !iceHit(mm, { x:5, z:5 });
    const stack1 = { x:seSafe ? 1.8 : -1.8, z:9.2 }, stack2 = { x:0, z:-9.2 };
    const puddles = [];
    // 散開・真ん中
    const after1 = k => isGrav(k, 1) ? add({ x:0, z:0 }, OFF(k, .8)) : VIT_SPOTS[vitIndex(k)];
    const after2 = k => isGrav(k, 2) ? add({ x:0, z:0 }, OFF(k, .8)) : flipZ(VIT_SPOTS[vitIndex(k)]);
    // ③ タンクは北（1回目の沼は南）、ほかは中央の安全な側
    const halfSafeX = east => east ? -1 : 1; // 東が危ない（黄）なら西へ
    // 受けるタンク（バフ回しの案で決まる。tankplan.ts）は北で2発とも受ける。相方はほかの人と一緒に中央の安全な側（扇の外）
    const R2 = taker('r2'), ruinSpot = k => k === R2[0] ? { x:halfSafeX(p.half1East) * 1.6, z:-6 } : add({ x:halfSafeX(p.half1East) * 3.2, z:3 }, OFF(k, .8));
    // ヘイト：バフ回しの案（tankplan.ts）。時刻は P1 通しの時刻に直して見る（第二楽章の 0 ＝ 51）
    const now = () => S.t - (p.off || 0); // このギミックの時刻（P1 通しでは p.off だけずれる）
    const toRun = st => st - (p.off || 0) + R2_AT;
    // 第二楽章だけのときは、始まる前（P1 通しの 51 より前）の自分の挑発・シャークは表のとおり
    const from = p.off ? -Infinity : R2_AT;
    const hateTop = t => planTop(t + R2_AT, me, toRun, from);
    const half2Spot = k => k === 'MT' || k === 'ST' ? add({ x:halfSafeX(p.half2East) * 3.2, z:0 }, OFF(k, .8)) : add({ x:halfSafeX(p.half2East) * 3.2, z:0 }, OFF(k, .8));
    // ⑤ つぎつぎトラップ（2回目）：タンヒラの組は西で北の沼へ、DPS は東で南の沼へ飛ぶ
    const holderOf = k => isTH(k) ? p.trapT : p.trapD;
    const trapSpot = k => {
      // 持っている人はマックスメレー（西／東 8.5）。ほかの人は持っている人の沼の側にくっつく（0.6〜1.1）→ 14 飛ばされて沼（タンヒラ北・DPS 南）に入る（2026-10-14 ユーザーの指摘）
      const h = holderOf(k), H = { x:isTH(k) ? -8.5 : 8.5, z:0 };
      if (k === h) return H;
      const tgt = isTH(k) ? stack2 : stack1, d = dist(H, tgt), u = { x:(tgt.x - H.x) / d, z:(tgt.z - H.z) / d };
      const i = (isTH(k) ? TH : DPS).filter(x => x !== h).indexOf(k);
      return add(H, { x:u.x * (.6 + .25 * i), z:u.z * (.6 + .25 * i) });
    };
    const soakSpot = k => add(isTH(k) ? stack2 : stack1, OFF(k, 1.2));
    const nextHolder = G => { const others = G.filter(k => k !== holderOf(G[0])); return others[isTH(G[0]) ? p.pass.T : p.pass.D]; };
    const newT = nextHolder(TH), newD = nextHolder(DPS);
    // ---- 道のり ----
    const startSpot = k => add({ x:0, z:3 }, at(SLOTS.indexOf(k) * 45, 2));
    // P1 通し：前の楽章との間（裁きの光・ハイパードライブ）は p.pre.spot の位置（ヘイト1位のタンクはケフカの正面、ほかは後ろ）。p.pre.until（この区切りの時刻）まで
    const spot0 = k => p.pre?.spot(k) ?? startSpot(k);
    const { spotAt, botGoal:routeGoal } = makeRoutes([
      ...(p.pre ? [{ until:p.pre.until, spot:spot0 }] : []),
      { until:T.graven, spot:startSpot },
      { until:T.mmCast + .5, spot:startSpot },
      { until:T.ice - .3, spot:k => add(stack1, OFF(k, .9)) },
      { until:T.grav1 + .2, spot:k => add(stack1, OFF(k, .9)) },
      { until:T.vit1 - .3, spot:after1 },
      { until:T.vit1 + .2, spot:after1 },
      { until:T.ruin1 - .3, spot:ruinSpot },
      { until:T.half1 + .2, spot:ruinSpot },
      { until:T.grav2 - .3, spot:k => add(stack2, OFF(k, .9)) },
      { until:T.grav2 + .2, spot:k => add(stack2, OFF(k, .9)) },
      { until:T.vit2 - .3, spot:after2 },
      { until:T.vit2 + .2, spot:after2 },
      { until:T.half2 - .3, spot:half2Spot },
      { until:T.half2 + .2, spot:half2Spot },
      { until:T.trapHit - .2, spot:trapSpot },
      { until:T.trapHit + .7, spot:trapSpot },
      { until:T.soak - .2, spot:soakSpot },
      { until:T.end + 9, spot:soakSpot },
    ]);
    // つぎつぎトラップで飛ばされた味方は、戻らずに着いた所で待ち、グラビガの直前に沼の位置へ歩く（2026-10-16 ユーザーの指摘）
    const landed = {};
    const botGoal = (k, t) => {
      const L = landed[k];
      if (L && t >= T.trapHit && t < T.soak - .2 - dist(L, soakSpot(k)) / BOT_SPEED - .05) return L;
      return routeGoal(k, t);
    };
    // ---- 人 ----
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...spot0(k) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);
    const kb = {};
    bots.forEach(b => { b.lock = () => !!kb[b.k]; });
    const tickKb = t => Object.keys(kb).forEach(k => { const s = kb[k], f = Math.min(1, (t - s.t0) / s.len), q = pos(k); q.x = s.from.x + (s.to.x - s.from.x) * f; q.z = s.from.z + (s.to.z - s.from.z) * f; if (f >= 1) delete kb[k]; });
    const inPuddle = q => puddles.some(c => dist(q, c) <= PUDDLE_R);
    let halfShow = null, cleaveShow = null;
    const efx = makeP4Fx();
    // 重力弾：重力弾の線の人（4人）の真ん中に頭割り。沼が残る
    const gravitas = round => {
      const G = SLOTS.filter(k => isGrav(k, round)), c = { x:G.reduce((s, k) => s + pos(k).x, 0) / 4, z:G.reduce((s, k) => s + pos(k).z, 0) / 4 };
      if (dist(S.player, c) > PUDDLE_R) hurt(`重力弾（${round}回目）の頭割りに入っていない`); else healerHit(210000, '重力弾');
      puddles.push(c);
      fxAdd('burst', c.x, c.z, { r:PUDDLE_R, cols:['#6a1ab8', '#c87aff', '#ffffff'], dur:.6 }); sfx.big(); fxShake(3, .25);
    };
    // 岩石弾：岩石弾の線の人のまわり半径5。ほかの人・沼に重なるとだめ
    const vitrophyre = round => {
      const V = SLOTS.filter(k => !isGrav(k, round));
      if (!isGrav(me, round)){
        healerHit(20000, '岩石弾');
        if (SLOTS.some(k => k !== me && dist(S.player, pos(k)) <= ROCK_R)) hurt('岩石弾：ほかの人に近すぎた');
        if (puddles.some(c => dist(S.player, c) < PUDDLE_R + ROCK_R)) hurt('岩石弾が重力弾の沼に重なった（ワイプ）');
      } else if (V.some(k => dist(S.player, pos(k)) <= ROCK_R)) hurt('岩石弾の人に近すぎた');
      V.forEach(k => { const q = pos(k); fxAdd('burst', q.x, q.z, { r:ROCK_R, cols:['#3a8aff', '#a8d8ff', '#ffffff'], dur:.5 }); fxParts(8, q.x, q.z, { cols:['#a8d8ff', '#ffffff'], speed:6, up:6, life:.5, spread:3 }); });
      sfx.boom(); fxShake(2, .2);
    };
    const halfRoom = east => {
      if (east ? S.player.x > 0 : S.player.x < 0) hurt(east ? '撲殺の神気（東の半面）に当たった' : '重力波（西の半面）に当たった');
      halfShow = { t:S.t, east }; sfx.big(); fxShake(3, .3);
    };
    const cleave = n => {
      // 2発とも、詠唱が始まった時のヘイト1位へ（詠唱中のスイッチでは変わらない。2026-10-31 ユーザー）
      const tank = hateTop(T.ruin1Cast);
      const tq = pos(tank), d = Math.hypot(tq.x, tq.z) || 1, u = { x:tq.x / d, z:tq.z / d };
      const inCone = q => { const r = Math.hypot(q.x, q.z); return r > .5 && (q.x * u.x + q.z * u.z) / r >= Math.cos(CLEAVE_HALF * Math.PI / 180); };
      if (me !== 'MT' && me !== 'ST' && inCone(S.player)) hurt('ばりばりルインガ（タンク強攻撃の扇）に当たった');
      if (me === 'MT' || me === 'ST'){
        const [who, how] = R2;
        if (me === who && tank !== me){ if (n === 1) hurt('ばりばりルインガを受けなかった（詠唱が始まる前に挑発して、ヘイト1位に）'); }
        else if (me === who && !guarded(how, hasInvuln, hasFull)) hurt(`ばりばりルインガ${n}発目を${NOGUARD[how]}なしで受けた`);
        else if (me !== who && tank === me){ if (n === 1) hurt(`ばりばりルインガを受けた（受けるのは ${who}。詠唱が始まる前に ${who} へスイッチ）`); }
        else if (me !== who && inCone(S.player) && dist(S.player, tq) > 3) hurt(`ばりばりルインガ：${who} の扇に入った`);
      }
      cleaveShow = { t:S.t, u }; sfx.big();
    };
    let lastT = null, shirkMiss = 0; // null：まだ動いていない（P1 通しでは負の時刻から動き出す）
    const fired = new Set();
    const events: [number, () => void][] = [
      // 神々の像の詠唱の手前で、塔が中段へ上る：ゴゴゴゴ（p1lib の towerRumble）
      [Math.max(0, TOWER_MOVE[2].from), () => towerRumble(2, fxShake, sfx)],
      [T.ice, () => { if (iceHit(mm, S.player)) hurt('ひろげるブリザガに当たった'); efx.add('ice', { pts:icePts(mm) }); sfx.boom(); }],
      [T.grav1, () => gravitas(1)],
      [T.vit1, () => vitrophyre(1)],
      [T.ruin1, () => cleave(1)],
      [T.ruin2, () => cleave(2)],
      [T.half1, () => halfRoom(p.half1East)],
      [T.grav2, () => gravitas(2)],
      [T.vit2, () => vitrophyre(2)],
      [T.half2, () => halfRoom(p.half2East)],
      [T.trapHit, () => {
        const holders = [p.trapT, p.trapD]; healerHit(165000, 'つぎつぎトラップ');
        const inT = holders.filter(h => h === me || dist(S.player, pos(h)) <= TRAP_R);
        if (!holders.includes(me)){
          if (inT.length >= 2) hurt('つぎつぎトラップの頭割りに2つ入った');
          else if (!inT.includes(holderOf(me))) hurt(`つぎつぎトラップ：自分の組（${isTH(me) ? '西のタンヒラ' : '東のDPS'}）の頭割りに入っていない`);
        }
        holders.forEach(h => {
          const c = { x:pos(h).x, z:pos(h).z };
          fxAdd('burst', c.x, c.z, { r:TRAP_R, cols:TRAP_COLS, dur:.5 }); fxParts(14, c.x, c.z, { cols:TRAP_COLS, speed:8, up:6, life:.7, spread:3 });
          SLOTS.forEach(k => { if (k === h) return; const q = pos(k), d = dist(q, c); if (d > TRAP_R || d < .01) return;
            const to = { x:q.x + (q.x - c.x) / d * TRAP_KB, z:q.z + (q.z - c.z) / d * TRAP_KB }; kb[k] = { t0:now(), from:{ x:q.x, z:q.z }, to, len:TRAP_KB / KB_SPEED }; if (k !== me) landed[k] = to;
            if (k === me && Math.hypot(to.x, to.z) > 20) hurt('ノックバックで外へ落ちた'); });
        });
        sfx.boom(); fxShake(3, .25);
      }],
      [T.soak, () => {
        // グラビガ：沼（8つ）を全部踏む。タンヒラは北、DPS は南
        const want = isTH(me) ? puddles[1] : puddles[0]; healerHit(65000, 'グラビガ');
        if (want && dist(S.player, want) > PUDDLE_R) hurt(`グラビガ：${isTH(me) ? '北' : '南'}の沼に入っていない`);
        puddles.forEach(c => fxAdd('burst', c.x, c.z, { r:PUDDLE_R, cols:['#8a8aff', '#ffffff'], dur:.5 }));
        sfx.boom();
      }],
    ];
    events.sort((a, b) => a[0] - b[0]);
    const status = t => {
      const s = [];
      if ((me === p.trapT || me === p.trapD) && t < T.trapHit) s.push({ icon:'trap', name:'つぎつぎトラップ', sec:Math.ceil(T.trapHit - t) });
      if ((me === newT || me === newD) && t >= T.trapHit + .1) s.push({ icon:'trap', name:'つぎつぎトラップ（次はずびずばテレポのあと）', sec:Math.ceil(T.trapHit + .1 + 49 - t) });
      return s;
    };
    const halfCol = east => east ? '#ffe040' : '#b05aff'; // 黄＝撲殺の神気（東が危ない）、紫＝重力波（西が危ない）
    return {
      // ヒーラーの HP の減り方は P4 と同じ（味方の軽減の分で 0.45 倍）
      bossR:6, bossArt:'kefka', markers:MARKERS, healEase: () => .45, start:{ ...startSpot(me) }, end:T.end,
      intro:me === R2[0] ? `あなたは ${me}（ルインガ2発：詠唱の前にヘイト1位で＋${HOW[R2[1]]}）` : me === 'MT' || me === 'ST' ? `あなたは ${me}（ルインガは ${R2[0]}。スイッチは挑発とシャークのセット）` : `あなたは ${me}`,
      tankRole: t => p1TankRole(toRun(t), me), // シャークの少し前だけ B がシャーク、無敵の回の前だけ Y が無敵
      tankHint: t => tankHint(toRun(t), me),
      enmity: t => ['MT', 'ST'].map(k => ({ k, top:k === hateTop(t), me:k === me })),
      casts:[
        { name:'神々の像', start:T.gravenCast, len:T.graven - T.gravenCast },
        { name:'ひろげるブリザガ', start:T.mmCast, len:T.ice - T.mmCast },
        { name:'ばりばりルインガ', start:T.ruin1Cast, len:T.ruin1 - T.ruin1Cast },
        { name:'グラビガ', start:T.gravity, len:T.soak - T.gravity }, // 詠唱は 42.0（cactbot）から、沼の判定（軽減表 2:02）まで
      ],
      progress: t => t < T.vit1 + .2 ? '神々の像（重力弾・岩石弾）' : t < T.half1 + .2 ? 'ばりばりルインガ・半面' : t < T.half2 + .2 ? '神々の像（2回目）' : t < T.soak + .2 ? 'つぎつぎトラップ・グラビガ' : '終了',
      lockMove: () => !!kb[me],
      tick(t){
        const dt = lastT == null ? 0 : Math.max(0, t - lastT); lastT = t;
        stepBots(bots, botGoal, t, dt); tickKb(t);
        // 相方に挑発されたのにシャークしなかった（P1 通しのときは通しの方で見る）
        if (!p.off && (me === 'MT' || me === 'ST')){ const m = hateRun(toRun(t), me, toRun, from).miss.length; if (m > shirkMiss){ shirkMiss = m; hurt(SHIRK_MISS); } }
        events.forEach(([et, fn], i) => { if (t >= et && !fired.has(i)){ fired.add(i); fn(); } });
      },
      status,
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      // 神々の像（第二楽章の段）は画面全体の背景に。フィールドの外を消して見せる（p1lib の statueScreenBg）
      screenBg: t => statueScreenBg(2, t),
      drawFloor(t){
        clearOutside();
        if (t >= T.mmCast && t < T.ice) drawTell(mm, true, false);
        // 沼（グラビガ）
        puddles.forEach(c => puddle(c, PUDDLE_R, t));
        // ばりばりルインガ：前へ飛ぶ白い扇の奥義（p1lib の ruingaFx）
        if (cleaveShow && S.t - cleaveShow.t < RUINGA_DUR) ruingaFx(cleaveShow.u, CLEAVE_HALF, S.t - cleaveShow.t);
        // 半面（着弾の光）
        if (halfShow && S.t - halfShow.t < .5) alpha(.5 * (1 - (S.t - halfShow.t) / .5), () => fillArena(z => halfShow.east ? [0, 99] : [-99, 0], halfCol(halfShow.east)));
      },
      draw(t){
        if (t >= T.gravenCast){
        }
        if (t >= T.mmCast - .1 && t < T.ice) kefkaOrbs(mm.iceTrue, null, null);
        bots.forEach(drawBot);
        efx.draw();
        // ばりばりルインガの詠唱中：ヘイト1位の頭上に強攻撃のマーカー（1発目の前だけ）
        if (t >= T.ruin1Cast && t < T.ruin1) busterMark(pos(hateTop(T.ruin1Cast)));
      },
      // 上の層：線はどれも黄色い細い線（実機）。出どころで見分ける：渦の柱の上の紫の光＝重力弾（沼を捨てる）、像の手の光＝岩石弾（岩を捨てる）
      // 重力弾の線は沼を捨てたら（重力弾の着弾で）消える（ユーザーの指摘 2026-10-14・15）
      drawTop(t, g){
        // 半面の予兆：像の横に濃い大きな光の球（重力波＝左に紫・撲殺の神気＝右に黄。ユーザーの画像 2026-10-15）
        [[T.half1Tell, T.half1, p.half1East], [T.half2Tell, T.half2, p.half2East]].forEach(([a, b, east]) => { if (t >= a && t < b) bigOrb(g, statuePt(2, t, east ? 'halfE' : 'halfW'), east ? 'yellow' : 'purple', (t - a) / (b - a)); });
        const round = t < T.vit1 + .1 ? 1 : t >= T.half1 && t < T.vit2 + .1 ? 2 : 0;
        if (!round || t < T.graven) return;
        const gravGone = t >= (round === 1 ? T.grav1 : T.grav2), gp = statuePt(2, t, 'grav'), rp = statuePt(2, t, 'rock');
        topGlow(g, gp, '#b05aff', 4); topGlow(g, rp, '#ffe070', 4);
        SLOTS.forEach(k => { const gr = isGrav(k, round); if (gr && gravGone) return; topTether(g, gr ? gp : rp, pos(k)); });
      },
      _debug:{ p, puddles, spotAt, pos },
      _botGoal:botGoal, _me:me, _lock:() => !!kb[me],
    };
  },
};

export { P1B };
