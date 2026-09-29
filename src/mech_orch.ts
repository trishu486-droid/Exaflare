import { PLAYER_SPEED } from './config.js';
import { job, mySlot } from './jobs.js';
import { opt } from './store.js';
import { S, shuffle } from './state.js';
import { A, hasHeavy, hasInvuln, hasMit } from './action.js';
import { sfx } from './audio.js';
import { FXC, FXK, fxAdd, fxFlash } from './fx.js';
import { P, PPY, glyph, hurt, px, rect, ring, thickRing } from './gfx.js';

// =====================================================================
// ギミック5：狂気のオーケストラ（kanatan.info の処理法。1回目・2回目）
// 味方7人は正しく動く（着弾ギリギリまで動かない）。自分の担当はジョブで決まる（ナイト MT/ST、モンク D1/D2、機工士 D3、黒 D4、学者 H1/H2）
// =====================================================================
const ORCH = (() => {
  const HOLY_R = 5, TB_R = 4.5, STACK_R = 4, FLARE_R = 8, BOT_SPEED = PLAYER_SPEED * 4; // 味方は着弾の直前まで動かず、ギリギリで4倍速で駆け込む（答えが見えないように）
  const CAST_END = 5.0, W1 = 5.9, W2 = 9.1, FINAL = 12.6, MARK_AT = 1.5; // 詠唱の長さと予兆のタイミングは推定
  // 散開位置（攻略図から読み取り）
  const SPREAD = {
    MT:{ x:-5, z:-12.4 }, ST:{ x:4.8, z:-12.9 },
    D3:{ x:-8.5, z:-5.9 }, D4:{ x:8.1, z:-5.9 }, D1:{ x:-8, z:1.5 }, D2:{ x:8.9, z:3.1 },
    H1:{ x:-3.7, z:7.3 }, H2:{ x:4, z:7.7 },
  };
  const NON_TANK = ['D1','D2','D3','D4','H1','H2'];
  const STACK = { x:0, z:-8.5 };                         // 2回目：タンクの頭割り（タゲサの外）
  const BAIT = [{ x:-6, z:0 }, { x:0, z:6 }, { x:6, z:0 }]; // 2回目：タゲサ内の西・南・東（隣どうしの円範囲が重ならない距離）
  const TOL = 1.5; // 目安の位置からのずれの許容（これ以上ずれると円範囲が重なりうる）
  const FLARE_SPOT = { x:0, z:-18.5 };
  const SOUTH = { H1:{ x:-6.5, z:14.5 }, H2:{ x:-9, z:13 }, D1:{ x:3.5, z:16 }, D2:{ x:6, z:14.5 }, D3:{ x:1.5, z:13.5 }, D4:{ x:8.5, z:12.5 } };
  const ROLE_COL = { T:'#3a6ad8', H:'#3aa84e', D:'#d8404e' };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const outward = (p, r) => { const d = Math.hypot(p.x, p.z) || 1; return { x:p.x / d * r, z:p.z / d * r }; };
  const tileGlyph = { T:'111010010010010', H:'101101111101101', D:'110101101101110' };
  return {
    id:'orch', name:'狂気のオーケストラ', sub:'1回目・2回目', view:24, start:{ x:0, z:8 }, slots:true, SPREAD, NON_TANK,
    gen(){
      return { me:mySlot(), n:job().role === 'tank' ? opt.orch : 1, targets:shuffle([...NON_TANK]).slice(0, 3) };
    },
    create(p){
      const all = ['MT','ST', ...NON_TANK];
      // タンクの役割：F＝フレア役（最初ヘイト1位 → 重いバフ＋シャークで北へ）、H＝ホーリー役（挑発して頭割り → ボス前で無敵）
      const F = p.n === 1 ? 'MT' : 'ST', H = F === 'MT' ? 'ST' : 'MT';
      const PROVOKE_AT = W1 + .6; // 味方タンクが挑発する時刻
      // 2回目の誘導役：1回目で当たらなかった3人を、散開位置の西から順に 西・南・東 へ
      const baiters = NON_TANK.filter(k => !p.targets.includes(k)).sort((a, b) => SPREAD[a].x - SPREAD[b].x);
      const phaseSpot = (k, ph) => {
        if (ph === 0) return SPREAD[k];
        if (ph === 1){
          if (k === 'MT' || k === 'ST') return STACK;
          const bi = baiters.indexOf(k);
          return bi >= 0 ? BAIT[bi] : outward(SPREAD[k], 14);
        }
        if (k === F) return FLARE_SPOT;      // フレア役は北端へ
        if (k === H) return STACK;           // ホーリー役はボス前で無敵
        return SOUTH[k];
      };
      // 自分の目安（ガイド表示・安地表示）は着弾のたびに次へ
      const spotAt = (k, t) => phaseSpot(k, t < W1 ? 0 : t < W2 ? 1 : 2);
      // 味方：次の答え合わせ（着弾）まで今の位置で待ち、着く時刻が着弾の0.05秒前になるギリギリで動き出す
      const DEADLINE = [W1, W2, FINAL];
      const botGoal = (b, t) => {
        const n = DEADLINE.findIndex(d => t < d); // 次の着弾
        if (n <= 0) return phaseSpot(b.k, n === 0 ? 0 : 2);
        const cur = phaseSpot(b.k, n - 1), nx = phaseSpot(b.k, n);
        return t >= DEADLINE[n] - dist(cur, nx) / BOT_SPEED - .05 ? nx : cur;
      };
      const bots = all.filter(k => k !== p.me).map(k => ({ k, ...SPREAD[k] }));
      const pos = k => k === p.me ? S.player : bots.find(b => b.k === k);
      const fired = { w1:false, w2:false, fin:false };
      let w2targets = [], lastT = 0, lastTop = null, topChangedAt = 0;
      const vuln = p.targets.includes(p.me);
      const roleOf = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];
      // ヘイト1位：ホーリー役が挑発するまではフレア役。自分がフレア役でシャークを早く使うとホーリー役に移る
      // P5 通しでは t0（このギミックの開始時刻）を引いて、ギミック内の時刻に直す
      const T0 = p.t0 || 0, rel = v => v == null ? null : v - T0;
      const hateTop = t => {
        const prov = p.me === H ? rel(A.provoke) : (t >= PROVOKE_AT ? PROVOKE_AT : null);
        const shirk = p.me === F ? rel(A.shirk) : null;
        return (prov !== null && prov <= t) || (shirk !== null && shirk <= t) ? H : F;
      };
      return {
        start: { ...SPREAD[p.me] },
        intro: roleOf(p.me) === 'T' ? `${p.n}回目　あなたは ${p.me}（${p.me === F ? 'フレア役' : 'ホーリー役'}）` : `あなたは ${p.me}`,
        end: FINAL + .9,
        casts: [{ name:'狂気のオーケストラ', start:0, len:CAST_END }],
        enmity: t => ['MT', 'ST'].map(k => ({ k, top:k === hateTop(t), me:k === p.me })),
        progress: t => (roleOf(p.me) === 'T' ? `${p.n}回目 ` : '') + (t < W1 ? '散開' : t < W2 ? '頭割り' : t < FINAL ? 'フレア/ホーリー' : '終了'),
        status(t){
          const s = [];
          if (t >= W1 && vuln) s.push({ art:'magicVuln', name:'被魔法ダメージ増加', sec:Math.max(1, Math.ceil(FINAL + .9 - t)) });
          if (t >= W1 - .3 && t < FINAL && roleOf(p.me) === 'T') s.push({ art:p.me === F ? 'flare' : 'holy', name:p.me === F ? 'フレア' : 'ホーリー', sec:Math.ceil(FINAL - t) });
          return s;
        },
        tick(t){
          const dt = Math.max(0, t - lastT); lastT = t;
          // 味方は担当の位置へ歩く
          bots.forEach(b => {
            const g = botGoal(b, t), d = dist(b, g), step = BOT_SPEED * dt;
            if (d > .05){ const k = Math.min(1, step / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; }
          });
          const me = S.player;
          if (!fired.w1 && t >= W1){
            fired.w1 = true; sfx.boom();
            p.targets.forEach(k => { const q = pos(k); FXK.holy(q.x, q.z, HOLY_R); });
            ['MT','ST'].forEach(k => { const q = pos(k); FXK.flare(q.x, q.z, TB_R); });
            fxFlash('#ffffff', .4, .12); sfx.big();
            const overlap = p.targets.filter(k => k !== p.me).some(k => dist(me, pos(k)) <= HOLY_R);
            if (overlap) hurt('ホーリーが重なった');
            if (vuln && all.filter(k => k !== p.me && !p.targets.includes(k)).some(k => dist(me, pos(k)) <= HOLY_R)) hurt('ホーリーに味方を巻き込んだ');
            if (roleOf(p.me) !== 'T' && ['MT','ST'].some(k => dist(me, pos(k)) <= TB_R)) hurt('タンク強攻撃に巻き込まれた');
            if (roleOf(p.me) === 'T' && !hasMit()) hurt('軽減なしで強攻撃');
            // デバフはヘイト順：フレア役が1位のままでないと入れ替わる
            if (roleOf(p.me) === 'T' && hateTop(t) !== F) hurt(p.me === H ? '挑発が早い' : 'シャークが早い');
          }
          if (!fired.w2 && t >= W2){
            fired.w2 = true; sfx.boom();
            // ボスに近い3人（自分も含めて判定）
            w2targets = [...all].sort((a, b) => Math.hypot(pos(a).x, pos(a).z) - Math.hypot(pos(b).x, pos(b).z)).slice(0, 3);
            w2targets.forEach(k => { const q = pos(k); FXK.holy(q.x, q.z, HOLY_R); });
            { const q = pos(H); FXK.flare(q.x, q.z, STACK_R); }
            fxFlash('#ffffff', .4, .12); sfx.big();
            const mine = w2targets.includes(p.me);
            if (roleOf(p.me) === 'T'){
              if (mine) hurt('タゲサに入った');
              if (p.me === H && hateTop(t) !== H) hurt('挑発していない');
              if (dist(me, pos(p.me === 'MT' ? 'ST' : 'MT')) > STACK_R) hurt('頭割りに入れていない');
              else if (!hasMit()) hurt('軽減なしで頭割り');
            } else {
              if (mine && vuln) hurt('ホーリーを2回受けた');
              if (!mine && !vuln) hurt('近い3人に入れなかった');
              if (w2targets.filter(k => k !== p.me).some(k => dist(me, pos(k)) <= HOLY_R)) hurt('ホーリーが重なった');
              if (dist(me, pos(H)) <= STACK_R) hurt('タンク頭割りに入った');
            }
          }
          if (!fired.fin && t >= FINAL){
            fired.fin = true; sfx.boom();
            { const q = pos(F); FXK.flare(q.x, q.z, FLARE_R, true); fxAdd('ring', q.x, q.z, { r:FLARE_R * 1.6, cols:FXC.flare, dur:.5 }); }
            { const q = pos(H); FXK.holy(q.x, q.z, 6); fxAdd('ring', q.x, q.z, { r:12, cols:FXC.holy, dur:.6 }); }
            sfx.big();
            if (p.me === F){
              if (all.some(k => k !== F && dist(pos(F), pos(k)) <= FLARE_R)) hurt('フレアに味方を巻き込んだ');
              if (!hasHeavy()) hurt('重いバフなしでフレア');
              if (A.shirk === null) hurt('シャークしていない');
            }
            else if (dist(me, pos(F)) <= FLARE_R) hurt('フレアに巻き込まれた');
            if (p.me === H && dist(me, STACK) > 3) hurt('ボス前でホーリーを受けていない');
            if (p.me === H && !hasInvuln()) hurt('無敵なしでホーリー');
          }
        },
        safeActive: () => true,
        safe(x, z, t){ return dist({ x, z }, spotAt(p.me, t)) <= TOL; },
        guide(t){ const g = spotAt(p.me, t); ring(px(g.x), px(g.z), Math.round(TOL * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
        draw(t){
          const blink = (Math.floor(performance.now() / 160) & 1) === 0;
          // 1回目の予兆：ランダム3人に青い輪、MT/STに赤い輪
          if (t >= MARK_AT && t < W1){
            p.targets.forEach(k => { const q = pos(k); thickRing(px(q.x), px(q.z), Math.round(HOLY_R * PPY), blink ? '#5ab0ff' : P.white, 2); });
            ['MT','ST'].forEach(k => { const q = pos(k); thickRing(px(q.x), px(q.z), Math.round(TB_R * PPY), blink ? P.hurt : '#ff9a9a', 2); });
          }
          // 2回目の頭割り予兆（MTに）、フレア/ホーリーの予兆
          if (t >= W1 + .5 && t < W2){ const q = pos(hateTop(t)); ring(px(q.x), px(q.z), Math.round(STACK_R * PPY), blink ? P.hurt : P.white); }
          if (t >= W2 + .3 && t < FINAL){ const q = pos(F); ring(px(q.x), px(q.z), Math.round(FLARE_R * PPY), blink ? '#ff9a3a' : P.white); }
          // 着弾の直前：対象のまわりに光の粒が集まってくる（1秒前から）
          const gather = (q, until, cols) => {
            const k = (until - t) / 1.0; if (k <= 0 || k > 1) return;
            const X = px(q.x), Z = px(q.z), f = Math.floor(t * 20);
            for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2 + f * .25, r = 4 + Math.round(k * 22);
              rect(X + Math.round(Math.cos(a) * r) - 1, Z + Math.round(Math.sin(a) * r) - 1, 2, 2, cols[(i + f) % cols.length]); }
          };
          if (!fired.w1){ p.targets.forEach(k => gather(pos(k), W1, ['#ffffff', '#ff8af0', '#c8f0ff'])); ['MT','ST'].forEach(k => gather(pos(k), W1, ['#ffe070', '#ff9a3a'])); }
          if (!fired.fin && fired.w2){ gather(pos(F), FINAL, ['#ffffff', '#ffe070', '#ff9a3a']); gather(pos(H), FINAL, ['#ffffff', '#c8f0ff', '#8ad8ff']); }
          // 味方
          bots.forEach(b => {
            const X = px(b.x), Z = px(b.z), r = roleOf(b.k);
            rect(X - 4, Z - 4, 9, 9, P.white); rect(X - 3, Z - 3, 7, 7, ROLE_COL[r]);
            const g = tileGlyph[r]; for (let i = 0; i < 15; i++) if (g[i] === '1') rect(X - 1 + (i % 3), Z - 2 + (i / 3 | 0), 1, 1, P.white);
          });
          // 2回目で狙われた人
          if (t >= W2 && t < W2 + .6) w2targets.forEach(k => { const q = pos(k); ring(px(q.x), px(q.z), Math.round(HOLY_R * PPY), P.white); });
          // ヘイト順位：タンクの頭上に 1（赤）／2（グレー）の札。1位が入れ替わった瞬間は札が跳ねる
          const top = hateTop(t);
          if (top !== lastTop){ lastTop = top; topChangedAt = performance.now(); }
          const hop = Math.max(0, 1 - (performance.now() - topChangedAt) / 450);
          ['MT', 'ST'].forEach(k => {
            const q = pos(k), first = k === top, X = px(q.x), Y = px(q.z) - 19 - (first ? Math.round(Math.sin(hop * Math.PI) * 4) : 0);
            const col = first ? '#e8283a' : '#6a6a78';
            rect(X - 4, Y - 1, 9, 9, '#101018'); rect(X - 3, Y, 7, 7, col);
            glyph(first ? '1' : '2', X, Y + 3, '#ffffff');
            rect(X - 2, Y + 8, 5, 1, '#101018'); rect(X - 2, Y + 7, 5, 1, col); rect(X - 1, Y + 8, 3, 1, col); rect(X, Y + 9, 1, 1, col);
          });
        },
      };
    }
  };
})();

export { ORCH };
