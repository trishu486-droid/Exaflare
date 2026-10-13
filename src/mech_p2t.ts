// @ts-nocheck
import { mySlot } from './jobs.js';
import { S, shuffle, pick } from './state.js';
import { healerHit } from './action.js';
import { sfx } from './audio.js';
import { FXC, fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, ctx, alpha, disc, ring, rect, line, hurt, px } from './gfx.js';
import { clearOutside, bgImg } from './mech_p2m.js';
import { screenFx } from './p2fx.js';

// =====================================================================
// P2（ゴッドケフカ）：トライン（裁きの光 〜 終末の双腕）。docs/dmu/research-p2.md §3
// 時刻は cactbot のタイムライン 436.1 秒（裁きの光の詠唱の始まり）を 0 とする
// 三角は外周6か所（中心から 15.3、60 度おき）＋中央。1回目＝外周3つ、2回目＝外周1つ、3回目＝中央＋外周2つ。降った順に2秒おきに頂点3か所から円
// 処理（ヤーン・2026-10-13 ユーザーの指摘で作り直し）：最初は中央が安全。破壊の翼（半面）を中央でよけ、1回目の外周が爆発したらその三角の方へ入って
//   2・3回目（中央を含む）をよける。パーティは南 → 東、タンクは北 → 西を優先した1回目の三角の方向
// 破壊の翼（強攻撃）：一番近い人と一番遠い人（タンク2人。北側を使う）。範囲が広い
// 大きさ（三角の中心から頂点 6、頂点の円 半径5）は図からの推定
// =====================================================================
const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
const T_BASE = { lojCast:0, loj:5.0, trineCast:12.2, trine:16.2, spawn:[16.7, 18.7, 20.7], det:[29.1, 31.1, 33.1],
  wingCast:18.3, wing:23.3, tbCast:29.1, tb:33.4, embCast:35.6, emb:40.6, end:42.2 };
// 三角：一辺 10（中心から頂点 5.77）、向きは東か西だけ。頂点の爆発は半径 6（Splatoon のスクリプトの値）。立ち位置は 6.4 離す
const OUT_ANG = [11, 71, 131, 191, 251, 311], OUT_R = 15.275, CIR = 6, CLEAR = 6.4, EMB_R = 3, BOT_SPEED = 24;
const TB_R = 8; // 破壊の翼（強攻撃）の範囲。資料に数字がないので、ユーザーがくれた実機の画像（黒紫の大きな円）から推定（半径 8〜9 くらい）
const TRI_OFF = [[5.75, 0], [-3, 5], [-3, -5]]; // 東向きの三角の頂点（中心から）。西向きは x を逆に
// 降る順のパターン（cactbot のコメントにある4つ。OUT_ANG の番号）。3回目は必ず中央も
const PATTERNS = [
  [[5, 3, 0], [2], [4, 1]],
  [[2, 3, 1], [0], [4, 5]],
  [[3, 2, 1], [5], [4, 0]],
  [[0, 3, 5], [1], [4, 2]],
];
const at = (deg, r) => ({ x:Math.sin(deg * Math.PI / 180) * r, z:-Math.cos(deg * Math.PI / 180) * r }); // 北0・時計回り
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const add = (a, b) => ({ x:a.x + b.x, z:a.z + b.z });
const roleOf = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];
const OFF = k => at(SLOTS.indexOf(k) * 45 + 22.5, .7);
const angOf = q => (Math.atan2(q.x, -q.z) * 180 / Math.PI + 360) % 360;

