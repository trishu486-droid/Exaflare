import { MECHS } from './mechs.js';
import { TARGET_DPS, mySlot } from './jobs.js';
import { S, shuffle } from './state.js';
import { ORCH } from './mech_orch.js';
import { opt } from './store.js';
import { sfx } from './audio.js';
import { A, hasInvuln, healerHit } from './action.js';
import { FXC, FXK, fxAdd, fxFlash, fxParts, fxShake } from './fx.js';
import { P, PPY, hurt, px, rect, ring } from './gfx.js';

// =====================================================================
// 隠しステージ：P5 通し（ターゲット可能 → ミッシング・ゼロの詠唱まで）
// 時刻は cactbot のタイムライン（どきどきアルテマの2秒前を 0。開始はターゲット可能になる 33 秒）。練習用の5ギミックを実際の時刻に並べ、
// 間に 連続アルテマ・魔撃（AA）・終末の渦 を入れる
// AA：ヘイト1位・ヒーラー1人・DPS1人に頭割り（被魔法ダメージ増加つき。2つ受けると即死）
//   タンク＝A（ボスの北）、ヒーラー＝4（南西）、DPS＝3（南東）で受ける
//   オーケストラ直後の1発目のAAは、ヘイト1位（ホーリー役）がボス前で無敵のまま1人で受ける。2発目からはタンク2人で頭割り
// =====================================================================
const RUN = (() => {
  const TARGETABLE = 33;
  const HOME = { T:{ x:0, z:-10 }, H:{ x:-7.5, z:7.5 }, D:{ x:7.5, z:7.5 } };
  const AA_R = { T:3, H:4, D:4 }, AA_COL = { T:'#5a8aff', H:'#58e07a', D:'#ff5a6a' };
  const REPEAT = [{ cast:34.2, hits:[39.3, 40.1, 40.8, 41.6], dmg:74358 }, { cast:118.1, hits:[123.2, 124.0, 124.7, 125.5], dmg:108000 }];
  const FELL = [
    { at:[44.2, 47.4, 50.5], dmg:[55769, 61965, 68850] },
    { at:[83.2, 86.3], dmg:[81000, 90000], solo:1 },
    { at:[128.1, 131.3], dmg:[81000, 81000] },
    { at:[175.2, 178.3, 181.4], dmg:[68850, 81000, 81000], solo:2 },
  ];
  const ENTROPY = { cast:147.8, len:6, at:154.7, dmg:180000, r:4 }; // 混沌の終末の5回目あたりで詠唱開始
  // [ギミック, 開始時刻, オーケストラの回, そのオーケストラのバフ・ヘイトが続く時刻]
  const SEGS: [string, number, number?, number?][] = [['flood', 52.55], ['orch', 66.0, 1, 87.6], ['celes', 87.62], ['exa', 132.8], ['orch', 158.0, 2, 182.7], ['miss', 182.7]];
  const MK = id => MECHS.find(m => m.id === id);
  const ZOOM = 3, KILL_AT = .9;
  const ENRAGE = { at:253.4, len:26 }; // ミッシング・ゼロ（時間切れ）：詠唱 1587.4 → 完了 1613.4。ターゲット可能から 3分40秒
  const roleOf = slot => slot[0] === 'M' || slot[0] === 'S' ? 'T' : slot[0];
  const fmt = t => { const s = Math.max(0, Math.floor(t)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
  return {
    id:'p5', name:'P5 通し', sub:'隠しステージ', view:24, start:HOME.T, slots:true,
    gen(){
      return SEGS.map(([id, at, n]) => id === 'orch' ? { me:mySlot(), n, targets:shuffle([...ORCH.NON_TANK]).slice(0, 3), t0:at } : MK(id).gen());
    },
    create(probs){
      const me = mySlot(), role = roleOf(me), home = HOME[role];
      const segs = SEGS.map(([id, at, n, keep], i) => ({ id, at, n, keep, inst:MK(id).create(probs[i]), begun:false, done:false, end:0 }));
      segs.forEach(s => s.end = s.at + s.inst.end);
      segs[5].end = ENRAGE.at; // ミッシングの穴は時間切れまで残る（最後まで床の判定を続ける）
      const seg = t => segs.find(s => t >= s.at && t <= s.end);
      const aa = FELL.flatMap(f => f.at.map((t, i) => ({ t, dmg:f.dmg[i], solo:i === 0 ? f.solo : 0, done:false })));
      const hits = REPEAT.flatMap(r => r.hits.map(t => ({ t, dmg:r.dmg, done:false })));
      const fired = { up:false, ent:false, swirl:false };
      let entX = 0, entZ = 0;
      const inK = k => Math.hypot(S.player.x - HOME[k].x, S.player.z - HOME[k].z) <= AA_R[k];
      const exa = segs[3], orch2 = segs[4];
      // ギミックの間の目安：AA の位置。混沌の終末の後は終末の渦の散開位置
      const spreadAt = t => t >= exa.end && t < ENTROPY.at + .3;
      // フレア役のタンクは、オーケストラ直後の1発目のAAの間だけ A の外（北）で待つ
      const holyOf = n => n === 1 ? 'ST' : 'MT';
      const stayOut = t => { const a = aa.find(q => !q.done); return role === 'T' && a && a.solo && a.t - t < 6 && me !== holyOf(a.solo); };
      const spot = t => spreadAt(t) ? ORCH.SPREAD[me] : stayOut(t) ? { x:0, z:-16 } : home;
      // ヘイト1位：オーケストラ1回目の後は ST、2回目の後は MT（ヘイトは戻さない）
      const topOut = t => t < segs[1].at + 7 || t >= orch2.at + 7 ? 'MT' : 'ST';
      const orchAt = t => segs.find(s => s.id === 'orch' && t >= s.at && t < s.keep);
      return {
        start:{ ...home },
        intro:`あなたは ${me}　最後まで被弾なしで`,
        end: ENRAGE.at,
        casts:[
          ...REPEAT.map(r => ({ name:'連続アルテマ', start:r.cast, len:4 })),
          { name:'終末の渦', start:ENTROPY.cast, len:ENTROPY.len },
          ...segs.flatMap(s => s.inst.casts.filter(c => c.name !== 'ミッシング・ゼロ').map(c => ({ ...c, start:c.start + s.at }))),
          { name:'ミッシング・ゼロ', start:ENRAGE.at - ENRAGE.len, len:ENRAGE.len }],
        // 混沌の終末の予兆はフィールドの外に出るので、その間だけ引く。3秒かけてゆっくり引いて、ゆっくり戻す
        view: t => {
          const k = Math.max(0, Math.min(1, (t - (exa.at - ZOOM)) / ZOOM, (exa.end + ZOOM - t) / ZOOM));
          return 24 + 12 * k * k * (3 - 2 * k);
        },
        // 開幕（どきどきアルテマ〜ターゲット不可）は飛ばして、ターゲット可能になる時刻から 3 カウントで始める
        t0:TARGETABLE,
        // ボスのHP：そのジョブの目標DPSの9割を最後まで出し続けると、ちょうど削りきれる量（ジョブごとに硬さが変わる）
        bossHp: TARGET_DPS[opt.job] * (ENRAGE.at - TARGETABLE) * KILL_AT,
        targetable: t => t >= TARGETABLE,
        activeTime: end => Math.max(1, end - TARGETABLE),
        tankRole(t){
          const o = orchAt(t); if (!o) return 'atk';
          return (me === 'MT') === (o.n === 1) ? 'flare' : 'holy';
        },
        enmity(t){
          const s = seg(t);
          if (s?.inst.enmity) return s.inst.enmity(t - s.at);
          return ['MT', 'ST'].map(k => ({ k, top:k === topOut(t), me:k === me }));
        },
        progress(t){
          const s = seg(t);
          return `P5 ${fmt(t - TARGETABLE)}` + (s ? ' ' + s.inst.progress(t - s.at) : '');
        },
        status(t){
          const s = seg(t), out = s?.inst.status ? [...s.inst.status(t - s.at)] : [];
          return out;
        },
        tick(t){
          // 連続アルテマ：ボスで閃光 → 横一文字の光 → 画面が青く染まって破片が飛ぶ（4回）
          hits.forEach(h => { if (!h.done && t >= h.t){ h.done = true; sfx.big(); healerHit(h.dmg);
            fxAdd('star', 0, 0, { cols:FXC.holy, L:26, dur:.25 }); fxAdd('beam', 0, 0, { cols:['#ffffff', '#ffc8f0', '#b05aff'], dur:.25 });
            fxFlash('#3ab8ff', .45, .25); fxParts(26, 0, 0, { cols:FXC.ice, speed:22, up:3, life:.55, size:3, spread:8, grav:4 }); fxShake(3, .2); } });
          aa.forEach(a => {
            if (a.done || t < a.t) return;
            a.done = true; sfx.big();
            ['T', 'H', 'D'].forEach(k => FXK.stack(HOME[k].x, HOME[k].z, AA_R[k] * .8)); fxShake(2, .2); // マゼンタの光の柱 → 紫の煙
            if (role === 'T'){
              if (a.solo){
                const holy = holyOf(a.solo); // ホーリー役：スイッチしてヘイト1位になった方
                if (me === holy){ if (!inK('T')) hurt('AAを受けていない'); else if (!hasInvuln()) hurt('無敵なしでAA'); }
                else if (inK('T')) hurt('AAに入った（ホーリー役が1人で受ける）');
              } else if (!inK('T')) hurt('AAの頭割りに入れていない');
            } else {
              if (!inK(role)) hurt('AAの頭割りに入れていない');
              else if (['T', 'H', 'D'].some(k => k !== role && inK(k))) hurt('別のAAに入った');
              healerHit(a.dmg);
            }
          });
          if (!fired.swirl && t >= ENTROPY.at - 1.2){ fired.swirl = true; fxAdd('swirl', 0, 0, { r:9, cols:FXC.void, dur:1.2, inward:true }); } // 渦がボスに集まる
          if (!fired.ent && t >= ENTROPY.at){
            fired.ent = true; sfx.big(); entX = S.player.x; entZ = S.player.z;
            // 終末の渦：全員の位置で爆発、画面が白く飛んで岩が散る
            FXK.flare(entX, entZ, ENTROPY.r, true);
            Object.entries(ORCH.SPREAD).forEach(([k, q]) => { if (k !== me) fxAdd('burst', q.x, q.z, { r:ENTROPY.r, cols:FXC.flare, dur:.6 }); });
            fxFlash('#fff4d0', .7, .25); fxParts(30, 0, 0, { cols:['#3a2a1a', '#6a4a2a', '#1a1010'], speed:12, up:12, life:.9, size:3, spread:24 });
            const near = Object.entries(ORCH.SPREAD).some(([k, q]) => k !== me && Math.hypot(q.x - S.player.x, q.z - S.player.z) < ENTROPY.r);
            if (near) hurt('終末の渦が重なった');
            healerHit(ENTROPY.dmg);
          }
          segs.forEach(s => {
            if (t < s.at || s.done) return;
            if (!s.begun){ s.begun = true; if (s.id === 'orch'){ A.provoke = A.shirk = null; } }
            s.inst.tick(Math.min(t, s.end) - s.at);
            if (t > s.end) s.done = true;
          });
        },
        safeActive(t){ const s = seg(t); return s ? !!s.inst.safeActive?.(t - s.at) : true; },
        safe(x, z, t){
          const s = seg(t);
          if (s) return s.inst.safe(x, z, t - s.at);
          const g = spot(t); return Math.hypot(x - g.x, z - g.z) <= (spreadAt(t) || stayOut(t) ? 2 : AA_R[role] - .5);
        },
        guide(t){
          const s = seg(t);
          // 終末の渦の詠唱が始まったら、エクサを避けながら向かう散開位置も出しておく
          if (s && t >= ENTROPY.cast && t < ENTROPY.at){ const q = ORCH.SPREAD[me]; ring(px(q.x), px(q.z), Math.round(2 * PPY), '#ff9a3a'); }
          if (s) return s.inst.guide?.(t - s.at);
          const g = spot(t); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white);
        },
        drawFloor(t){ const s = seg(t); s?.inst.drawFloor?.(t - s.at); },
        draw(t){
          const s = seg(t); s?.inst.draw(t - s.at);
          const blink = (Math.floor(performance.now() / 160) & 1) === 0;
          // AA：実機と同じく予兆なし（詠唱もマーカーも出ない）。着弾の演出は FX（マゼンタの柱）
          // 終末の渦：詠唱中は自分のまわりに散開の輪
          if (t >= ENTROPY.cast && t < ENTROPY.at) ring(px(S.player.x), px(S.player.z), Math.round(ENTROPY.r * PPY), blink ? '#ff9a3a' : P.white);
        },
      };
    }
  };
})();

export { RUN };
