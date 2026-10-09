// @ts-nocheck
import { mySlot } from './jobs.js';
import { S, shuffle, pick } from './state.js';
import { healerHit } from './action.js';
import { sfx } from './audio.js';
import { FXC, fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px } from './gfx.js';
import { floorImg, bgImg } from './mech_p2m.js';

// =====================================================================
// P2（ゴッドケフカ）：トライン（裁きの光 〜 終末の双腕）。docs/dmu/research-p2.md §3
// 時刻は cactbot のタイムライン 436.1 秒（裁きの光の詠唱の始まり）を 0 とする
// 三角は外周6か所（中心から 15.3、60 度おき）＋中央。1回目＝外周3つ、2回目＝外周1つ、3回目＝中央＋外周2つ。降った順に2秒おきに頂点3か所から円
// 安地（ヤーン）：ヒーラー・DPS は南 → 東、タンクは北 → 西の順に、1回目に降った三角の中へ。途中で破壊の翼（光る翼の側の半面）をよける
// 破壊の翼（強攻撃）：一番近い人と一番遠い人。MT はボスの近く、ST は最外周、ほかは外周（最外周より内）
// 大きさ（三角の中心から頂点 6、頂点の円 半径5）は図からの推定
// =====================================================================
const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
const T = { lojCast:0, loj:5.0, trineCast:12.2, trine:16.2, spawn:[16.7, 18.7, 20.7], det:[29.1, 31.1, 33.1],
  wingCast:18.3, wing:23.3, tbCast:29.1, tb:33.4, embCast:35.6, emb:40.6, end:42.2 };
const OUT_ANG = [11, 71, 131, 191, 251, 311], OUT_R = 15.3, TRI = 6, CIR = 5, EMB_R = 3, BOT_SPEED = 24;
const at = (deg, r) => ({ x:Math.sin(deg * Math.PI / 180) * r, z:-Math.cos(deg * Math.PI / 180) * r }); // 北0・時計回り
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const add = (a, b) => ({ x:a.x + b.x, z:a.z + b.z });
const roleOf = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];
const OFF = k => at(SLOTS.indexOf(k) * 45 + 22.5, .7);
const angOf = q => (Math.atan2(q.x, -q.z) * 180 / Math.PI + 360) % 360;

