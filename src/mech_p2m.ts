// @ts-nocheck
import { mySlot } from './jobs.js';
import { S, shuffle, pick } from './state.js';
import { healerHit } from './action.js';
import { sfx } from './audio.js';
import { FXC, FXK, fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px } from './gfx.js';
import { markCanvas, spellTroubleUrl } from './p2icons.js';

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
const T = {
  embCast:3.1, emb:8.1, forsCast:16.3, fors:23.3, mark0:23.8,
  tower:[36.5, 46.4, 57.4, 67.4, 78.5, 88.5, 99.4, 109.4], // 光の波動（塔の判定）。スペルハザードの発動は HIT 秒後
  fp:[45.8, 66.7, 88.0, 108.7],                             // 未来／過去の終焉（詠唱完了。円の着弾は偶数回の塔と同時）
  leg:[57.1, 78.4, 99.2, 120.1],                            // 消滅の脚
  lojCast:124.1, loj:129.1, end:130.6,
};
const HIT = .6, FP_LEN = 6, LEG_LEN = 5, MARK_SHOW = 6;
// ---- 大きさ（推定） ----
const TOWER_R = 4, STACK_R = 5, CIRC_R = 5, FAN_LEN = 16, FAN_HALF = 45, FP_R = 5, KEFKA_R = 7, CLONE_D = 3.2, EMB_R = 3, BOT_SPEED = 24;
// ---- 立ち位置（相対：ケフカが北、塔が南。塔の中心は (±6, 6)） ----
const TOWER_REL = [{ x:-6, z:6 }, { x:6, z:6 }];
const ODD = { stack1:{ x:-4.6, z:5.0 }, fan:{ x:-7.2, z:8.6 }, bait:{ x:-10.5, z:8.0 }, joinL:{ x:-1.4, z:6.4 },
  stack2:{ x:4.4, z:4.4 }, circ:{ x:6.3, z:9.6 }, joinR1:{ x:1.2, z:6.0 }, joinR2:{ x:1.6, z:4.0 } };
const EVEN = { fan1:{ x:-4.4, z:3.8 }, fan2:{ x:4.4, z:3.8 }, circ1:{ x:-6.4, z:9.6 }, circ2:{ x:6.4, z:9.6 },
  baitL:{ x:-10, z:4.0 }, baitR:{ x:10, z:4.0 }, takeL:{ x:-5.6, z:-5.4 }, takeR:{ x:5.6, z:-5.4 } };
const WAIT_PAST = { x:0, z:8.6 }, WAIT_FUTURE = { x:0, z:-8.6 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rot = (q, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x:q.x * c - q.z * s, z:q.x * s + q.z * c }; };
const at = (deg, r) => ({ x:Math.sin(deg * Math.PI / 180) * r, z:-Math.cos(deg * Math.PI / 180) * r }); // 北0・時計回り
const add = (a, b) => ({ x:a.x + b.x, z:a.z + b.z });
const OFF = k => at(SLOTS.indexOf(k) * 45 + 22.5, 1.1); // 固まるときの1人ずつのずれ

