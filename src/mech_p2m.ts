// @ts-nocheck
import { mySlot } from './jobs.js';
import { opt } from './store.js';
import { S, shuffle, pick } from './state.js';
import { healerHit } from './action.js';
import { sfx } from './audio.js';
import { FXC, FXK, fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px } from './gfx.js';
import { markCanvas, spellTroubleUrl } from './p2icons.js';
import { screenFx } from './p2fx.js';
import { makeP2Vfx, towerOrb, fieldWhite, embTell } from './p2vfx.js';

// =====================================================================
// P2（ゴッドケフカ）：ミッシング（終末の双腕 〜 裁きの光）。docs/dmu/research-p2.md
// 処理法はヤーン速報「ミッシング 優先順＋立ち位置ぴれん」（南調整はまだ）。味方7人は正しく動く
// 時刻は cactbot のタイムライン 312.0 秒（終末の双腕の少し前）を 0 とする
// 塔は毎回2本。「塔のある側を南、ケフカを北」とみなした向き（相対の座標）で立ち位置を決め、塔の向きに回して使う
// 大きさ（塔・頭割り・円・扇・未来過去の円）はヤーンの図から測った推定。開発版で触ってもらって詰める
// =====================================================================
const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
const TH = ['MT', 'ST', 'H1', 'H2'], DPS = ['D1', 'D2', 'D3', 'D4'];
const PRIO = ['H1', 'H2', 'MT', 'ST', 'D1', 'D2', 'D3', 'D4'];          // 優先順：ヒラ ＞ タンク ＞ 近接 ＞ 遠隔
const PAIR = { MT:'H1', H1:'MT', ST:'H2', H2:'ST', D1:'D3', D3:'D1', D2:'D4', D4:'D2' };
const isRanged = k => ['H1', 'H2', 'D3', 'D4'].includes(k);
const roleOf = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];

// ---- 時刻 ----
const T_BASE = {
  embCast:3.1, emb:8.1, forsCast:16.3, fors:23.3, mark0:23.8,
  tower:[36.5, 46.4, 57.4, 67.4, 78.5, 88.5, 99.4, 109.4], // 光の波動（塔の判定）。スペルハザードの発動は HIT 秒後
  fp:[45.8, 66.7, 88.0, 108.7],                             // 未来／過去の終焉（詠唱完了。円の着弾は偶数回の塔と同時）
  leg:[57.1, 78.4, 99.2, 120.1],                            // 消滅の脚
  lojCast:124.1, loj:129.1, end:130.6,
};
const HIT = .6, FP_LEN = 6, LEG_LEN = 5, MARK_SHOW = 6;
// ---- 大きさ（推定） ----
// 塔 半径4・頭割り／円 半径5・扇 90°×長さ40 はゲームデータ（XIVAPI の Action：光の波動・スペルハザード・ドライブ／スキャッター／ウェーブ）。2026-10-14 確認
const TOWER_R = 4, STACK_R = 5, CIRC_R = 5, FAN_LEN = 40, FAN_HALF = 45, FP_R = 5, CLONE_D = 3.2, EMB_R = 3, BOT_SPEED = 24;
// ---- 立ち位置（相対：ケフカが北、塔が南。塔の中心は (±5.66, 5.66)。塔の中の位置は塔といっしょに 2026-10-14 にずらした） ----
const TOWER_REL = [{ x:-5.657, z:5.657 }, { x:5.657, z:5.657 }]; // 塔の中心はケフカから 8（AnoMech の再現データ。前は推定 8.5）
const ODD = { stack1:{ x:-4.26, z:4.66 }, fan:{ x:-6.86, z:8.26 }, bait:{ x:-10.5, z:8.0 }, joinL:{ x:-1.4, z:6.4 },
  stack2:{ x:4.06, z:4.06 }, circ:{ x:5.96, z:9.26 }, joinR1:{ x:1.2, z:6.0 }, joinR2:{ x:1.6, z:4.0 } };
const EVEN = { fan1:{ x:-4.06, z:3.46 }, fan2:{ x:4.06, z:3.46 }, circ1:{ x:-6.06, z:9.26 }, circ2:{ x:6.06, z:9.26 },
  baitL:{ x:-10, z:4.0 }, baitR:{ x:10, z:4.0 }, takeL:{ x:-5.6, z:-5.4 }, takeR:{ x:5.6, z:-5.4 } };