const P2T = {
  id:'p2t', name:'トライン', sub:'', view:24, start:{ x:0, z:2 }, slots:true,
  gen(){
    const pt = pick(PATTERNS);
    return { me:mySlot(), sets:[pt[0], pt[1], [...pt[2], -1]], centerHead:pick([1, -1]), wingLeft:Math.random() < .5 };
  },
  create(p){
    // トラインだけの練習は、トラインの詠唱の1秒前から（裁きの光は P2 通しのときだけ。p.withLoj）。時刻をまとめてずらす
    const SH = p.withLoj ? 0 : T_BASE.trineCast - 1;
    const T = Object.fromEntries(Object.entries(T_BASE).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => x - SH) : v - SH]));
    const me = p.me;
    // ---- 三角（-1 は中央） ----
    const tri = (i, set) => {
      // 向き：中央はくじ。外周は中心の側を向く（西側の三角は東向き、東側は西向き）※推定
      const c = i < 0 ? { x:0, z:0 } : at(OUT_ANG[i], OUT_R), e = i < 0 ? p.centerHead : (c.x < 0 ? 1 : -1);
      return { i, set, c, v:TRI_OFF.map(([x, z]) => ({ x:c.x + x * e, z:c.z + z })) };
    };
    const TRIS = p.sets.flatMap((L, s) => L.map(i => tri(i, s)));
    const circlesOf = sets => TRIS.filter(t => sets.includes(t.set)).flatMap(t => t.v);
    const safeFrom = (q, sets, m = CLEAR - CIR + .8) => circlesOf(sets).every(v => dist(q, v) > CIR + m) && Math.hypot(q.x, q.z) < 19.3;
    // ---- 立ち位置（ヤーン。Splatoon の P2_Trine_Beta の「ヤーン速報 方角優先」と同じ考え方） ----
    // ① 最初は中央が必ず安全（中央の三角は3回目）。破壊の翼（半面）は全員で中央から 3 ずれた安全な側で待つ
    // ② 1回目（外周3つ）が爆発したら、その三角の方へ入る（もう爆発しない）。2回目・3回目（中央を含む）はここでよける。外周で2回よけたりはしない
    //    パーティは1回目の三角のうち南 → 東を優先した方向に中心から 14。タンクは北 → 西を優先した方向（パーティと別）に MT 7.5・ST 17
    // ③ そのまま破壊の翼（強攻撃）：一番近い人（MT）と一番遠い人（ST）。範囲が広いので、ほかの人はタンクから離れている
    const hitSide = p.wingLeft ? -1 : 1; // 破壊の翼（半面）：光る翼の側。ケフカは北を向いているので、左の翼＝西、右の翼＝東
    const unitOf = q => { const d = Math.hypot(q.x, q.z) || 1; return { x:q.x / d, z:q.z / d }; };
    const first = TRIS.filter(t => t.set === 0);
    const byPriority = (list, dirs) => [...list].sort((a, b) => { for (const d of dirs){ const da = unitOf(a.c).x * d.x + unitOf(a.c).z * d.z, db = unitOf(b.c).x * d.x + unitOf(b.c).z * d.z; if (Math.abs(da - db) > .05) return db - da; } return 0; })[0];
    const S_ = { x:0, z:1 }, E_ = { x:1, z:0 }, N_ = { x:0, z:-1 }, W_ = { x:-1, z:0 };
    const partyT = byPriority(first, [S_, E_]), tankT = byPriority(first.filter(t => t !== partyT), [N_, W_]);
    // 方向 dir・中心からの距離 r のあたり（±5、向きのずれ 32° まで）で、2・3回目の爆発から 6.4 離れた一番近い所（Splatoon と同じ探し方）
    const dirSafe = (dir, r, ok = (q: { x: number, z: number }) => true) => {
      const u = unitOf(dir), n = { x:-u.z, z:u.x }, want = { x:u.x * r, z:u.z * r };
      let best = null, bd = 1e9;
      for (let dr = -5; dr <= 5; dr += .25) for (let dl = -5; dl <= 5; dl += .25){
        const q = { x:want.x + u.x * dr + n.x * dl, z:want.z + u.z * dr + n.z * dl }, qu = unitOf(q);
        if (qu.x * u.x + qu.z * u.z < Math.cos(32 * Math.PI / 180) || Math.hypot(q.x, q.z) > 19) continue;
        if (!circlesOf([1, 2]).every(v => dist(q, v) >= CLEAR) || !ok(q)) continue;
        const d = dist(q, want); if (d < bd){ bd = d; best = q; }
      }
      return best || want;
    };
    const partySpot = dirSafe(partyT.c, 14), mtSpot = dirSafe(tankT.c, 7.5), stSpot = dirSafe(tankT.c, 18.5, q => dist(q, mtSpot) > TB_R + .5); // ST は最外周寄り（MT の範囲に入らないように）
    // 半面よけ・1回目の爆発を待つ所：中央から安全な側へ 3（1回目の円が来ないことを確かめる）
    const waitSpot = (() => { const q = { x:-hitSide * 3, z:0 }; if (circlesOf([0]).every(v => dist(q, v) >= CLEAR)) return q; for (let r = .5; r <= 4; r += .5) for (let a = 0; a < 360; a += 15){ const c = add(q, at(a, r)); if (c.x * hitSide < -.5 && circlesOf([0]).every(v => dist(c, v) >= CLEAR)) return c; } return q; })();
    // ---- 道のり ----
    const center = s => add({ x:0, z:3 }, at(SLOTS.indexOf(s) * 45, 2));
    const route = s => {
      const t = roleOf(s) === 'T', o = t ? { x:0, z:0 } : OFF(s), fin = s === 'MT' ? mtSpot : s === 'ST' ? stSpot : add(partySpot, o);
      const emb = t ? { x:s === 'MT' ? -.6 : .6, z:-9.5 } : add(partySpot, o); // 終末の双腕：タンク2人はボスの北で重なる
      return [
        { until:T.spawn[0] + 1.5, spot:center(s) },
        { until:T.det[0] + .05, spot:add(waitSpot, OFF(s)) },     // 半面よけ〜1回目の爆発まで、中央の安全な側
        { until:T.det[1] - .1, spot:fin },                        // 1回目が爆発したら、その三角の方へ（2回目の爆発の前に着く）
        { until:T.tb + .1, spot:fin },                            // 3回目（中央）の爆発と強攻撃をここで
        { until:T.emb - .1, spot:emb }, { until:T.end + 9, spot:emb },
      ];
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
      ...(p.withLoj ? [[T.loj, () => { healerHit(70000, '裁きの光'); screenFx('judgment'); sfx.big(); fxShake(6, .5); }]] : []),
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
        // 範囲は広い（半径 TB_R・推定）。タンク以外がタンクのまわりにいると巻き込まれる
        if (roleOf(me) !== 'T' && near !== me && far !== me && [near, far].some(k => dist(pos(k), S.player) <= TB_R)) hurt('破壊の翼（強攻撃）の範囲に巻き込まれた');
        if (roleOf(me) === 'T' && [near, far].some(k => k !== me && dist(pos(k), S.player) <= TB_R)) hurt('破壊の翼（強攻撃）：もう1人のタンクの範囲に入った');
        [near, far].forEach(k => { const q = pos(k); fxAdd('burst', q.x, q.z, { r:TB_R, cols:FXC.flare, dur:.5 }); });
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
      bossR:6,
      start:{ ...center(me) },
      intro:`あなたは ${me}`,
      end:T.end,
      casts:[
        ...(p.withLoj ? [{ name:'裁きの光', start:T.lojCast, len:T.loj - T.lojCast }] : []),
        { name:'トライン', start:T.trineCast, len:T.trine - T.trineCast },
        { name:'破壊の翼', start:T.wingCast, len:T.wing - T.wingCast },
        { name:'破壊の翼', start:T.tbCast, len:T.tb - T.tbCast },
        { name:'終末の双腕', start:T.embCast, len:T.emb - T.embCast },
      ],
      progress: t => p.withLoj && t < T.loj ? '裁きの光' : t < T.det[2] + .2 ? 'トライン・破壊の翼' : t < T.emb ? '終末の双腕' : '終了',
      tick(t){
        const dt = Math.max(0, t - lastT); lastT = t;
        bots.forEach(b => { const g = botGoal(b.k, t), d = dist(b, g); if (d > .05){ const k = Math.min(1, BOT_SPEED * dt / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; } });
        events.forEach(([et, fn], i) => { if (t >= et && !fired.has(i)){ fired.add(i); fn(); } });
      },
      safeActive: () => true,
      safe(x, z, t){ return dist({ x, z }, spotAt(me, t)) <= 1.2; },
      guide(t){ const g = spotAt(me, t); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      // 背景：裁きの光までは赤白のうず、そのあとは金色（ステージはいつもの暗い床）
      screenBg: t => bgImg(t >= T.loj),
      drawFloor(t){
        clearOutside();
        // 黄色い三角（頂点の爆発の範囲は、実機どおり爆発するまで出さない）
        triVisible(t).forEach(x => {
          const fall = Math.max(0, 1 - (t - T.spawn[x.set]) / .6); // 降ってくる（上から）
          ctx.globalAlpha = .5; ctx.fillStyle = '#ffe040'; ctx.beginPath();
          x.v.forEach((v, k) => { const X = px(v.x), Z = px(v.z) - Math.round(fall * 40); k ? ctx.lineTo(X, Z) : ctx.moveTo(X, Z); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          x.v.forEach((v, k) => { const w = x.v[(k + 1) % 3]; line(px(v.x), px(v.z) - Math.round(fall * 40), px(w.x), px(w.z) - Math.round(fall * 40), '#fff07a'); });
        });
      },
      draw(t){
        // 破壊の翼（半面）の詠唱中：攻撃が来る側の半面に、白〜桃色の光の筋が差し込む（実機の翼の光に寄せる。翼の絵は描かない）
        if (t >= T.wingCast && t < T.wing + .3){
          const k = Math.min(1, (t - T.wingCast) / (T.wing - T.wingCast)), C0 = px(0), R = 20 * PPY, s = hitSide;
          alpha(.06 + .14 * k, () => { ctx.fillStyle = '#ffd8f4'; for (let dy = -R; dy <= R; dy++){ const hw = Math.floor(Math.sqrt(R * R - dy * dy)); s > 0 ? ctx.fillRect(C0 + 1, C0 + dy, hw, 1) : ctx.fillRect(C0 - hw, C0 + dy, hw, 1); } });
          const cols = ['#ffffff', '#ffe8fa', '#f0b0ff'];
          for (let i = 0; i < 9; i++){
            const ph = (t * .9 + i * .37) % 1, a0 = (-70 + i * 17) * Math.PI / 180, len = R * (.45 + .55 * ph);
            const x1 = C0 + s * Math.cos(a0) * len, y1 = C0 + Math.sin(a0) * len, x0 = C0 + s * Math.cos(a0) * len * .2, y0 = C0 + Math.sin(a0) * len * .2;
            alpha((.25 + .55 * k) * (1 - ph * .6), () => { line(x0, y0, x1, y1, cols[i % 3]); line(x0, y0 + 1, x1, y1 + 1, cols[(i + 1) % 3]); });
          }
          if (t >= T.wing) alpha(.5 * (1 - (t - T.wing) / .3), () => { ctx.fillStyle = '#ffffff'; for (let dy = -R; dy <= R; dy++){ const hw = Math.floor(Math.sqrt(R * R - dy * dy)); s > 0 ? ctx.fillRect(C0, C0 + dy, hw, 1) : ctx.fillRect(C0 - hw, C0 + dy, hw, 1); } });
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