const P2T = {
  id:'p2t', name:'トライン', sub:'裁きの光〜終末の双腕（ヤーン）', view:24, start:{ x:0, z:2 }, slots:true,
  gen(){
    const order = shuffle([0, 1, 2, 3, 4, 5]);
    return { me:mySlot(), sets:[order.slice(0, 3), [order[3]], [order[4], order[5], -1]], centerHead:pick([90, 270]), wingLeft:Math.random() < .5 };
  },
  create(p){
    const me = p.me;
    // ---- 三角（-1 は中央） ----
    const tri = (i, set) => {
      const c = i < 0 ? { x:0, z:0 } : at(OUT_ANG[i], OUT_R), head = i < 0 ? p.centerHead : OUT_ANG[i] + 180; // 外周の三角は中心を向く
      return { i, set, c, v:[0, 120, 240].map(d => add(c, at(head + d, TRI))) };
    };
    const TRIS = p.sets.flatMap((L, s) => L.map(i => tri(i, s)));
    const circlesOf = sets => TRIS.filter(t => sets.includes(t.set)).flatMap(t => t.v);
    const safeFrom = (q, sets, m = .6) => circlesOf(sets).every(v => dist(q, v) > CIR + m) && Math.hypot(q.x, q.z) < 19.3;
    // ---- 安地：1回目の三角を、ヒーラー・DPS は南から反時計回り（南 → 東）、タンクは北から反時計回り（北 → 西）に探す ----
    const sweep = (from, skip) => TRIS.filter(t => t.set === 0 && t !== skip).sort((a, b) => ((from - OUT_ANG[a.i] + 360) % 360) - ((from - OUT_ANG[b.i] + 360) % 360))[0];
    const partyT = sweep(210), tankT = sweep(30, partyT);
    // 三角の中で、あとの三角の円が来ない所（ふつうは三角の中心）
    const safeIn = (t, sets) => {
      if (safeFrom(t.c, sets)) return t.c;
      let best = t.c, bd = 99;
      for (let r = .5; r <= 4; r += .5) for (let a = 0; a < 360; a += 15){ const q = add(t.c, at(a, r)); if (safeFrom(q, sets) && r < bd){ bd = r; best = q; } }
      return best;
    };
    const partySpot = safeIn(partyT, [0, 1, 2]), tankSpot = safeIn(tankT, [0]);
    // MT：1回目の爆発のあと、2・3回目の円が来ないボスに近い所。ST：最外周で、2・3回目の円が来ない所（タンクの三角の方向に近い順）
    const tankDir = OUT_ANG[tankT.i], off = q => Math.abs((angOf(q) - tankDir + 540) % 360 - 180); // タンクの三角の方向からのずれ
    const ringSpots = (d, m) => [...Array(72)].map((_, k) => at(k * 5, d)).filter(q => safeFrom(q, [1, 2], m)).sort((a, b) => off(a) - off(b));
    let mtSpot = null;
    for (let d = 6; d <= 12 && !mtSpot; d += .5) mtSpot = ringSpots(d, .6)[0] || null;
    mtSpot = mtSpot || at(tankDir, 8);
    const stSpot = ringSpots(18.8, .4)[0] || at(tankDir, 18.8);
    // 破壊の翼（半面）：光る翼の側。ケフカは北を向いているので、左の翼＝西、右の翼＝東
    const hitSide = p.wingLeft ? -1 : 1;
    const wingSafe = q => q.x * hitSide < -1 ? q : { x:-hitSide * 2.5, z:Math.max(-17, Math.min(17, q.z)) };
    // ---- 道のり ----
    const center = s => add({ x:0, z:3 }, at(SLOTS.indexOf(s) * 45, 2));
    const route = s => {
      const t = roleOf(s) === 'T', base = t ? tankSpot : partySpot;
      const w = [{ until:T.wing, spot:add(wingSafe(base), OFF(s)) }, { until:T.det[0] - .1, spot:add(base, OFF(s)) }];
      if (t){ w.push({ until:T.det[0] + .05, spot:add(base, OFF(s)) }); w.push({ until:T.det[1] - .1, spot:s === 'MT' ? mtSpot : stSpot }); w.push({ until:T.tb + .1, spot:s === 'MT' ? mtSpot : stSpot }); }
      else w.push({ until:T.tb + .1, spot:add(base, OFF(s)) });
      const emb = t ? { x:s === 'MT' ? -.6 : .6, z:-9.5 } : add(base, OFF(s)); // 終末の双腕：タンク2人はボスの北で重なる
      w.push({ until:T.emb - .1, spot:emb }, { until:T.end + 9, spot:emb });
      return [{ until:T.spawn[0] + 1.5, spot:center(s) }, ...w];
    };
    const ROUTES = Object.fromEntries(SLOTS.map(s => [s, route(s)]));
    const spotAt = (s, t) => (ROUTES[s].find(w => t < w.until) ?? ROUTES[s][ROUTES[s].length - 1]).spot;
    const botGoal = (s, t) => {
      const R = ROUTES[s], n = R.findIndex(w => t < w.until);
      if (n < 0) return R[R.length - 1].spot;
      if (n === 0) return R[0].spot;
      return t >= R[n].until - dist(R[n - 1].spot, R[n].spot) / BOT_SPEED - .05 ? R[n].spot : R[n - 1].spot;
    };
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...center(k) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);
    // ---- 判定 ----
    let lastT = 0;
    const fired = new Set();
    const events: [number, () => void][] = [
      [T.loj, () => { healerHit(70000, '裁きの光'); fxFlash('#fff4c0', .7, .35); sfx.big(); fxShake(6, .5); }],
      ...T.det.map((dt, s) => [dt, () => {
        const vs = circlesOf([s]);
        if (vs.some(v => dist(S.player, v) <= CIR)) hurt(`トライン ${s + 1}回目の爆発に当たった`);
        vs.forEach(v => { fxAdd('burst', v.x, v.z, { r:CIR, cols:FXC.flare, dur:.5 }); fxParts(6, v.x, v.z, { cols:FXC.fire, speed:6, up:6, life:.5, spread:CIR }); });
        sfx.boom(); fxShake(3, .25);
      }] as [number, () => void]),
      [T.wing, () => {
        if (S.player.x * hitSide > 0) hurt(`破壊の翼（${p.wingLeft ? '左' : '右'}の翼が光った側の半面）に当たった`);
        fxFlash('#ffffff', .4, .2); sfx.big(); fxShake(4, .3);
      }],
      [T.tb, () => {
        const all = SLOTS.map(s => ({ s, d:Math.hypot(pos(s).x, pos(s).z) })).sort((a, b) => a.d - b.d), near = all[0].s, far = all[7].s;
        if (me === 'MT' && near !== 'MT') hurt('破壊の翼（強攻撃）：MT がいちばん近くにいなかった');
        else if (me === 'ST' && far !== 'ST') hurt('破壊の翼（強攻撃）：ST がいちばん遠くにいなかった');
        else if (roleOf(me) !== 'T' && (near === me || far === me)) hurt('破壊の翼（強攻撃）を受けた（近すぎ・遠すぎ）');
        [near, far].forEach(k => { const q = pos(k); fxAdd('burst', q.x, q.z, { r:2.5, cols:FXC.flare, dur:.45 }); });
        sfx.big();
      }],
      [T.emb, () => {
        const c = { x:(pos('MT').x + pos('ST').x) / 2, z:(pos('MT').z + pos('ST').z) / 2 };
        if (roleOf(me) === 'T'){ if (dist(pos('MT'), pos('ST')) > EMB_R) hurt('終末の双腕：タンク2人で重なっていない'); }
        else if (dist(S.player, c) <= EMB_R) hurt('終末の双腕（タンクの頭割り）に入った');
        fxAdd('burst', c.x, c.z, { r:EMB_R, cols:FXC.flare, dur:.5 }); sfx.big();
      }],
    ].sort((a, b) => a[0] - b[0]);
    const triVisible = t => TRIS.filter(x => t >= T.spawn[x.set] && t < T.det[x.set] + .1);
    const ROLE_COL = { T:'#3a6ad8', H:'#3aa84e', D:'#d8404e' };
    const FONT = { M:'101111111101101', T:'111010010010010', S:'011100010001110', H:'101101111101101', D:'110101101101110',
      1:'010110010010111', 2:'110001010100111', 3:'110001010001110', 4:'101101111001001' };
    return {
      start:{ ...center(me) },
      intro:`あなたは ${me}`,
      end:T.end,
      casts:[
        { name:'裁きの光', start:T.lojCast, len:T.loj - T.lojCast },
        { name:'トライン', start:T.trineCast, len:T.trine - T.trineCast },
        { name:'破壊の翼', start:T.wingCast, len:T.wing - T.wingCast },
        { name:'破壊の翼', start:T.tbCast, len:T.tb - T.tbCast },
        { name:'終末の双腕', start:T.embCast, len:T.emb - T.embCast },
      ],
      progress: t => t < T.loj ? '裁きの光' : t < T.det[2] + .2 ? 'トライン・破壊の翼' : t < T.emb ? '終末の双腕' : '終了',
      tick(t){
        const dt = Math.max(0, t - lastT); lastT = t;
        bots.forEach(b => { const g = botGoal(b.k, t), d = dist(b, g); if (d > .05){ const k = Math.min(1, BOT_SPEED * dt / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; } });
        events.forEach(([et, fn], i) => { if (t >= et && !fired.has(i)){ fired.add(i); fn(); } });
      },
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      // 裁きの光までは赤白のうず、そのあとは床も背景も金色
      screenBg: t => bgImg(t >= T.loj),
      drawFloor(t){
        ctx.clearRect(-40, -40, ctx.canvas.width + 80, ctx.canvas.height + 80); ctx.drawImage(floorImg(t >= T.loj), 0, 0);
        // 三角の頂点の円（茶色の半透明）と、黄色い三角
        triVisible(t).forEach(x => {
          x.v.forEach(v => { alpha(.28, () => disc(px(v.x), px(v.z), Math.round(CIR * PPY), '#5a3a10')); ring(px(v.x), px(v.z), Math.round(CIR * PPY), '#7a4a0c'); });
        });
        triVisible(t).forEach(x => {
          const fall = Math.max(0, 1 - (t - T.spawn[x.set]) / .6); // 降ってくる（上から）
          ctx.globalAlpha = .5; ctx.fillStyle = '#ffe040'; ctx.beginPath();
          x.v.forEach((v, k) => { const X = px(v.x), Z = px(v.z) - Math.round(fall * 40); k ? ctx.lineTo(X, Z) : ctx.moveTo(X, Z); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          x.v.forEach((v, k) => { const w = x.v[(k + 1) % 3]; line(px(v.x), px(v.z) - Math.round(fall * 40), px(w.x), px(w.z) - Math.round(fall * 40), '#fff07a'); });
        });
      },
      draw(t){
        // 破壊の翼（半面）の詠唱中：光る翼（ケフカの横に白い羽）
        if (t >= T.wingCast && t < T.wing){
          const X = px(0), Z = px(0), s = hitSide, blink = (Math.floor(t * 8) & 1) ? '#ffffff' : '#fff4c0';
          for (let i = 0; i < 6; i++) line(X + s * (10 + i * 3), Z - 2 - i * 3, X + s * (28 + i * 2), Z - 12 - i, blink);
        }
        bots.forEach(b => {
          const X = px(b.x), Z = px(b.z);
          rect(X - 6, Z - 4, 13, 9, P.white); rect(X - 5, Z - 3, 11, 7, ROLE_COL[roleOf(b.k)]);
          [...b.k].forEach((ch, i) => { const g = FONT[ch]; for (let n = 0; n < 15; n++) if (g[n] === '1') rect(X - 4 + i * 4 + (n % 3), Z - 2 + (n / 3 | 0), 1, 1, P.white); });
        });
      },
      _spotAt: spotAt, _me: me, _tris: TRIS,
    };
  },
};

export { P2T };