// 消滅の脚を待つ所：過去＝塔の側（塔と塔の間）、未来＝塔の反対側。少し外周寄りに立たないと、脚の角度が急になって次の塔で当たる
const WAIT_D = 9.5; // 8 より内側だと当たる人が出る（全パターンで確認）

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rot = (q, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x:q.x * c - q.z * s, z:q.x * s + q.z * c }; };
const at = (deg, r) => ({ x:Math.sin(deg * Math.PI / 180) * r, z:-Math.cos(deg * Math.PI / 180) * r }); // 北0・時計回り
const add = (a, b) => ({ x:a.x + b.x, z:a.z + b.z });
const OFF = k => at(SLOTS.indexOf(k) * 45 + 22.5, 1.1); // 固まるときの1人ずつのずれ

// ---- 床：ステージはいつもの暗い床のまま。外側（星空）だけ消して、画面全体の背景（screenBg）を見せる ----
const clearOutside = () => {
  const W = ctx.canvas.width, C = W / 2, R = 20 * PPY + 1;
  ctx.save(); ctx.beginPath(); ctx.rect(-40, -40, W + 80, W + 80); ctx.arc(C, C, R, 0, Math.PI * 2, true); ctx.clip('evenodd');
  ctx.clearRect(-40, -40, W + 80, W + 80); ctx.restore();
};
// 画面全体の背景。赤白のうず（ミッシング中）と、金色の空（左上から光が差し、横に光の筋、金の羽根が舞う）
// フィールドと同じドットの大きさで、中心をそろえる（hud.ts の screenBg）
const BG_SIZE = 900, bgCache = {};
const GOLD = ['#a86a10', '#c8841a', '#e0a028', '#f0bc3a', '#ffd458', '#ffe888', '#fff6c8']; // 暗い → 明るい
const bgImg = gold => {
  if (bgCache[gold]) return bgCache[gold];
  const c = document.createElement('canvas'); c.width = BG_SIZE; c.height = BG_SIZE;
  const g = c.getContext('2d'), C0 = BG_SIZE / 2;
  if (!gold){
    g.fillStyle = '#3a0a14'; g.fillRect(0, 0, BG_SIZE, BG_SIZE);
    for (let y = 0; y < BG_SIZE; y++) for (let x = 0; x < BG_SIZE; x++){
      const a = Math.atan2(y - C0, x - C0), r = Math.hypot(x - C0, y - C0);
      if (Math.sin(a * 14 + r * .09) > .55){ g.fillStyle = r > 150 ? '#7a1a2a' : '#5a1020'; g.fillRect(x, y, 1, 1); }
    }
  } else {
    // 明るさ：上ほど明るく、左上の光源に近いほど明るい。光源から放射状の光の帯。段ごとの色で 8bit らしく
    const SX = C0 - 300, SY = C0 - 420;
    for (let y = 0; y < BG_SIZE; y++) for (let x = 0; x < BG_SIZE; x++){
      const dx = x - SX, dy = y - SY, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      let v = 1 - y / BG_SIZE * .75 - r / 1400 + (Math.sin(a * 26) > .6 ? .12 : 0) + (((x * 7 + y * 13) % 5) - 2) * .012;
      g.fillStyle = GOLD[Math.max(0, Math.min(GOLD.length - 1, Math.floor(v * GOLD.length)))]; g.fillRect(x, y, 1, 1);
    }
    // 横に流れる細い光の筋（少しだけ弧を描く）
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let n = 0; n < 26; n++){
      const y0 = rnd() * BG_SIZE, x0 = rnd() * BG_SIZE * .6, len = 120 + rnd() * 380, bow = (rnd() - .5) * 30;
      g.fillStyle = rnd() < .5 ? '#fff6c8' : '#ffe888';
      for (let k = 0; k < len; k++){ const t = k / len; g.fillRect(Math.round(x0 + k), Math.round(y0 - bow * 4 * t * (1 - t) - k * .12), 1, 1); }
    }
    // 舞う金の羽根（斜めの小さなかけら）
    for (let n = 0; n < 60; n++){
      const x0 = Math.round(rnd() * BG_SIZE), y0 = Math.round(rnd() * BG_SIZE), L = 3 + (rnd() * 4 | 0);
      for (let k = 0; k < L; k++){ g.fillStyle = k === 0 ? '#fff6c8' : '#c8841a'; g.fillRect(x0 + (k >> 1), y0 + k, 1, 1); g.fillStyle = '#ffd458'; g.fillRect(x0 + (k >> 1) + 1, y0 + k, 1, 1); }
    }
  }
  return bgCache[gold] = { url:c.toDataURL(), size:BG_SIZE, color:gold ? '#c8841a' : '#3a0a14' };
};