const P2M = {
  id:'p2m', name:'ミッシング', sub:'終末の双腕〜裁きの光（ヤーン 優先順）', view:24, start:{ x:-7, z:1 }, slots:true,
  gen(){
    const thStack = pick(TH), dStack = pick(DPS);
    return {
      me:mySlot(), thType:pick(['fan', 'circ']), thStack, dStack,
      theta1:pick([0, 45, 90, 135, 180, 225, 270, 315]), dir:pick([1, -1]),
      fp:[0, 1, 2, 3].map(() => pick(['future', 'past'])),
      cloneSkip:[0, 1, 2, 3].map(() => Math.random() * 4 | 0),
      // 塔を踏んだあとに付く新しい予兆（踏んだ4人に、SLOTS の順で配る）。奇数回の後＝扇2・円2、偶数回の後＝頭割り2・扇1・円1
      newMarks:[1, 2, 3, 4, 5, 6].map(k => shuffle(k % 2 ? ['fan', 'fan', 'circ', 'circ'] : ['stack', 'stack', 'fan', 'circ'])),
    };
  },
  create(p){
    const me = p.me;
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
          if (m === 'stack') return byPrio(g, 'stack', hold).indexOf(s) === 0 ? ODD.stack1 : ODD.stack2;
          return m === 'fan' ? ODD.fan : ODD.circ;
        }
        // 塔を踏まない4人：ヒーラー＝左の扇の誘導、タンク＝左の頭割り、DPS 2人＝右の頭割り
        if (roleOf(s) === 'H') return ODD.bait;
        if (roleOf(s) === 'T') return ODD.joinL;
        return isRanged(s) ? ODD.joinR2 : ODD.joinR1;
      }
      if (g.includes(s)){
        const m = hold[s], i = byPrio(g, m, hold).indexOf(s);
        return m === 'fan' ? (i === 0 ? EVEN.fan1 : EVEN.fan2) : (i === 0 ? EVEN.circ1 : EVEN.circ2);
      }
      // 塔を踏まない4人：遠隔＝扇の誘導（ヒーラー左・DPS 右）、近接＝未来過去の円（タンク左・DPS 右）
      if (roleOf(s) === 'H') return EVEN.baitL;
      if (isRanged(s)) return EVEN.baitR;
      return roleOf(s) === 'T' ? EVEN.takeL : EVEN.takeR;
    };
    // ---- 道のり：「この時刻までにここ」の列（味方は着く時刻がギリギリになるように動き出す） ----
    const embSpot = s => s === 'MT' ? { x:-.6, z:-8.6 } : s === 'ST' ? { x:.6, z:-8.6 } : add({ x:0, z:8 }, OFF(s));
    const standby = s => add({ x:TH.includes(s) ? -7 : 7, z:1 }, OFF(s));
    const route = s => {
      const w = [{ until:T.emb + .3, spot:embSpot(s) }, { until:T.mark0, spot:standby(s) }];
      for (let k = 1; k <= 8; k++){
        const q = abs(relSpot(k, s), k);
        if (k % 2 && k >= 3){
          const j = (k - 1) / 2 - 1, fut = p.fp[j] === 'future';
          w.push({ until:T.leg[j] - LEG_LEN, spot:add(abs(fut ? WAIT_FUTURE : WAIT_PAST, k), OFF(s)) });
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
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...embSpot(k) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);

    // ---- 判定の状態 ----
    let lastT = 0, mySoaks = 0, vulnUntil = -9;
    const fired = new Set();
    const clones = [];   // { x, z, until, face? }
    const legSrc = [];   // 消滅の脚：{ x, z, face, at, fut }
    const efx = [];      // 自前の演出：{ k, t, ... }
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
      towersOf(k).forEach(c => { fxAdd('burst', c.x, c.z, { r:TOWER_R, cols:FXC.holy, dur:.45 }); fxParts(10, c.x, c.z, { cols:FXC.holy, speed:6, up:8, life:.6, spread:TOWER_R }); });
      sfx.boom();
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
      srcs.forEach(c => { const tq = pos(pick(SLOTS)); const d = Math.hypot(tq.x - c.x, tq.z - c.z) || 1; legSrc.push({ x:c.x, z:c.z, face:{ x:(tq.x - c.x) / d, z:(tq.z - c.z) / d }, j, fut }); });
    };
    const legHits = (j, q) => legSrc.filter(L => L.j === j).some(L => { const d = (q.x - L.x) * L.face.x + (q.z - L.z) * L.face.z; return L.fut ? d > 0 : d < 0; });
    const legFire = j => {
      if (legHits(j, S.player)) hurt(`消滅の脚（${p.fp[j] === 'future' ? '未来＝前' : '過去＝後ろ'}）に当たった`);
      efx.push({ k:'leg', t:S.t, j }); sfx.big(); fxShake(5, .35); fxFlash('#ffd8a0', .3, .15);
    };
    const events: [number, () => void][] = [
      [T.emb, () => {
        const tanks = ['MT', 'ST'].map(pos), c = { x:(tanks[0].x + tanks[1].x) / 2, z:(tanks[0].z + tanks[1].z) / 2 };
        if (roleOf(me) === 'T'){
          if (dist(pos('MT'), pos('ST')) > EMB_R) hurt('終末の双腕：タンク2人で重なっていない'); // 軽減のボタンはまだない（P2 のタンクのボタンは攻撃だけ）
        } else if (dist(S.player, c) <= EMB_R) hurt('終末の双腕（タンクの頭割り）に入った');
        FXK.flare(c.x, c.z, EMB_R); sfx.big();
      }],
      [T.fors, () => { healerHit(60000, 'ミッシング'); fxFlash('#ffffff', .45, .2); sfx.big(); fxShake(4, .3); }],
      ...T.tower.flatMap((tt, i) => [[tt, () => towerSnap(i + 1)], [tt + HIT, () => spellFire(i + 1)]]),
      ...T.leg.flatMap((lt, j) => [[lt - LEG_LEN, () => legCast(j)], [lt, () => legFire(j)]]),
      [T.loj, () => {
        if (mySoaks < 4) hurt('裁きの光：スペルハザードが残っていた');
        healerHit(70000, '裁きの光'); fxFlash('#fff4c0', .7, .35); sfx.big(); fxShake(6, .5);
      }],
    ].sort((a, b) => a[0] - b[0]);

    // ---- 床（P2：外側は赤白のうず、床は暗い網目。裁きの光のあとは金色） ----
    const floorCache = {};
    const floorImg = (gold) => {
      const key = PPY + (gold ? 'g' : 'd');
      if (floorCache[key]) return floorCache[key];
      const W = ctx.canvas.width, c = document.createElement('canvas'); c.width = W; c.height = W;
      const g = c.getContext('2d'), C0 = W / 2, R = 20 * PPY;
      g.fillStyle = gold ? '#7a5a10' : '#3a0a14'; g.fillRect(0, 0, W, W);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++){
        const a = Math.atan2(y - C0, x - C0), r = Math.hypot(x - C0, y - C0);
        if (Math.sin(a * 14 + r * .09) > .55){ g.fillStyle = gold ? (r > 150 ? '#c8a040' : '#a88428') : (r > 150 ? '#7a1a2a' : '#5a1020'); g.fillRect(x, y, 1, 1); }
      }
      g.fillStyle = gold ? '#8a6a1a' : '#2c2b44';
      for (let dy = -R; dy <= R; dy++){ const hw = Math.floor(Math.sqrt(R * R - dy * dy)); g.fillRect(C0 - hw, C0 + dy, hw * 2 + 1, 1); }
      g.fillStyle = gold ? '#a8842a' : '#3a3958';
      for (let k = -10; k <= 10; k++){ const o = Math.round(k * 2 * PPY); if (Math.abs(o) >= R) continue; const hw = Math.floor(Math.sqrt(R * R - o * o)); g.fillRect(C0 + o, C0 - hw, 1, hw * 2 + 1); g.fillRect(C0 - hw, C0 + o, hw * 2 + 1, 1); }
      for (let k = 1; k <= 3; k++){ const rr = Math.round(k * 5 * PPY); for (let i = 0; i < 360; i += .5){ const a = i * Math.PI / 180; g.fillRect(Math.round(C0 + Math.cos(a) * rr), Math.round(C0 + Math.sin(a) * rr), 1, 1); } }
      return floorCache[key] = c;
    };
    const towerVisible = k => {
      const from = k === 1 ? T.fors + 1.2 : T.tower[k - 2] + HIT + .4;
      return S.t >= from && S.t < T.tower[k - 1] + HIT;
    };
    const ROLE_COL = { T:'#3a6ad8', H:'#3aa84e', D:'#d8404e' };
    const tileGlyph = { T:'111010010010010', H:'101101111101101', D:'110101101101110' };
    const markOf = (s, t) => { const L = given.filter(x => x.k === s && x.t <= t); const last = L[L.length - 1]; return last && t < last.t + MARK_SHOW ? last.mark : null; };
    const drawMark = (q, kind) => { const c = markCanvas(kind); ctx.drawImage(c, px(q.x) - 10, px(q.z) - 30, 20, 20); };

    return {
      start: { ...embSpot(me) },
      intro:`あなたは ${me}（${A.includes(me) ? '先に塔：1・2・3・8回目' : '後に塔：4・5・6・7回目'}）`,
      end:T.end,
      casts:[
        { name:'終末の双腕', start:T.embCast, len:T.emb - T.embCast },
        { name:'ミッシング', start:T.forsCast, len:T.fors - T.forsCast },
        ...T.fp.map((f, j) => ({ name:p.fp[j] === 'future' ? '未来の終焉' : '過去の終焉', start:f - FP_LEN, len:FP_LEN })),
        ...T.leg.map(l => ({ name:'消滅の脚', start:l - LEG_LEN, len:LEG_LEN })),
        { name:'裁きの光', start:T.lojCast, len:T.loj - T.lojCast },
      ],
      bosses: t => {
        const L = legSrc.filter(x => x.j === T.leg.findIndex(l => t >= l - LEG_LEN && t < l + .4) && x.x === 0 && x.z === 0)[0];
        return [{ id:'kefka', name:'ケフカ', x:0, z:0, r:KEFKA_R, face:L ? L.face : { x:0, z:-1 } }];
      },
      progress: t => {
        const n = T.tower.findIndex(x => t < x + HIT);
        return t < T.fors ? '終末の双腕・ミッシング' : n >= 0 ? `塔 ${n + 1}／8` : t < T.loj ? '最後の消滅の脚・裁きの光' : '終了';
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
          const g = botGoal(b.k, t), d = dist(b, g), step = BOT_SPEED * dt;
          if (d > .05){ const k = Math.min(1, step / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; }
        });
        events.forEach(([et, fn], i) => { if (t >= et) once('e' + i, fn); });
      },
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      drawFloor(t){
        ctx.drawImage(floorImg(t >= T.loj), 0, 0);
        // 塔：床の青い輪
        T.tower.forEach((_, i) => {
          const k = i + 1; if (!towerVisible(k)) return;
          towersOf(k).forEach(c => { const X = px(c.x), Z = px(c.z), R = Math.round(TOWER_R * PPY);
            alpha(.22, () => disc(X, Z, R, '#3ab8ff')); ring(X, Z, R, '#7ad8ff'); ring(X, Z, R - 1, '#7ad8ff'); ring(X, Z, R - 4, '#3a78c8'); });
        });
      },
      draw(t){
        // 塔の上の青い球
        T.tower.forEach((_, i) => { const k = i + 1; if (!towerVisible(k)) return;
          towersOf(k).forEach(c => { const X = px(c.x), Z = px(c.z) - 4 - Math.round(Math.sin(t * 3 + i) * 1.5); disc(X, Z, 6, '#1a4a9a'); disc(X, Z - 1, 5, '#3a8ae8'); disc(X - 2, Z - 3, 2, '#c8f0ff'); }); });
        // 分身（紫の輪）と、消滅の脚の向き
        clones.filter(c => t >= c.from && t < c.until).forEach(c => { const X = px(c.x), Z = px(c.z); alpha(.35, () => disc(X, Z, 9, '#b05aff')); ring(X, Z, 9, '#d08cff'); ring(X, Z, 8, '#d08cff'); });
        legSrc.filter(L => t >= T.leg[L.j] - LEG_LEN && t < T.leg[L.j]).forEach(L => {
          if (L.x === 0 && L.z === 0) return; // ケフカの向きはターゲットサークルの三角
          const X = px(L.x), Z = px(L.z); for (let i = 0; i < 4; i++){ const tx = X + L.face.x * (12 - i), tz = Z + L.face.z * (12 - i); line(tx - L.face.z * i, tz + L.face.x * i, tx + L.face.z * i, tz - L.face.x * i, '#ff8af0'); }
        });
        // 自前の演出：扇・消滅の脚
        efx.forEach(e => {
          const age = t - e.t; if (age < 0 || age > .5) return;
          if (e.k === 'fan'){
            alpha(.5 * (1 - age / .5), () => { const X = px(e.q.x), Z = px(e.q.z), R = FAN_LEN * PPY; ctx.fillStyle = '#ff9a3a';
              for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1){ if (dx * dx + dy * dy > R * R) continue; const a = Math.atan2(dx, -dy); if (Math.abs(((a - e.dir) * 180 / Math.PI + 540) % 360 - 180) <= FAN_HALF) ctx.fillRect(X + dx, Z + dy, 1, 1); } });
          } else if (e.k === 'leg'){
            alpha(.4 * (1 - age / .5), () => { ctx.fillStyle = '#ffb040'; const R = 20 * PPY, C0 = px(0);
              for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2){ if (dx * dx + dy * dy > R * R) continue; if (legHits(e.j, { x:dx / PPY, z:dy / PPY })) ctx.fillRect(C0 + dx, C0 + dy, 2, 2); } });
          }
        });
        // 味方
        bots.forEach(b => {
          const X = px(b.x), Z = px(b.z), r = roleOf(b.k);
          rect(X - 4, Z - 4, 9, 9, P.white); rect(X - 3, Z - 3, 7, 7, ROLE_COL[r]);
          const g = tileGlyph[r]; for (let i = 0; i < 15; i++) if (g[i] === '1') rect(X - 1 + (i % 3), Z - 2 + (i / 3 | 0), 1, 1, P.white);
        });
        // 頭上の予兆（自分も）
        SLOTS.forEach(s => { const m = markOf(s, t); if (m) drawMark(pos(s), m); });
      },
      // テスト用（?debug）：担当の位置
      _spotAt: spotAt, _plan: plan, _A: A, _me: me,
    };
  },
};

export { P2M };
