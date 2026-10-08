import { GCD, TARGET_DPS, mySlot } from './jobs.js';
import { S, shuffle, pick, logLine } from './state.js';
import { opt } from './store.js';
import { sfx } from './audio.js';
import { healerHit, isActing } from './action.js';
import { FXC, FXK, fxAdd, fxFlash, fxShake } from './fx.js';
import { P, PPY, alpha, ctx, disc, donut, fillArena, glyph, hurt, line, px, rect, ring } from './gfx.js';
import { bossSprite } from './p4boss.js';
import { makeP4Fx, drawRails, drawChaosGlow, drawFloodMarks, drawReleaseRings } from './p4fx.js';

// =====================================================================
// P4 通し「おちょくりソウル」（docs/dmu/research-p4.md）
// 時刻は「おちょくりソウル」の詠唱開始を 0 とした AnoMech の再現ログに合わせる
// ほぼ全部に本当／嘘が付く。青い玉＝本当、？の赤い玉＝嘘。前半でデバフと本当／嘘を覚え、後半で処理する
// 座標：x＝東、z＝南（北は -z）。方位（bearing）は北から時計回りの度
// =====================================================================
const P4 = (() => {
  const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
  const SUP = ['MT', 'ST', 'H1', 'H2'], DPS = ['D1', 'D2', 'D3', 'D4'];
  const grp = k => SUP.includes(k) ? 'TH' : 'D';
  const BOT_SPEED = 9, SPOT_TOL = 3, SPREAD_R = 6, STACK_R = 6, BAIT_R = 6, EDGE_HW = 2.5;
  const T = {
    mystery:[11.02, 25.94, 41.08], gc:[11.37, 26.30, 41.26], gcHit:[20.35, 35.20, 50.05],
    chaos:[16.51, 31.43], chaosHit:[25.35, 40.20], debuff1:20.36, debuff2:35.28, chaosDebuff:[27.28, 40.99], gc3Debuff:51.67,
    neoLeave:53.0, neoFlood:55.25, flood:57.39, floodHit:62.89, surge:66.34, charge:68.2, set1:71.3,
    thunder:74.45, gaze1:80.49, ultima:84.6, ultimaHit:88.9, fireLock:87.28, fireHit:92.36, blizzard:92.41,
    set2:96.4, release:103.63, releaseTell:110.63, gaze2:104.39, waterLock:109.98, waterHit:115.07, end:119.9,
  };
  const TELL = 5; // なぞなぞマジック等：予兆から着弾まで
  // ボスは外周の少し内側（中心から 17）に置いて、絵がフィールドからはみ出さないようにする
  const BOSS_RING = 17, NEO0 = { x:BOSS_RING * Math.SQRT1_2, z:-BOSS_RING * Math.SQRT1_2 }, CHAOS0 = { x:-BOSS_RING * Math.SQRT1_2, z:-BOSS_RING * Math.SQRT1_2 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const dirOf = b => ({ x:Math.sin(b * Math.PI / 180), z:-Math.cos(b * Math.PI / 180) });
  const at = (b, r) => { const d = dirOf(b); return { x:d.x * r, z:d.z * r }; };
  const bearing = p => (Math.atan2(p.x, -p.z) * 180 / Math.PI + 360) % 360;
  // ひろげるブリザガ：斜め4方向の扇（中心角90°）＝4つの象限。0=北東 1=南東 2=南西 3=北西
  const quadOf = p => Math.min(3, Math.floor(bearing(p) / 90));
  const quadSpan = q => z => (q === 0 || q === 3) ? (z <= 0 ? (q === 0 ? [0, 99] : [-99, 0]) : null) : (z >= 0 ? (q === 1 ? [0, 99] : [-99, 0]) : null);
  // もりもりサンダガ：幅10の平行な帯4本。s = (o·x + z)/√2 が帯の中心 15/5/-5/-15 から ±5
  const BAND_C = [15, 5, -5, -15];
  const bandS = (o, p) => (o * p.x + p.z) / Math.SQRT2;
  const bandSpan = (o, c) => z => { const lo = (c - 5) * Math.SQRT2 - z, hi = (c + 5) * Math.SQRT2 - z; return o > 0 ? [lo, hi] : [-hi, -lo]; };
  const inBand = (o, c, p) => Math.abs(bandS(o, p) - c) <= 5;
  // 半平面 a·x ≥ b（行ごとの x の範囲）
  const halfX = (a, b) => a > 1e-6 ? [b / a, 99] : a < -1e-6 ? [-99, b / a] : (b <= 0 ? [-99, 99] : null);
  const cross = (s1, s2) => (!s1 || !s2) ? null : (Math.max(s1[0], s2[0]) <= Math.min(s1[1], s2[1]) ? [Math.max(s1[0], s2[0]), Math.min(s1[1], s2[1])] : null);

  return {
    id:'p4', name:'P4 通し', sub:'おちょくりソウル', view:24, start:{ x:0, z:4 }, slots:true,
    gen(){
      // なぞなぞマジック5回分（0〜2：通常、3：ため（サンダガ74秒・ブリザガ92秒）、4：マジックアウト）
      const mystery = Array.from({ length:5 }, () => ({ iceTrue:Math.random() < .5, iceOff:pick([0, 1]), thTrue:Math.random() < .5, thOff:pick([0, 1]), thO:pick([1, -1]) }));
      const chaos = shuffle(['fire', 'water']).map(kind => ({ kind, truth:Math.random() < .5 }));
      // グランドクロス1：各ロール 4人に [短い加速度＋視線1, 長い加速度, フォークライトニング, 水属性圧縮]
      const w1 = [...shuffle([...SUP]), ...shuffle([...DPS])];
      // グランドクロス2：1回目の水雷の2人が加速度（＋視線2）、加速度の2人が水雷（ペアの中はランダム）
      const w2 = [w1[2], w1[3], w1[0], w1[1], w1[6], w1[7], w1[4], w1[5]];
      for (let i = 0; i < 4; i++) if (Math.random() < .5) [w2[2 * i], w2[2 * i + 1]] = [w2[2 * i + 1], w2[2 * i]];
      const w3 = [...shuffle([...SUP]), ...shuffle([...DPS])];
      return {
        me:mySlot(), mystery, chaos, w1, w2, w3, w1First:Math.random() < .5,
        gcTrue:[Math.random() < .5, Math.random() < .5, Math.random() < .5], floodTrue:Math.random() < .5,
        wound:Object.fromEntries(SLOTS.map(k => [k, Math.random() < .5 ? 'white' : 'black'])),
        neoDir:pick([0, 45, 90, 135, 180, 225, 270, 315]), leftColor:pick(['white', 'black']),
      };
    },
    create(p){
      const me = p.me, myGrp = grp(me);
      const fire = p.chaos.find(c => c.kind === 'fire'), water = p.chaos.find(c => c.kind === 'water');
      // ---- デバフ（1人ずつ）----
      const dbf: any = Object.fromEntries(SLOTS.map(k => [k, { bomb:null, elem:null, gaze:0 }]));
      const set1Gc = p.w1First ? 0 : 1; // 早い（1セット目の）水雷を付けたグランドクロス
      p.w1.forEach((k, i) => {
        const j = i % 4;
        if (j === 0){ dbf[k].bomb = { set:1, gc:0, until:T.debuff1 + 51 }; dbf[k].gaze = 1; dbf[k].gazeUntil = T.debuff1 + 60; }
        if (j === 1) dbf[k].bomb = { set:2, gc:0, until:T.debuff1 + 76 };
        if (j >= 2) dbf[k].elem = { type:j === 2 ? 'fork' : 'water', set:set1Gc === 0 ? 1 : 2, gc:0, until:T.debuff1 + (set1Gc === 0 ? 51 : 76) };
      });
      p.w2.forEach((k, i) => {
        const j = i % 4;
        if (j === 0){ dbf[k].bomb = { set:2, gc:1, until:T.debuff2 + 61 }; dbf[k].gaze = 2; dbf[k].gazeUntil = T.debuff2 + 69; }
        if (j === 1) dbf[k].bomb = { set:1, gc:1, until:T.debuff2 + 36 };
        if (j >= 2) dbf[k].elem = { type:j === 2 ? 'fork' : 'water', set:set1Gc === 1 ? 1 : 2, gc:1, until:T.debuff2 + (set1Gc === 1 ? 36 : 61) };
      });
      p.w3.forEach((k, i) => { dbf[k].field = i % 2 === 1; }); // 各ロール2人ずつアラガンフィールド、2人が死の超越
      const isSpread = (k, set) => { const e = dbf[k].elem; if (!e || e.set !== set) return false; const tr = p.gcTrue[e.gc]; return e.type === 'fork' ? tr : !tr; };
      const stackTarget = (k, set) => { const e = dbf[k].elem; return !!e && e.set === set && !isSpread(k, set); };
      const bombWord = gc => p.gcTrue[gc] ? '止まる' : '動く';
      const gazeHolders = n => SLOTS.filter(k => dbf[k].gaze === n);
      // ---- なぞなぞマジック ----
      const iceHits = m => [0, 1, 2, 3].filter(q => ((q + m.iceOff) % 2 === 0) === m.iceTrue); // 嘘なら予兆がない側
      const iceTell = m => [0, 1, 2, 3].filter(q => (q + m.iceOff) % 2 === 0);
      const thHits = m => [0, 1, 2, 3].filter(i => ((i + m.thOff) % 2 === 0) === m.thTrue);
      const thTell = m => [0, 1, 2, 3].filter(i => (i + m.thOff) % 2 === 0);
      // マジックアウト：表示される玉＝（ためた本当／嘘 と 実際）が同じなら本当。答え＝4番目の実際
      const charged = p.mystery[3], rel = p.mystery[4];
      const relShown = { ice:charged.iceTrue === rel.iceTrue, th:charged.thTrue === rel.thTrue };
      const hitByMystery = (m, q, ice = true, th = true) =>
        (ice && iceHits(m).includes(quadOf(q))) || (th && thHits(m).some(i => inBand(m.thO, BAND_C[i], q)));
      // 安地：危ない場所からの余裕（まわり16点がすべて安全な半径）が大きく、中央に近い点を探す
      const clearance = (bad, q) => { let c = 0; for (let rr = .3; rr <= 2.4; rr += .3){ for (let k = 0; k < 16; k++) if (bad({ x:q.x + Math.sin(k * Math.PI / 8) * rr, z:q.z + Math.cos(k * Math.PI / 8) * rr })) return c; c = rr; } return c; };
      const safeSpot = (bad, rMin = 2, rMax = 17, want = 1.8) => {
        let best = null, bestScore = -1;
        for (let r = rMin; r <= rMax; r += .5) for (let a = 0; a < 360; a += 5){
          const q = at(a, r); if (bad(q)) continue;
          const c = clearance(bad, q), score = Math.min(c, want) * 10 - r * .1;
          if (score > bestScore){ bestScore = score; best = q; }
        }
        return best || { x:0, z:0 };
      };
      const mysterySpots = [0, 1, 2].map(k => safeSpot(q => hitByMystery(p.mystery[k], q)));
      // ---- 無の氾濫：ネオエクスデスから見て左右。表示の色は、本当なら実際の色、嘘なら逆 ----
      const neo = at(p.neoDir, BOSS_RING), fwd = dirOf(p.neoDir + 180), right = dirOf(p.neoDir + 270); // ネオエクスデスが中央を向いたときの右
      const lat = q => q.x * right.x + q.z * right.z; // ＋＝ネオエクスデスから見て右
      const other = c => c === 'white' ? 'black' : 'white';
      const actualColor = side => side < 0 ? p.leftColor : other(p.leftColor);
      const shownColor = side => p.floodTrue ? actualColor(side) : other(actualColor(side));
      const needColor = k => dbf[k].field ? other(p.wound[k]) : p.wound[k];
      const floodSide = k => actualColor(-1) === needColor(k) ? -1 : 1;
      // ---- 散開・頭割りの位置 ----
      // 1セット目：無の氾濫でネオエクスデスがいた方向を北。2セット目：フィールドの北（ブリザガの安地側へ寄る）
      const blizzHits = iceHits(charged);
      const setBase = (k, set) => { const base = set === 1 ? p.neoDir : 0, g = grp(k); return isSpread(k, set) ? base + (g === 'TH' ? 270 : 90) : base + (g === 'TH' ? 0 : 180); };
      const setSpots = (k, set) => { const b = setBase(k, set), r = isSpread(k, set) ? 14 : 9.5; return (set === 2 ? [b, b - 30, b + 30] : [b]).map(c => at(c, r)); };
      const setSpot = (k, set) => {
        const g = grp(k), sp = isSpread(k, set);
        let b = setBase(k, set);
        if (set === 2){ const cand = [b - 30, b + 30]; b = cand.find(c => !blizzHits.includes(quadOf(at(c, 10)))) ?? b; }
        if (sp) return at(b, 14);
        const tgt = SLOTS.find(x => grp(x) === g && stackTarget(x, set));
        const c = at(b, 9.5); if (k === tgt) return c;
        const others = SLOTS.filter(x => grp(x) === g && !isSpread(x, set) && x !== tgt), i = others.indexOf(k);
        return { x:c.x + Math.cos(i * 2.1 + 1) * 1.2, z:c.z + Math.sin(i * 2.1 + 1) * 1.2 };
      };
      // ---- 視線：視線持ち2人はケフカの近く、ほかは外。1回目はサンダガの安全な帯の中、帯と平行に並ぶ ----
      const gazeSpot = (k, n) => {
        const holders = gazeHolders(n), g = grp(k);
        let c = { x:0, z:0 }, d = { x:0, z:-1 };
        if (n === 1){
          const m = charged, o = m.thO, hit = thHits(m);
          const safeC = [5, -5].find(cc => !hit.includes(BAND_C.indexOf(cc)));
          const nrm = { x:o / Math.SQRT2, z:1 / Math.SQRT2 };
          c = { x:nrm.x * safeC, z:nrm.z * safeC };
          d = { x:1 / Math.SQRT2, z:-o / Math.SQRT2 }; if (d.z > 0) d = { x:-d.x, z:-d.z }; // 帯の向き（北寄り）
        }
        const sgn = g === 'TH' ? 1 : -1;
        if (holders.includes(k)) return { x:c.x + d.x * 1.2 * sgn, z:c.z + d.z * 1.2 * sgn };
        const mates = SLOTS.filter(x => grp(x) === g && !holders.includes(x)), i = mates.indexOf(k);
        const nn = { x:-d.z, z:d.x };
        return { x:c.x + d.x * 10 * sgn + nn.x * (i - 1) * 1.6, z:c.z + d.z * 10 * sgn + nn.z * (i - 1) * 1.6 };
      };
      const huddle = k => { const i = SLOTS.indexOf(k); return { x:Math.cos(i * .785) * .8, z:Math.sin(i * .785) * .8 }; };
      // 最後：混沌の水（本当＝ドーナツ→中、嘘＝円→外）とマジックアウトの両方を避ける点
      const finalSpot = water.truth
        ? safeSpot(q => hitByMystery(rel, q) || Math.hypot(q.x, q.z) > BAIT_R - 1.3, .5, 4.7, 1.2)
        : safeSpot(q => hitByMystery(rel, q) || Math.hypot(q.x, q.z) < BAIT_R + 1.8, 8, 17);
      // ---- 動きの予定（味方も自分のガイドも同じ） ----
      const steps = [
        { from:T.mystery[0] + .5, until:T.mystery[0] + TELL, spot:k => ({ x:mysterySpots[0].x + huddle(k).x, z:mysterySpots[0].z + huddle(k).z }) },
        { from:T.mystery[1] + .5, until:T.mystery[1] + TELL, spot:k => ({ x:mysterySpots[1].x + huddle(k).x, z:mysterySpots[1].z + huddle(k).z }) },
        { from:T.mystery[2] + .5, until:T.mystery[2] + TELL, spot:k => ({ x:mysterySpots[2].x + huddle(k).x, z:mysterySpots[2].z + huddle(k).z }) },
        { from:T.flood + .4, until:T.floodHit, spot:k => { const s = floodSide(k), i = SLOTS.indexOf(k) % 4; return { x:right.x * s * 9 + fwd.x * (i - 1.5) * 2.4, z:right.z * s * 9 + fwd.z * (i - 1.5) * 2.4 }; } },
        { from:T.floodHit + .1, until:T.set1, spot:k => setSpot(k, 1) },
        { from:T.thunder + .4, until:T.gaze1, spot:k => gazeSpot(k, 1) },
        { from:T.gaze1 + .1, until:T.fireLock, spot:huddle },
        { from:T.fireLock + .1, until:T.fireHit, spot:k => fire.truth ? setSpot(k, 2) : huddle(k) },
        { from:T.blizzard + .1, until:T.set2, spot:k => setSpot(k, 2) },
        { from:T.blizzard + 5.1, until:T.gaze2, spot:k => gazeSpot(k, 2) },
        { from:T.gaze2 + .1, until:T.waterLock, spot:huddle },
        { from:T.releaseTell + .1, until:T.releaseTell + TELL, spot:k => k === me ? finalSpot : ({ x:finalSpot.x + huddle(k).x * .5, z:finalSpot.z + huddle(k).z * .5 }) },
      ];
      const stepAt = t => steps.find(s => t < s.until);
      const bots = SLOTS.filter(k => k !== me).map(k => ({ k, x:Math.cos(SLOTS.indexOf(k)) * 3, z:3 + Math.sin(SLOTS.indexOf(k)) * 2, goal:null }));
      const pos = k => k === me ? S.player : bots.find(b => b.k === k);
      const fired: boolean[] = [];
      let lastT = 0, fireBaits = [], waterBaits = [];
      const flashes = []; // 着弾の塗り（短時間）
      const flash = (draw, dur = .45) => flashes.push({ draw, t:S.t, dur });
      const chaosFireFirst = Math.random() < .5; // デバフ欄で炎と水のどちらが左か（実機でも人によって違う）
      const efx = makeP4Fx(); // エフェクト（p4fx.ts）
      const KS = { appear:9.6 }; // おちょくりソウルのあと、カオスとネオエクスデスが出る
      // ---- PT チャット（マクロ）と自分のメモ ----
      const chat = []; let chatVer = 0;
      const say = (text, cls = '') => { chat.push({ text, cls }); chatVer++; logLine(text, cls); };
      const cell = s => { const w = [...s].reduce((n, c) => n + (/[\uff61-\uff9f]/.test(c) ? .5 : 1), 0); return s + '　'.repeat(Math.max(0, Math.round(3 - w))); }; // 半角カナは半分の幅
      const row = cs => cs.map(cell).join('｜');
      const memo: Record<string, any> = { early:false, late:false, bomb:null };
      const queue: { at:number; run:() => void; done?:boolean }[] = [
        { at:3, run:() => { say('１回目' + '　'.repeat(8) + '｜２回目', 'rule'); say(row(['早', '視線１', '炎', '遅', '視線２', '津波']), 'rule'); } },
        { at:T.gcHit[0] + 1.6, run:() => say(row([bombWord(0), p.gcTrue[0] ? '見ない' : '見る', '', bombWord(0), '', '']), 'gaze1') },
        { at:T.chaosHit[0] + 1.6, run:() => say(chaosRow(p.chaos[0])) },
        { at:T.gcHit[0] + 8.0, run:() => say(elemRow(0)) },
        { at:T.gcHit[1] + 1.6, run:() => say(row([bombWord(1), '', '', bombWord(1), p.gcTrue[1] ? '見ない' : '見る', '']), 'gaze2') },
        { at:T.chaosHit[1] + 1.6, run:() => say(chaosRow(p.chaos[1])) },
        { at:T.gcHit[1] + 8.0, run:() => say(elemRow(1)) },
        { at:T.thunder + 1.5, run:() => { say('サンダー直線：' + (charged.thTrue ? '踏まない　○' : '踏む　　　？')); } },
        { at:T.blizzard + 1.5, run:() => say('ブリザガ扇　：' + (charged.iceTrue ? '踏まない　○' : '踏む　　　？')) },
      ];
      function chaosRow(c){
        const shape = c.kind === 'fire' ? (c.truth ? 'ﾀｹﾉｺ' : '中央') : (c.truth ? '中央' : 'ﾀｹﾉｺ');
        return row(c.kind === 'fire' ? ['', '', shape, '', '', ''] : ['', '', '', '', '', shape]);
      }
      function elemRow(gc){
        const set = gc === set1Gc ? 1 : 2, txt = (p.gcTrue[gc] ? '雷' : '水') + '　外';
        return row(set === 1 ? [txt, '', '', '', '', ''] : ['', '', '', txt, '', '']);
      }
      const MEMO_TXT = { stop:'加速度：止まる', move:'加速度：動く' };
      // ---- 判定 ----
      const myD = dbf[me];
      // 散開・頭割り・視線は「決められた位置にいるか」で判定する（味方は画面に出さない。1人で処理できるかの練習）
      const checkSet = set => {
        const meP = S.player, sp = isSpread(me, set);
        const others = SLOTS.filter(k => k !== me);
        if (sp){
          // 散開：自分の側（タンヒラ／DPS で分かれる）にいて、ほかの誰も巻き込まなければ正解
          const side = dirOf((set === 1 ? p.neoDir : 0) + (myGrp === 'TH' ? 270 : 90));
          if (meP.x * side.x + meP.z * side.z < 2) hurt(myGrp === 'TH' ? '散開：タンヒラの側にいない' : '散開：DPS の側にいない');
          else if (others.some(k => dist(pos(k), meP) <= SPREAD_R)) hurt('散開に味方を巻き込んだ');
        } else {
          // 頭割り：自分の組の頭割りに入っていて、散開の人に巻き込まれなければ正解
          const tgt = SLOTS.find(k => grp(k) === myGrp && stackTarget(k, set));
          const center = tgt && tgt !== me ? pos(tgt) : setSpot(me, set);
          if (dist(center, meP) > STACK_R) hurt('頭割りに入れていない');
          else if (others.some(k => isSpread(k, set) && dist(pos(k), meP) <= SPREAD_R)) hurt('散開に巻き込まれた');
        }
        if (myD.bomb && myD.bomb.set === set){
          const real = p.gcTrue[myD.bomb.gc], moving = isActing(); // 移動・詠唱・スキル使用はどれも「動いた」
          if (real && moving) hurt('加速度爆弾（本当）で動いた（移動・スキル）');
          if (!real && !moving) hurt('加速度爆弾（嘘）で止まっていた');
          if (real === moving) efx.add('launch', { x:meP.x, z:meP.z }); // ミスしたときだけ打ち上がる
        }
        sfx.big(); fxShake(2, .2);
        efx.add(sp ? 'spread' : 'stack', { x:meP.x, z:meP.z });
      };
      // 視線：視線持ちはターゲットサークル（ケフカの足元の円）の中、ほかは外。本当ならケフカを見ない、嘘ならケフカを見る
      const TC_R = 8;
      const checkGaze = n => {
        const real = p.gcTrue[n - 1], holder = myD.gaze === n;
        const f = S.face || { x:0, z:-1 }, meP = S.player, r = Math.hypot(meP.x, meP.z);
        if (holder && r > TC_R) hurt('視線持ちなのにターゲットサークルの外にいた');
        if (!holder && r <= TC_R) hurt('視線持ちではないのにターゲットサークルの中にいた');
        if (r > 1){
          const cos = (-meP.x * f.x - meP.z * f.z) / r; // ケフカの方を向いているほど 1
          if (real && cos >= Math.SQRT1_2) hurt('呪詛の叫声（本当）でケフカを見た');
          if (!real && cos < Math.SQRT1_2) hurt('呪詛の叫声（嘘）でケフカを見ていない');
        }
        efx.add('gaze'); efx.flash('#ffffff', .35, .2);
        sfx.boom();
      };
      const raid = (dmg, name, fx = '') => { healerHit(dmg, name); sfx.big(); fxFlash('#ffffff', .35, .15); fxShake(3, .25); if (fx) efx.add(fx); };
      const mysteryResolve = (m, ice, th, label) => {
        const q = S.player;
        if (ice && iceHits(m).includes(quadOf(q))) hurt(`${label}：ブリザガに当たった`);
        else if (th && thHits(m).some(i => inBand(m.thO, BAND_C[i], q))) hurt(`${label}：サンダガに当たった`);
        flash(() => { if (ice) iceHits(m).forEach(qq => fillArena(quadSpan(qq), '#a8e8ff')); if (th) thHits(m).forEach(i => fillArena(bandSpan(m.thO, BAND_C[i]), '#ff9ae8')); });
        if (th){ const n = { x:m.thO / Math.SQRT2, z:1 / Math.SQRT2 }, d = { x:1 / Math.SQRT2, z:-m.thO / Math.SQRT2 }; const segs = []; thHits(m).forEach(i => [-3, 0, 3].forEach(o => { const c = BAND_C[i] + o, u = Math.sqrt(Math.max(0, 400 - c * c)); segs.push([{ x:n.x * c - d.x * u, z:n.z * c - d.z * u }, { x:n.x * c + d.x * u, z:n.z * c + d.z * u }]); })); efx.add('thunder', { segs }); }
        if (ice){ const pts = []; iceHits(m).forEach(qq => { for (let j = 0; j < 7; j++){ const a = (qq * 90 + 12 + j * 11) , r = 5 + (j * 7) % 14; pts.push(at(a, r)); } }); efx.add('ice', { pts }); }
        if (label === 'マジックアウト'){ efx.add('release'); efx.flash('#ffffff', .5, .3); }
        sfx.boom();
      };
      const events: [number, () => void][] = [
        [T.mystery[0] + TELL, () => mysteryResolve(p.mystery[0], true, true, 'なぞなぞマジック1')],
        [T.mystery[1] + TELL, () => mysteryResolve(p.mystery[1], true, true, 'なぞなぞマジック2')],
        [T.mystery[2] + TELL, () => mysteryResolve(p.mystery[2], true, true, 'なぞなぞマジック3')],
        [T.gcHit[0], () => raid(300000, 'グランドクロス', 'gc')], [T.gcHit[1], () => raid(300000, 'グランドクロス', 'gc')], [T.gcHit[2], () => raid(300000, 'グランドクロス', 'gc')],
        [T.chaosHit[0], () => raid(250000, p.chaos[0].kind === 'fire' ? 'ほのお' : 'つなみ', p.chaos[0].kind)], [T.chaosHit[1], () => raid(250000, p.chaos[1].kind === 'fire' ? 'ほのお' : 'つなみ', p.chaos[1].kind)],
        [T.floodHit, () => {
          const q = S.player, l = lat(q);
          if (Math.abs(l) < EDGE_HW && (q.x - neo.x) * fwd.x + (q.z - neo.z) * fwd.z > 0) hurt('生死の境界に当たった');
          else if (actualColor(l < 0 ? -1 : 1) !== needColor(me)) hurt('無の氾濫：色を間違えた');
          flash(() => { fillArena(z => halfX(-right.x, EDGE_HW + right.z * z), floodCol(actualColor(-1))); fillArena(z => halfX(right.x, EDGE_HW - right.z * z), floodCol(actualColor(1))); fillArena(z => cross(halfX(right.x, -EDGE_HW - right.z * z), halfX(-right.x, -EDGE_HW + right.z * z)), '#ff2a3a'); }, .6);
          efx.add('flood', { fwd, right, colL:actualColor(-1), colR:actualColor(1) });
          sfx.big(); fxShake(4, .3);
        }],
        [T.surge, () => raid(120000, 'デスサージ', 'surge')],
        [T.set1, () => checkSet(1)],
        [T.thunder + TELL - .3, () => efx.add('beams', { dir:{ x:1 / Math.SQRT2, z:-charged.thO / Math.SQRT2 } })],
        [T.thunder + TELL, () => mysteryResolve(charged, false, true, 'もりもりサンダガ')],
        [T.gaze1, () => checkGaze(1)],
        [T.fireLock, () => { fireBaits = SLOTS.map(k => ({ ...pos(k) })); }],
        [T.ultimaHit, () => raid(250000, 'どきどきアルテマ', 'ultima')],
        [T.fireHit, () => baitResolve(fireBaits, fire.truth ? 'circle' : 'donut', '混沌の炎')],
        [T.set2, () => checkSet(2)],
        [T.blizzard + TELL, () => mysteryResolve(charged, true, false, 'ひろげるブリザガ')],
        [T.gaze2, () => checkGaze(2)],
        [T.waterLock, () => { waterBaits = SLOTS.map(k => ({ ...pos(k) })); }],
        [T.waterHit, () => baitResolve(waterBaits, water.truth ? 'donut' : 'circle', '混沌の水')],
        [T.releaseTell + TELL, () => mysteryResolve(rel, true, true, 'マジックアウト')],
      ];
      function baitResolve(baits, shape, name){
        const q = S.player;
        if (shape === 'circle' && baits.some(b => dist(b, q) <= BAIT_R)) hurt(`${name}（円）に当たった`);
        if (shape === 'donut' && baits.some(b => dist(b, q) > BAIT_R)) hurt(`${name}（ドーナツ）に当たった`);
        const isFire = name === '混沌の炎';
        if (shape === 'circle') efx.add(isFire ? 'burst' : 'geyser', { pts:baits, r:BAIT_R });
        else efx.add('wring', { pts:baits, r:BAIT_R, col:isFire ? '#ff7a3a' : '#5ad0ff' });
        if (isFire) efx.flash('#ffb84a', .3, .2);
        sfx.big();
      }
      const floodCol = c => c === 'white' ? '#c05aff' : '#3a7aff';
      // ---- 表示用 ----
      const sec = until => Math.max(0, Math.ceil(until - S.t));
      const tm = until => { const s = sec(until); return s >= 60 ? '1m' : String(s); };
      // 真偽の玉（青＝本当、？の赤＝嘘）。黒いふちと白い光で目立たせる
      const orb = (X, Y, truth, big = false) => {
        const r = big ? 7 : 5;
        disc(X, Y, r + 1, '#101018');
        if (truth){ disc(X, Y, r, '#3aa8ff'); disc(X, Y, r - 2, '#6ac8ff'); disc(X - 2, Y - 2, 1, '#ffffff'); }
        else { disc(X, Y, r, '#e8283a'); const q = r >= 7 ? 2 : 1; // ？マーク
          rect(X - q, Y - 2 * q - 1, 3 * q, q, '#fff'); rect(X + q, Y - q - 1, q, q, '#fff'); rect(X, Y - 1, q, q, '#fff'); rect(X, Y + q, q, q, '#fff'); }
      };
      const orbit = (c, truth, t) => { const a = t * 3; orb(px(c.x) + Math.round(Math.cos(a) * 32), px(c.z) + Math.round(Math.sin(a) * 14), truth, true); }; // ボスの絵のまわりを回る
      // ボスのドット絵（p4boss.ts）。位置を中心に貼る
      const drawSprite = (id, q) => { const sp = bossSprite(id), X = px(q.x), Z = px(q.z); ctx.drawImage(sp, Math.round(X - sp.width / 2), Math.round(Z - sp.height / 2)); };
      const drawNeo = q => drawSprite('neo', q);
      const drawChaos = q => drawSprite('chaos', q);
      const tellDraw = (m, ice, th) => {
        const blink = (Math.floor(performance.now() / 200) & 1) === 0;
        if (ice) iceTell(m).forEach(q => alpha(blink ? .22 : .14, () => fillArena(quadSpan(q), '#a8e8ff')));
        if (th) thTell(m).forEach(i => alpha(blink ? .22 : .14, () => fillArena(bandSpan(m.thO, BAND_C[i]), '#fff070')));
      };
      const ellipse = (X, Y, rx, ry, col) => { for (let a = 0; a < 64; a++) rect(X + Math.round(Math.cos(a * Math.PI / 32) * rx), Y + Math.round(Math.sin(a * Math.PI / 32) * ry), 2, 1, col); };
      const kefkaOrbs = (iceT, thT) => { // ケフカの体のまわりの輪：上の紫＝サンダガ（帯）、下の青＝ブリザガ（扇）。青い玉＝本当、？の赤い玉＝嘘
        const X = px(0), Y = px(0), a = performance.now() / 300, rx = 16, ry = 4;
        const ringOrb = (Yc, col, truth, ph) => { ellipse(X, Yc, rx, ry, col); orb(X + Math.round(Math.cos(a + ph) * rx), Yc + Math.round(Math.sin(a + ph) * ry), truth); };
        if (thT !== null) ringOrb(Y - 12, '#c05aff', thT, 0);
        if (iceT !== null) ringOrb(Y + 4, '#5ab0ff', iceT, Math.PI);
      };
      const neoPos = t => t < KS.appear ? null : t < T.neoLeave ? NEO0 : t >= T.neoFlood && t < T.surge ? neo : null;
      const markerDraw = () => {
        const m = S.inst?.marker; if (!m) return;
        const X = px(S.player.x), Y = px(S.player.z) - 20;
        const col = m[0] === 'a' ? '#e8283a' : m[0] === 'b' ? '#3a6ad8' : '#6a6a78';
        rect(X - 5, Y - 5, 11, 11, '#101018'); rect(X - 4, Y - 4, 9, 9, col);
        if (m[0] === 'x'){ line(X - 2, Y - 2, X + 2, Y + 2, '#fff'); line(X + 2, Y - 2, X - 2, Y + 2, '#fff'); }
        else glyph(m[1], X, Y - 2, '#ffffff');
      };
      const HEAL_GCDS = { ast:12, sch:12 }, activeLen = T.end - 1;
      const dpsTarget = TARGET_DPS[opt.job] * (1 - (HEAL_GCDS[opt.job] || 0) * GCD / activeLen);
      return {
        start:{ x:0, z:4 }, t0:1, end:T.end + .4,
        intro:`あなたは ${me}`,
        bossHp: dpsTarget * activeLen * .95, dpsTarget, hpGate:.25,
        healEase: () => .45,
        activeTime: end => Math.max(1, end - 1),
        casts:[
          { name:'おちょくりソウル', start:1.45, len:5 },
          ...T.mystery.map(s => ({ name:'なぞなぞマジック', start:s, len:TELL })),
          ...T.gc.map((s, i) => ({ name:'グランドクロス', start:s, len:T.gcHit[i] - s })),
          ...T.chaos.map((s, i) => ({ name:p.chaos[i].kind === 'fire' ? 'ほのお' : 'つなみ', start:s, len:T.chaosHit[i] - s })),
          { name:'無の氾濫', start:T.flood, len:T.floodHit - T.flood }, { name:'マジックチャージ', start:T.charge, len:3 },
          { name:'もりもりサンダガ', start:T.thunder, len:TELL }, { name:'どきどきアルテマ', start:T.ultima, len:T.ultimaHit - T.ultima },
          { name:'ひろげるブリザガ', start:T.blizzard, len:TELL }, { name:'マジックアウト', start:T.release, len:T.releaseTell + TELL - T.release },
        ],
        progress: t => t < T.flood ? 'P4' : t < T.set1 ? '無の氾濫' : t < T.set2 ? '1セット目' : '2セット目',
        chat, get chatVer(){ return chatVer; },
        say(kind){
          let text;
          if (kind === 'early' || kind === 'late'){ memo[kind] = !memo[kind]; text = (kind === 'early' ? '早' : '遅') + '：' + (memo[kind] ? '散開' : '頭割り'); }
          else if (MEMO_TXT[kind]){ memo.bomb = kind; text = MEMO_TXT[kind]; }
          else return;
          chat.push({ text:'（自分）' + text, cls:'mine' }); chatVer++; logLine(text, 'me'); sfx.cursor();
        },
        marker:'',
        setMarker(m){ this.marker = m; sfx.cursor(); },
        mySpot: t => { const st = stepAt(t); return st && t >= st.from ? st.spot(me) : null; },
        debug:{ p, dbf, isSpread, gazeHolders, pos, T },
        status(t){
          const s = [], d = myD;
          if (d.bomb && t >= (d.bomb.gc ? T.debuff2 : T.debuff1) && t < d.bomb.until) s.push({ at:d.bomb.gc ? T.debuff2 : T.debuff1, icon:'bomb', glyph:'加', color:'#ff9a3a', name:'加速度爆弾', sec:tm(d.bomb.until) });
          if (d.elem && t >= (d.elem.gc ? T.debuff2 : T.debuff1) && t < d.elem.until) s.push(d.elem.type === 'fork' ? { at:d.elem.gc ? T.debuff2 : T.debuff1, icon:'fork', glyph:'雷', color:'#b05aff', name:'フォークライトニング', sec:tm(d.elem.until) } : { at:d.elem.gc ? T.debuff2 : T.debuff1, icon:'water', glyph:'水', color:'#3a7aff', name:'水属性圧縮', sec:tm(d.elem.until) });
          if (d.gaze && t >= (d.gaze === 1 ? T.debuff1 : T.debuff2) && t < d.gazeUntil) s.push({ at:d.gaze === 1 ? T.debuff1 : T.debuff2, icon:'shriek', glyph:'視', color:'#e8283a', name:'呪詛の叫声', sec:tm(d.gazeUntil) });
          if (t >= T.chaosDebuff[0] && t < T.fireLock && (fire === p.chaos[0] || t >= T.chaosDebuff[1])) s.push({ at:fire === p.chaos[0] ? T.chaosDebuff[0] : T.chaosDebuff[1], icon:'flame', glyph:'炎', color:'#ff5a2a', name:'混沌の炎', sec:tm(T.fireLock) });
          if (t >= T.chaosDebuff[0] && t < T.waterLock && (water === p.chaos[0] || t >= T.chaosDebuff[1])) s.push({ at:water === p.chaos[0] ? T.chaosDebuff[0] : T.chaosDebuff[1], icon:'wave', glyph:'波', color:'#2ab8d8', name:'混沌の水', sec:tm(T.waterLock) });
          if (t >= T.gc3Debuff && t < T.gc3Debuff + 15){
            s.push(p.wound[me] === 'white' ? { at:T.gc3Debuff, icon:'live', glyph:'生', color:'#c05aff', name:'生者の傷（紫）', sec:tm(T.gc3Debuff + 15) } : { at:T.gc3Debuff, icon:'dead', glyph:'死', color:'#3a7aff', name:'死者の傷（青）', sec:tm(T.gc3Debuff + 15) });
            s.push(d.field ? { at:T.gc3Debuff + .01, icon:'field', glyph:'場', color:'#e8c83a', name:'アラガンフィールド', sec:tm(T.gc3Debuff + 15) } : { at:T.gc3Debuff + .01, icon:'beyond', glyph:'超', color:'#7a4ad8', name:'死の超越', sec:tm(T.gc3Debuff + 15) });
          }
          // 実機の並び：傷 → フィールド／超越 → 呪詛 → フォーク／水圧縮 → 加速度 → 炎と水（炎と水の順は人によって違う）
          const PRI = { live:0, dead:0, field:1, beyond:1, shriek:2, fork:3, water:3, bomb:4, flame:chaosFireFirst ? 5 : 6, wave:chaosFireFirst ? 6 : 5 };
          s.sort((a, b) => PRI[a.icon] - PRI[b.icon]);
          return s;
        },
        tick(t){
          const dt = Math.max(0, t - lastT); lastT = t;
          queue.forEach(q => { if (!q.done && t >= q.at){ q.done = true; q.run(); } });
          const st = stepAt(t);
          bots.forEach(b => {
            if (st && t >= st.from) b.goal = st.spot(b.k);
            if (!b.goal) return;
            const d = dist(b, b.goal), step = BOT_SPEED * dt;
            if (d > .05){ const k = Math.min(1, step / d); b.x += (b.goal.x - b.x) * k; b.z += (b.goal.z - b.z) * k; }
          });
          events.forEach((e, i) => { if (!fired[i] && t >= e[0]){ fired[i] = true; e[1](); } });
        },
        safeActive: t => { const s = stepAt(t); return !!s && t >= s.from; },
        safe(x, z, t){ const s = stepAt(t); if (!s || t < s.from) return true; const g = s.spot(me); return Math.hypot(x - g.x, z - g.z) <= 2; },
        guide(t){ const s = stepAt(t); if (!s || t < s.from) return; const g = s.spot(me); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
        draw(t){
          // 予兆
          T.mystery.forEach((s, k) => { if (t >= s && t < s + TELL) tellDraw(p.mystery[k], true, true); });
          if (t >= T.thunder && t < T.thunder + TELL) tellDraw(charged, false, true);
          if (t >= T.blizzard && t < T.blizzard + TELL) tellDraw(charged, true, false);
          if (t >= T.releaseTell && t < T.releaseTell + TELL) tellDraw(rel, true, true);
          T.mystery.forEach((s, k) => { if (t >= s && t < s + TELL) drawRails(p.mystery[k].thO, thTell(p.mystery[k]).map(i => BAND_C[i])); });
          if (t >= T.thunder && t < T.thunder + TELL) drawRails(charged.thO, thTell(charged).map(i => BAND_C[i]));
          if (t >= T.releaseTell && t < T.releaseTell + TELL) drawRails(rel.thO, thTell(rel).map(i => BAND_C[i]));
          // 無の氾濫：色の地帯・生死の境界は事前に出ない（ネオエクスデスの位置と左右の目印だけ）
          // 混沌の炎・水：確定した位置に範囲
          // 混沌の炎・水：デバフが切れた瞬間に場所は決まるが、発動するまで見えない
          // 着弾の塗り
          for (let i = flashes.length - 1; i >= 0; i--){ const f = flashes[i], k = (S.t - f.t) / f.dur; if (k > 1 || k < 0){ flashes.splice(i, 1); continue; } alpha(.5 * (1 - k), f.draw); }
          efx.draw();
          // ボス
          const nq = neoPos(t);
          if (nq){ drawNeo(nq); [0, 1, 2].forEach(i => { if (t >= T.gc[i] && t < T.gcHit[i]) orbit(nq, p.gcTrue[i], t); }); if (t >= T.flood && t < T.floodHit) orbit(nq, p.floodTrue, t); }
          [0, 1].forEach(i => { if (t >= T.chaos[i] && t < T.chaosHit[i]) drawChaosGlow(CHAOS0, p.chaos[i].kind, t); });
          if (t >= KS.appear && t < 43.5){ drawChaos(CHAOS0); [0, 1].forEach(i => { if (t >= T.chaos[i] && t < T.chaosHit[i]) orbit(CHAOS0, p.chaos[i].truth, t); }); }
          T.mystery.forEach((s, k) => { if (t >= s && t < s + TELL) kefkaOrbs(p.mystery[k].iceTrue, p.mystery[k].thTrue); });
          if (t >= T.thunder && t < T.thunder + TELL) kefkaOrbs(null, charged.thTrue);
          if (t >= T.blizzard && t < T.blizzard + TELL) kefkaOrbs(charged.iceTrue, null);
          if (t >= T.releaseTell - 6 && t < T.releaseTell + TELL) kefkaOrbs(relShown.ice, relShown.th);
          if (t >= T.release && t < T.releaseTell) drawReleaseRings(t);
          if (t >= T.flood && t < T.floodHit) drawFloodMarks(neo, right, shownColor, t);
          // 味方（7人）は描かない。内部では決まった位置へ動き、混沌の炎・水の置き場所と視線の向きの判定にだけ使う
          // 自分の向き（視線の判定に使う）と頭上マーカー
          const f = S.face || { x:0, z:-1 }, X = px(S.player.x), Z = px(S.player.z);
          const tri = (ax, az, bx, bz, cx, cz, col) => { // 塗りつぶし三角形（ドット）
            const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx)), z0 = Math.floor(Math.min(az, bz, cz)), z1 = Math.ceil(Math.max(az, bz, cz));
            const e = (px1, pz1, px2, pz2, x, z) => (px2 - px1) * (z - pz1) - (pz2 - pz1) * (x - px1);
            for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++){ const a = e(ax, az, bx, bz, x + .5, z + .5), b = e(bx, bz, cx, cz, x + .5, z + .5), c = e(cx, cz, ax, az, x + .5, z + .5); if ((a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0)) rect(x, z, 1, 1, col); }
          };
          const nx = -f.z, nz = f.x;
          { // 向き：足元の輪＋正面の三角（実機のターゲットサークル風）
            const R = 14, cz = Z + 1;
            for (let a = 0; a < 120; a++){ const th = a * Math.PI / 60, c = Math.cos(th) * f.x + Math.sin(th) * f.z; if (c > .96) continue; rect(X + Math.round(Math.cos(th) * R), cz + Math.round(Math.sin(th) * R), 1, 1, '#ffe070'); }
            const tip = R + 7, base = R - 1, w = 5;
            tri(X + f.x * tip, cz + f.z * tip, X + f.x * base + nx * w, cz + f.z * base + nz * w, X + f.x * base - nx * w, cz + f.z * base - nz * w, '#101018');
            tri(X + f.x * (tip - 1.5), cz + f.z * (tip - 1.5), X + f.x * (base + .8) + nx * (w - 1.5), cz + f.z * (base + .8) + nz * (w - 1.5), X + f.x * (base + .8) - nx * (w - 1.5), cz + f.z * (base + .8) - nz * (w - 1.5), '#ffe070');
          }
          markerDraw();
        },
      };
    }
  };
})();

export { P4 };