const P2M = {
  id:'p2m', name:'ミッシング', sub:'ヤーン速報', view:24, start:{ x:-7, z:1 }, slots:true,
  gen(){
    const thStack = pick(TH), dStack = pick(DPS);
    return {
      me:mySlot(), method:opt.miss === 'south' ? 'south' : 'prio', thType:pick(['fan', 'circ']), thStack, dStack,
      theta1:pick([0, 45, 90, 135, 180, 225, 270, 315]), dir:pick([1, -1]),
      fp:[0, 1, 2, 3].map(() => pick(['future', 'past'])),
      cloneSkip:[0, 1, 2, 3].map(() => Math.random() * 4 | 0),
      // 塔を踏んだあとに付く新しい予兆（踏んだ4人に、SLOTS の順で配る）。奇数回の後＝扇2・円2、偶数回の後＝頭割り2・扇1・円1
      newMarks:[1, 2, 3, 4, 5, 6].map(k => shuffle(k % 2 ? ['fan', 'fan', 'circ', 'circ'] : ['stack', 'stack', 'fan', 'circ'])),
    };
  },
  create(p){
    const me = p.me;
    // ミッシングだけの練習は、ミッシングの詠唱の1秒前から（終末の双腕は通しのときだけ。p.withEmb）。時刻をまとめてずらす
    const SH = p.withEmb ? 0 : T_BASE.forsCast - 1;
    const T = Object.fromEntries(Object.entries(T_BASE).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => x - SH) : v - SH]));
    // ---- 組と予兆の流れ（計画どおり。味方はこのとおりに動く） ----
    const A = [p.thStack, PAIR[p.thStack], p.dStack, PAIR[p.dStack]], B = SLOTS.filter(k => !A.includes(k));
    const soakers = k => (k === 1 || k === 2 || k === 3 || k === 8 ? A : B).slice().sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b));
    const dType = p.thType === 'fan' ? 'circ' : 'fan';
    const mark0 = k => k === p.thStack || k === p.dStack ? 'stack' : TH.includes(k) ? p.thType : dType;
    // plan[k-1][slot]：塔 k を踏むときに持っている予兆。gotAt[slot]：予兆が付いた時刻の一覧（頭上に出す）
    const cur = Object.fromEntries(SLOTS.map(k => [k, mark0(k)]));
    const plan = [], given = []; // given：{ k, t, mark }
    SLOTS.forEach(k => given.push({ k, t:T.mark0, mark:cur[k] }));
    for (let k = 1; k <= 8; k++){
      const g = soakers(k);
      plan.push(Object.fromEntries(g.map(s => [s, cur[s]])));
      if (k <= 6){ g.forEach((s, i) => { cur[s] = p.newMarks[k - 1][i]; given.push({ k:s, t:T.tower[k - 1] + HIT + .5, mark:cur[s] }); }); }
      else g.forEach(s => { cur[s] = null; });
    }
    // ---- 南調整（ヤーン②・設定で選ぶ）：塔の左右は「前の塔と同じ側」。同じ予兆の2人が同じ側になったら、南（下）にいた人が反対側へ ----
    //   1回目：頭割りは左タンヒラ・右DPS。4回目：左＝ヒーラー・近接、右＝タンク・遠隔。8回目はマーカーの数字（優先順と同じ）
    //   奇数回：扇は左下・円は右下（決まり）、頭割りは上。偶数回：扇は上・円は下
    const southSide = {};
    if (p.method === 'south'){
      const prev = {};
      for (let k = 1; k <= 7; k++){
        const g = soakers(k), hold = plan[k - 1], side = {};
        if (k === 1) g.forEach(s => { const m = hold[s]; side[s] = m === 'stack' ? (TH.includes(s) ? 'L' : 'R') : m === 'fan' ? 'L' : 'R'; });
        else if (k === 4) g.forEach(s => { side[s] = roleOf(s) === 'H' || (roleOf(s) === 'D' && !isRanged(s)) ? 'L' : 'R'; });
        else {
          if (k % 2) g.forEach(s => { if (hold[s] !== 'stack') side[s] = hold[s] === 'fan' ? 'L' : 'R'; });
          (k % 2 ? ['stack'] : ['fan', 'circ']).forEach(m => {
            const hs = g.filter(s => hold[s] === m); if (hs.length !== 2) return;
            const [a, b] = hs, pa = prev[a]?.side ?? 'L', pb = prev[b]?.side ?? 'R';
            if (pa !== pb){ side[a] = pa; side[b] = pb; return; }
            const mover = prev[a]?.bottom ? a : b, stay = mover === a ? b : a; // 被ったら南（下）の人が動く
            side[stay] = pa; side[mover] = pa === 'L' ? 'R' : 'L';
          });
        }
        g.forEach(s => { prev[s] = { side:side[s], bottom:k % 2 ? hold[s] !== 'stack' : hold[s] === 'circ' }; });
        southSide[k] = side;
      }
    }
    // ---- 塔の向き ----
    const theta = k => p.theta1 + p.dir * 45 * (k - 1);                  // 塔のある側（北0・時計回り）
    const abs = (q, k) => rot(q, theta(k) - 180);                          // 相対 → 実際の座標
    const towersOf = k => TOWER_REL.map(q => abs(q, k));
    // ---- 担当の位置（塔 k のとき・相対） ----
    const byPrio = (list, m, holders) => list.filter(s => holders[s] === m).sort((a, b) => PRIO.indexOf(a) - PRIO.indexOf(b));
    const relSpot = (k, s) => {
      const hold = plan[k - 1], g = soakers(k), out = SLOTS.filter(x => !g.includes(x));
      if (k % 2){
        if (g.includes(s)){
          const m = hold[s];
          if (m === 'stack') return (southSide[k] ? southSide[k][s] === 'L' : byPrio(g, 'stack', hold).indexOf(s) === 0) ? ODD.stack1 : ODD.stack2;
          return m === 'fan' ? ODD.fan : ODD.circ;
        }
        // 塔を踏まない4人：ヒーラー＝左の扇の誘導、タンク＝左の頭割り、DPS 2人＝右の頭割り
        if (roleOf(s) === 'H') return ODD.bait;
        if (roleOf(s) === 'T') return ODD.joinL;
        return isRanged(s) ? ODD.joinR2 : ODD.joinR1;
      }
      if (g.includes(s)){
        const m = hold[s], i = southSide[k] ? (southSide[k][s] === 'L' ? 0 : 1) : byPrio(g, m, hold).indexOf(s);
        return m === 'fan' ? (i === 0 ? EVEN.fan1 : EVEN.fan2) : (i === 0 ? EVEN.circ1 : EVEN.circ2);
      }
      // 塔を踏まない4人：遠隔＝扇の誘導（ヒーラー左・DPS 右）、近接＝未来過去の円（タンク左・DPS 右）
      if (roleOf(s) === 'H') return EVEN.baitL;
      if (isRanged(s)) return EVEN.baitR;
      return roleOf(s) === 'T' ? EVEN.takeL : EVEN.takeR;
    };
    // ---- 道のり：「この時刻までにここ」の列（味方は着く時刻がギリギリになるように動き出す） ----
    const embSpot = s => s === 'MT' ? { x:-.6, z:-8.6 } : s === 'ST' ? { x:.6, z:-8.6 } : add({ x:0, z:8 }, OFF(s));
    // ミッシング前の散開：中央より少し南に縦2・横4（上の段 MT ST D1 D2、下の段 H1 H2 D3 D4。ペアは縦に並ぶ）。誰に何が付いたか見えるように
    const STANDBY = { MT:{ x:-6, z:2.5 }, ST:{ x:-2, z:2.5 }, D1:{ x:2, z:2.5 }, D2:{ x:6, z:2.5 },
      H1:{ x:-6, z:7.5 }, H2:{ x:-2, z:7.5 }, D3:{ x:2, z:7.5 }, D4:{ x:6, z:7.5 } }; // 段の間は 5（下の段の頭上マークが上の段に重ならない）
    const standby = s => STANDBY[s];
    const route = s => {
      const w = p.withEmb ? [{ until:T.emb + .3, spot:embSpot(s) }, { until:T.mark0, spot:standby(s) }] : [{ until:T.mark0, spot:standby(s) }];
      for (let k = 1; k <= 8; k++){
        const q = abs(relSpot(k, s), k);
        if (k % 2 && k >= 3){
          const j = (k - 1) / 2 - 1, fut = p.fp[j] === 'future';
          const wd = p.waitD ?? WAIT_D;
          w.push({ until:T.leg[j] - LEG_LEN, spot:add(abs({ x:0, z:fut ? -wd : wd }, k), OFF(s)) });
          w.push({ until:T.leg[j] - .15, spot:q });
        }
        w.push({ until:T.tower[k - 1], spot:q });               // 塔の判定までに着く
        w.push({ until:T.tower[k - 1] + HIT + .05, spot:q });   // 発動まで動かない
      }
      const Am = add({ x:0, z:-15 }, OFF(s)), Cm = add({ x:0, z:14 }, OFF(s));
      w.push({ until:T.leg[3] - LEG_LEN, spot:Am });
      w.push({ until:T.leg[3] - .15, spot:p.fp[3] === 'future' ? Cm : Am });
      w.push({ until:T.end + 9, spot:p.fp[3] === 'future' ? Cm : Am });
      return w;
    };
    const ROUTES = Object.fromEntries(SLOTS.map(s => [s, route(s)]));
    const spotAt = (s, t) => (ROUTES[s].find(w => t < w.until) ?? ROUTES[s][ROUTES[s].length - 1]).spot;
    const botGoal = (s, t) => {
      const R = ROUTES[s], n = R.findIndex(w => t < w.until);
      if (n < 0) return R[R.length - 1].spot;
      if (n === 0) return R[0].spot;
      const curS = R[n - 1].spot, nx = R[n].spot;
      return t >= R[n].until - dist(curS, nx) / BOT_SPEED - .05 ? nx : curS;
    };
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...(p.withEmb ? embSpot(k) : standby(k)) }));
    const MERGE_AT = T.leg[3] + .2; // p.mergeBots：最後の消滅の脚のあと、味方を自分に重ねて消す（P2 通し）
    const merging = t => !!p.mergeBots && t >= MERGE_AT;
    const botShown = (b, t) => !merging(t) || dist(b, S.player) > .6;
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);

    // ---- 判定の状態 ----
    let lastT = 0, mySoaks = 0, vulnUntil = -9;
    const fired = new Set();
    const clones = [];   // { x, z, until, face? }
    const legSrc = [];   // 消滅の脚：{ x, z, face, at, fut }
    const efx = [];      // 自前の演出：{ k, t, ... }
    const vfx = makeP2Vfx(); // 実機の動画に合わせた演出（p2vfx.ts）
    const once = (key, fn) => { if (!fired.has(key)){ fired.add(key); fn(); } };
    const inTowerAt = (k, q) => towersOf(k).findIndex(c => dist(q, c) <= TOWER_R);
    const vuln = () => S.t < vulnUntil;
    const meHit = (dmg, name) => { healerHit(dmg, name); vulnUntil = S.t + 8; };

    // 塔 k の判定（踏んだ人を記録）と、HIT 秒後のスペルハザード発動
    const snap = {};
    const towerSnap = k => {
      const g = soakers(k);
      snap[k] = Object.fromEntries(SLOTS.map(s => [s, inTowerAt(k, pos(s))]));
      const myT = snap[k][me], mine = g.includes(me);
      if (mine && myT < 0) hurt(`${k}回目の塔：踏まなかった`);
      if (!mine && myT >= 0) hurt(`${k}回目の塔：担当ではない塔を踏んだ`);
      [0, 1].forEach(i => { const n = SLOTS.filter(s => snap[k][s] === i).length; if (n > 2 && myT === i) hurt(`${k}回目の塔：3人入った（違う塔）`); });
      if (mine && myT >= 0) mySoaks++;
      vfx.add('tower', { pts:towersOf(k) }); sfx.big(); fxShake(3, .3); // 塔の着弾：オレンジ〜白の大爆発（そのあと頭上の攻撃が発動）
    };
    const spellFire = k => {
      const g = soakers(k), hold = plan[k - 1], hits = Object.fromEntries(SLOTS.map(s => [s, []]));
      const all = SLOTS.map(s => ({ s, q:{ ...pos(s) } }));
      const Q = s => all.find(a => a.s === s).q;
      // 実際に塔を踏んだ担当だけ発動（自分が踏まなかったら、自分の予兆は残る）
      const firing = g.filter(s => s !== me || snap[k][me] >= 0);
      const stacks = [];
      firing.forEach(s => {
        const m = hold[s], c = Q(s);
        if (m === 'stack'){
          const inS = all.filter(a => dist(a.q, c) <= STACK_R).map(a => a.s);
          inS.forEach(x => hits[x].push('頭割り')); stacks.push({ s, n:inS.length, mine:inS.includes(me) });
          efx.push({ k:'stack', t:S.t, q:c }); FXK.stack(c.x, c.z, STACK_R, FXC.flare);
        } else if (m === 'circ'){
          const inC = all.filter(a => a.s !== s && dist(a.q, c) <= CIRC_R).map(a => a.s);
          inC.forEach(x => hits[x].push('円')); if (s === me && inC.length) hurt(`${k}回目：円に味方を巻き込んだ`);
          efx.push({ k:'circ', t:S.t, q:c }); FXK.flare(c.x, c.z, CIRC_R);
        } else if (m === 'fan'){
          const tgt = all.filter(a => a.s !== s).sort((a, b) => dist(a.q, c) - dist(b.q, c))[0];
          const dir = Math.atan2(tgt.q.x - c.x, -(tgt.q.z - c.z));
          const inF = all.filter(a => a.s !== s && dist(a.q, c) <= FAN_LEN && Math.abs(((Math.atan2(a.q.x - c.x, -(a.q.z - c.z)) - dir) * 180 / Math.PI + 540) % 360 - 180) <= FAN_HALF).map(a => a.s);
          inF.forEach(x => hits[x].push('扇')); if (s === me && inF.length > 1) hurt(`${k}回目：扇に味方を巻き込んだ`);
          efx.push({ k:'fan', t:S.t, q:c, dir });
        }
      });
      // 偶数回：未来／過去の終焉の円（ケフカに近い4人）＋分身
      if (k % 2 === 0){
        const j = k / 2 - 1, near = all.slice().sort((a, b) => Math.hypot(a.q.x, a.q.z) - Math.hypot(b.q.x, b.q.z)).slice(0, 4);
        const want = SLOTS.filter(s => relSpot(k, s) === EVEN.fan1 || relSpot(k, s) === EVEN.fan2 || relSpot(k, s) === EVEN.takeL || relSpot(k, s) === EVEN.takeR);
        if (near.some(n => !want.includes(n.s))) hurt(`${k}回目：未来過去の分身が ${near.filter(n => !want.includes(n.s)).map(n => n.s).join('・')} に飛んだ（誘導の位置が違う）`);
        near.forEach(n => { all.filter(a => dist(a.q, n.q) <= FP_R).forEach(a => hits[a.s].push('未来過去の円')); FXK.holy(n.q.x, n.q.z, FP_R); fxAdd('burst', n.q.x, n.q.z, { r:FP_R, cols:FXC.magenta, dur:.5 }); });
        near.forEach((n, i) => { if (i === p.cloneSkip[j]) return; const d = Math.hypot(n.q.x, n.q.z) || 1; clones.push({ x:n.q.x / d * CLONE_D, z:n.q.z / d * CLONE_D, from:S.t, until:T.leg[j] + .6, j }); });
      }
      // 判定（自分のこと・自分のずれが原因のこと）
      const myHits = hits[me];
      if (myHits.length >= 2) hurt(`${k}回目：攻撃を2回受けた（${myHits.join('＋')}）`);
      else if (myHits.includes('円')) hurt(`${k}回目：円に当たった`);
      if (stacks.some(x => x.n < 3)) hurt(`${k}回目：頭割りの人数が足りない`);
      if (SLOTS.some(s => s !== me && hits[s].length >= 2) && myHits.length < 2) hurt(`${k}回目：味方が2回受けた（立ち位置のずれ）`);
      myHits.forEach(h => meHit(h === '頭割り' ? 30000 : 45000, h));
      sfx.big(); fxShake(3, .25);
    };
    // 消滅の脚：詠唱の始まりに、ケフカと分身がランダムな人の方を向く。未来＝前、過去＝後ろの半面
    const legCast = j => {
      const fut = p.fp[j] === 'future';
      const srcs = [{ x:0, z:0 }, ...clones.filter(c => c.j === j)];
      // 実機ではパーティのランダムな誰かを向くが、このツールでは必ず自分を向く（自分が誘導の練習をする）
      srcs.forEach(c => { const tq = S.player; const d = Math.hypot(tq.x - c.x, tq.z - c.z) || 1; legSrc.push({ x:c.x, z:c.z, face:{ x:(tq.x - c.x) / d, z:(tq.z - c.z) / d }, j, fut }); });
    };
    const legHits = (j, q) => legSrc.filter(L => L.j === j).some(L => { const d = (q.x - L.x) * L.face.x + (q.z - L.z) * L.face.z; return L.fut ? d > 0 : d < 0; });
    const legFire = j => {
      // 誘導の正誤：8人が決まった位置（次の塔の立ち位置）にいたら誰かに当たる向き＝誘導が悪い。自分だけ当たった＝自分の立ち位置が違う
      const victims = SLOTS.filter(s => legHits(j, spotAt(s, T.leg[j] - .05)));
      if (victims.length) hurt(`消滅の脚：誘導が悪い（この向きだと ${victims.join('・')} に当たる）`);
      else if (legHits(j, S.player)) hurt(`消滅の脚に当たった（${p.fp[j] === 'future' ? '未来＝前' : '過去＝後ろ'}、立ち位置が違う）`);
      vfx.add('leg', { srcs:legSrc.filter(L => L.j === j), hit:q => legHits(j, q) }); sfx.big(); fxShake(5, .35); // 当たる半面の床がえぐれてひびが走る
    };

    const events: [number, () => void][] = [
      ...(p.withEmb ? [[T.emb, () => {
        const tanks = ['MT', 'ST'].map(pos), c = { x:(tanks[0].x + tanks[1].x) / 2, z:(tanks[0].z + tanks[1].z) / 2 };
        if (roleOf(me) === 'T'){
          if (dist(pos('MT'), pos('ST')) > EMB_R) hurt('終末の双腕：タンク2人で重なっていない'); // 軽減のボタンはまだない（P2 のタンクのボタンは攻撃だけ）
        } else if (dist(S.player, c) <= EMB_R) hurt('終末の双腕（タンクの頭割り）に入った');
        vfx.add('emb', { q:c, r:EMB_R }); sfx.big();
      }]] : []),
      [T.fors, () => { healerHit(60000, 'ミッシング'); screenFx('forsaken'); sfx.big(); fxShake(4, .3); }],
      ...T.tower.flatMap((tt, i) => [[tt, () => towerSnap(i + 1)], [tt + HIT, () => spellFire(i + 1)]]),
      ...T.leg.flatMap((lt, j) => [[lt - LEG_LEN, () => legCast(j)], [lt, () => legFire(j)]]),
      [T.loj, () => {
        if (mySoaks < 4) hurt('裁きの光：スペルハザードが残っていた');
        healerHit(70000, '裁きの光'); screenFx('judgment'); sfx.big(); fxShake(6, .5);
      }],
    ].sort((a, b) => a[0] - b[0]);

    const towerVisible = k => {
      const from = k === 1 ? T.fors + 1.2 : T.tower[k - 2] + HIT + .4;
      return S.t >= from && S.t < T.tower[k - 1] + HIT;
    };
    const ROLE_COL = { T:'#3a6ad8', H:'#3aa84e', D:'#d8404e' };
    // 担当の文字（3×5）
    const FONT = { M:'101111111101101', T:'111010010010010', S:'011100010001110', H:'101101111101101', D:'110101101101110',
      1:'010110010010111', 2:'110001010100111', 3:'110001010001110', 4:'101101111001001' };
    const markOf = (s, t) => { const L = given.filter(x => x.k === s && x.t <= t); const last = L[L.length - 1]; return last && t < last.t + MARK_SHOW ? last.mark : null; };
    const DIGIT = { 1:'010110010010111', 2:'110001010100111', 3:'110001010001110', 4:'101101111001001', 5:'111100110001110', 6:'011100110101010', 7:'111001010010010', 8:'010101010101010', 9:'010101011001110' };
    const drawNum = (X, Y, n) => { const g = DIGIT[n]; if (!g) return; rect(X - 3, Y - 4, 7, 9, '#101830'); for (let i = 0; i < 15; i++) if (g[i] === '1') rect(X - 1 + (i % 3), Y - 2 + (i / 3 | 0), 1, 1, '#ffffff'); };
    const drawMark = (q, kind) => { const c = markCanvas(kind); ctx.drawImage(c, px(q.x) - 8, px(q.z) - 23, 16, 16); }; // 頭のすぐ上（タイルの上端に接する）

    return {
      bossArt:'god', bossR:6, // ゴッドケフカのターゲットサークル（ヤーンの図から測ると 6 くらい）
      start: { ...(p.withEmb ? embSpot(me) : standby(me)) }, // ミッシングだけのときは、最初から整列している
      intro:`あなたは ${me}（${p.method === 'south' ? '南調整' : '優先順'}）`, // 先に塔か後に塔かは予兆が付くまで分からないので出さない（ユーザーの指摘 2026-10-14）
      end:T.end,
      casts:[
        ...(p.withEmb ? [{ name:'終末の双腕', start:T.embCast, len:T.emb - T.embCast }] : []),
        { name:'ミッシング', start:T.forsCast, len:T.fors - T.forsCast },
        ...T.fp.map((f, j) => ({ name:p.fp[j] === 'future' ? '未来の終焉' : '過去の終焉', start:f - FP_LEN, len:FP_LEN })),
        ...T.leg.map(l => ({ name:'消滅の脚', start:l - LEG_LEN, len:LEG_LEN })),
        { name:'裁きの光', start:T.lojCast, len:T.loj - T.lojCast },
      ],
      progress: t => {
        const n = T.tower.findIndex(x => t < x + HIT);
        return t < T.fors ? (p.withEmb ? '終末の双腕・ミッシング' : 'ミッシング') : n >= 0 ? `塔 ${n + 1}／8` : t < T.loj ? '最後の消滅の脚・裁きの光' : '終了';
      },
      status(t){
        const s = [];
        if (t >= T.fors && t < T.loj + .5 && mySoaks < 4) s.push({ img:spellTroubleUrl(4 - mySoaks), name:`スペルハザード（残り${4 - mySoaks}）`, sec:'' });
        if (vuln()) s.push({ art:'magicVuln', name:'被魔法ダメージ増加', sec:Math.max(1, Math.ceil(vulnUntil - t)) });
        return s;
      },
      tick(t){
        const dt = Math.max(0, t - lastT); lastT = t;
        bots.forEach(b => {
          // P2 通し：最後の消滅の脚でみんなが集まったあと、味方は自分に重なって消える（P3 からは味方を出さない。ユーザー 2026-10-17）
          const g = merging(t) ? S.player : botGoal(b.k, t), d = dist(b, g), step = (merging(t) ? 12 : BOT_SPEED) * dt;
          if (d > .05){ const k = Math.min(1, step / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; }
        });
        events.forEach(([et, fn], i) => { if (t >= et) once('e' + i, fn); });
      },
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      screenBg: t => bgImg(!(t >= T.fors && t < T.loj)), // ミッシング前と裁きの光のあとは金色、そのあいだは赤白のうず
      drawFloor(t){
        clearOutside();
        // 塔：床の青い輪
        T.tower.forEach((_, i) => {
          const k = i + 1; if (!towerVisible(k)) return;
          towersOf(k).forEach(c => { const X = px(c.x), Z = px(c.z), R = Math.round(TOWER_R * PPY);
            alpha(.22, () => disc(X, Z, R, '#3ab8ff')); ring(X, Z, R, '#7ad8ff'); ring(X, Z, R - 1, '#7ad8ff'); ring(X, Z, R - 4, '#3a78c8'); });
        });
      },
      draw(t){
        // 塔の上の青い球（大きく明るく、中に白い雷の筋。実機の動画）。着弾の寸前はフィールドが白く光る
        T.tower.forEach((_, i) => { if (t >= T.tower[i] - .3 && t < T.tower[i]) fieldWhite((t - T.tower[i] + .3) / .3); });
        if (p.withEmb && t >= T.embCast && t < T.emb){ const a = pos('MT'), b = pos('ST'); embTell({ x:(a.x + b.x) / 2, z:(a.z + b.z) / 2 }, EMB_R); }
        T.tower.forEach((_, i) => { const k = i + 1; if (!towerVisible(k)) return;
          towersOf(k).forEach(c => { const X = px(c.x), Z = px(c.z) - 6 - Math.round(Math.sin(t * 3 + i) * 1.5); towerOrb(X, Z, t * 2 + i);
            // 着弾までの秒数（球の上）
            const sec = Math.ceil(T.tower[i] - t); if (sec > 0 && sec < 10) drawNum(X, Z - 16, sec); }); });
        // 分身（紫の輪）と、消滅の脚の向き
        clones.filter(c => t >= c.from && t < c.until).forEach(c => { const X = px(c.x), Z = px(c.z); alpha(.35, () => disc(X, Z, 9, '#b05aff')); ring(X, Z, 9, '#d08cff'); ring(X, Z, 8, '#d08cff'); });
        legSrc.filter(L => t >= T.leg[L.j] - LEG_LEN && t < T.leg[L.j]).forEach(L => {
          const kef = L.x === 0 && L.z === 0, X = px(L.x), Z = px(L.z), r = kef ? Math.round(8 * PPY) + 6 : 12, col = kef ? '#ff5aa8' : '#ff8af0';
          for (let i = 0; i < 5; i++){ const tx = X + L.face.x * (r - i), tz = Z + L.face.z * (r - i); line(tx - L.face.z * i, tz + L.face.x * i, tx + L.face.z * i, tz - L.face.x * i, col); }
        });
        // 自前の演出：扇・消滅の脚
        efx.forEach(e => {
          const age = t - e.t; if (age < 0 || age > .5) return;
          if (e.k === 'fan'){
            alpha(.5 * (1 - age / .5), () => { const X = px(e.q.x), Z = px(e.q.z), R = FAN_LEN * PPY; ctx.fillStyle = '#ff9a3a';
              for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1){ if (dx * dx + dy * dy > R * R) continue; const a = Math.atan2(dx, -dy); if (Math.abs(((a - e.dir) * 180 / Math.PI + 540) % 360 - 180) <= FAN_HALF) ctx.fillRect(X + dx, Z + dy, 1, 1); } });
          }
        });
        vfx.draw(t);
        // 味方
        bots.filter(b => botShown(b, t)).forEach(b => {
          const X = px(b.x), Z = px(b.z);
          rect(X - 6, Z - 4, 13, 9, P.white); rect(X - 5, Z - 3, 11, 7, ROLE_COL[roleOf(b.k)]);
          [...b.k].forEach((ch, i) => { const g = FONT[ch]; for (let n = 0; n < 15; n++) if (g[n] === '1') rect(X - 4 + i * 4 + (n % 3), Z - 2 + (n / 3 | 0), 1, 1, P.white); });
        });
        // 頭上の予兆（自分も）
        SLOTS.forEach(s => { const m = markOf(s, t); if (m) drawMark(pos(s), m); });
      },
      // テスト用（?debug）：担当の位置
      _spotAt: spotAt, _plan: plan, _A: A, _me: me, _bots: bots,
    };
  },
};

export { P2M, clearOutside, bgImg, markCanvas };
