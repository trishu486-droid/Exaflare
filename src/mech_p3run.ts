// @ts-nocheck
import { S, shuffle } from './state.js';
import { sfx } from './audio.js';
import { hasInvuln, hasMit, switchTarget } from './action.js';
import { TARGET_DPS, JOBS, mySlot } from './jobs.js';
const isTankJob = () => JOBS[opt.job]?.role === 'tank';
import { opt } from './store.js';
import { fxFlash, fxShake } from './fx.js';
import { P, PPY, hurt, px, rect, ring, targetLast } from './gfx.js';
import { makeP3Fx } from './p3fx.js';
import { inBusterAoe, BUSTER_R, at, CHAOS_SIDE, BOSS_TC, BOSS_COL, drawBossArt } from './mech_p3.js';
import { P3A0, P3B } from './mech_p3.js';
import { P3C } from './mech_p3c.js';
import { P3D } from './mech_p3d.js';

// =====================================================================
// ギミックを時刻どおりにつなぐ部品（P3 前半＝バウル・オブ・アゴニー＋アルテマブラスター、P3 通し）
// 時刻は cactbot のタイムライン 640 秒（P3 前半の 0）を 0 とする。各ギミックは自分の 0 からの時刻で動く（p.off がずれ）
// 同じ時刻に2つのギミックが動くこともある（アンブラスマッシュ・真空波とアルテマブラスターの観察）
// =====================================================================
function chain(list, o){
  // at：そのギミックの 0 の時刻、begin：動き始める時刻（at より前から動かすことがある。既定は at）
  list.forEach(s => s.begin ??= s.at);
  const act = t => list.filter((s, i) => (t >= s.begin || i === 0) && t <= s.end); // 最初のギミックはカウントダウン中から描く
  const cur = (t, f = s => true) => { const a = act(t).filter(f); return a[a.length - 1]; };
  const begun = (t, f) => { const a = list.filter(s => t >= s.begin && f(s)); return a[a.length - 1]; };
  const segFor = t => cur(t, s => s.inst.safeActive?.(t - s.at)) || cur(t) || begun(t, () => true) || list[0];
  return {
    view:24, t0:0, ...o,
    casts:[...list.flatMap(s => s.inst.casts.map(c => ({ ...c, start:c.start + s.at }))), ...(o.casts || [])],
    target0:list[0].inst.target0, fieldMarker:list[0].inst.fieldMarker, buttons:o.buttons || list[0].inst.buttons,
    bosses(t){
      const s = begun(t, s => !s.noBoss) || list[0];
      return s.inst.bosses(t - s.at).map(b => ({ ...b, attackable: b.attackable ? tt => b.attackable(tt - s.at) : undefined }));
    },
    // ターゲット切替はここで1回だけ。ほかのボタン（タンクの LB3 など）は動いているギミックへ
    say(kind){ if (kind === 'early'){ switchTarget(); return; } act(S.t).forEach(s => s.inst.say?.(kind)); },
    get party(){ const s = cur(S.t, s => s.inst.party); return s?.inst.party; },
    macroBox:true, // P3 はずっと左下に PT チャット（縦長・細め）
    progress: () => '',
    status(t){ return act(t).flatMap(s => (s.inst.status?.(t - s.at) || []).map(x => ({ ...x, at:(x.at ?? 0) + s.at }))); },
    tick(t){
      o.tick?.(t);
      list.forEach(s => { if (t < s.begin || s.done) return; s.inst.tick(Math.min(t, s.end) - s.at); if (t > s.end) s.done = true; });
    },
    safeActive(t){ const s = segFor(t); return !!s.inst.safeActive?.(t - s.at); },
    safe(x, z, t){ const s = segFor(t); return s.inst.safe(x, z, t - s.at); },
    guide(t){ const s = segFor(t); s.inst.guide?.(t - s.at); },
    mySpot(t){ const s = segFor(t); return s.inst.mySpot?.(t - s.at) ?? null; },
    drawFloor(t){ act(t).forEach(s => s.inst.drawFloor?.(t - s.at)); },
    draw(t){ act(t).forEach(s => s.inst.draw(t - s.at)); o.draw?.(t); },
  };
}

// 前半：バウル・オブ・アゴニー（0〜）＋アルテマブラスター（75〜。突進の観察は真空波と同時）
const FRONT_B = 75, FRONT_END = 105;
const frontGen = () => [P3A0.gen(), P3B.gen()];
const frontSegs = (pr, off = 0) => {
  // アルテマブラスターの番号：自分は pr[1].me、味方は残りの番号をくじで
  const me = mySlot(), rest = shuffle([1, 2, 3, 4, 5, 6, 7, 8].filter(n => n !== pr[1].me)), num = {};
  ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'].forEach(k => { num[k] = k === me ? pr[1].me : rest.pop(); });
  let a = null;
  const b = P3B.create({ ...pr[1], off:off + FRONT_B, ext:() => a.bosses(0) });
  a = P3A0.create({ ...pr[0], off, blaster:k => b.debug.bot(num[k]) });
  return [{ inst:a, at:0, end:FRONT_END }, { inst:b, at:FRONT_B, end:FRONT_END, noBoss:true }];
};
const P3A = {
  id:'p3a', name:'バウル・オブ・アゴニー', sub:'TLB3式（決戦〜アルテマブラスター）', view:24, start:{ x:0, z:4 }, slots:true,
  gen: frontGen,
  create(pr){
    const segs = frontSegs(pr);
    return chain(segs, { end:FRONT_END, intro:segs[0].inst.intro, debug:{ ...segs[0].inst.debug, blaster:segs[1].inst.debug } });
  },
};

// アルテマブラスターのあと〜じしんの前（105〜118）：サンダガ2連（MT が軽減で受ける）→ ボスが中央へ → 決戦2回目
// 時刻はこの区間の 0（＝105）から
function makeGap(front){
  const me = mySlot(), TH = [4.7, 7.7], BATTLE = 12.7;
  // ボスはアルテマブラスターが終わったときの位置から歩き出す（始まったときに前半のボスの位置を写す）
  const CH = { x:0, z:0, face:{ x:0, z:-1 } }, EX = { x:0, z:0, face:{ x:0, z:-1 } };
  let copied = false;
  const copy = () => { const fb = front.bosses(0); [[CH, 'chaos'], [EX, 'exdeath']].forEach(([b, id]) => { const q = fb.find(x => x.id === id); b.x = q.x; b.z = q.z; b.face = { ...q.face }; }); CH0 = { x:CH.x, z:CH.z }; copied = true; };
  // エクスデスはサンダガを詠唱するので外周（アルテマブラスターのときの場所）にほぼ固定。カオスは ST が少し中央へ寄せる
  // 2体が離れているので、決戦2回目はそれぞれのボスの外側に分かれて近づく
  let CH0 = null;
  const side = k => CHAOS_SIDE.includes(k) ? 'chaos' : 'exdeath';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const unitOf = (a, b) => { const d = dist(a, b) || 1; return { x:(b.x - a.x) / d, z:(b.z - a.z) / d }; };
  const fx3 = makeP3Fx();
  const SL = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
  const chGoal = () => ({ x:CH0.x * .6, z:CH0.z * .6 });
  const fan = (c, dir, k, r) => { const b0 = Math.atan2(dir.x, -dir.z) * 180 / Math.PI, i = SL.filter(x => side(x) === side(k)).indexOf(k); const q = at(b0 + (i - 1.5) * 22, r); return { x:c.x + q.x, z:c.z + q.z }; };
  // MT：エクスデスの外周側（円範囲が味方に届かない）
  const mtSpot = r0 => { const u = unitOf({ x:0, z:0 }, EX); return { x:EX.x + u.x * r0, z:EX.z + u.z * r0 }; };
  // 決戦の前：カオス組はカオスの、エクスデス組はエクスデスの、相手と反対側。エクスデス組はサンダガが終わるまでカオス組のそばで待つ
  const sideSpot = (k, t) => {
    const cg = chGoal();
    if (side(k) === 'chaos' || t < TH[1] + .3) return fan(cg, unitOf(EX, cg), k, BOSS_TC * .8 + (side(k) === 'chaos' ? 0 : 3));
    return fan(EX, unitOf(cg, EX), k, BOSS_TC * .8);
  };
  const botAt = (k, t) => k === 'MT' && t < TH[1] + .3 ? mtSpot(1) : sideSpot(k, t);
  const spot = t => me === 'MT' && t < TH[1] + .3 ? mtSpot(1.5) : sideSpot(me, t);
  const ev = [
    ...TH.map((h, j) => [h, () => {
      const cand = [['me', S.player], ...['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'].filter(k => k !== me).map(k => [k, botAt(k, h)])];
      const tgt = cand.sort((a, b) => dist(a[1], EX) - dist(b[1], EX))[0];
      if (tgt[0] === 'me'){
        if (me !== 'MT') hurt('サンダガ（強攻撃）を受けた（エクスデスに近すぎた）');
        else if (!hasMit() && !hasInvuln()) hurt('軽減なしでサンダガ（強攻撃）を受けた');
      } else if (me === 'MT') hurt(`サンダガ${j + 1}発目を受けなかった（エクスデスの一番近くにいない）`);
      else if (inBusterAoe(S.player, tgt[1])) hurt('サンダガ（タンク強攻撃の範囲）に巻き込まれた');
      fx3.add('cleave', { q:{ ...tgt[1] }, r:BUSTER_R }); fx3.add('bolt', { ...tgt[1] }); sfx.big(); fxShake(2, .2);
    }]),
    [BATTLE, () => {
      // カオスに近い4人に決戦α、遠い4人に決戦β
      if (!copied) copy();
      const ds = SL.filter(k => k !== me).map(k => dist(botAt(k, BATTLE), CH)), myD = dist(S.player, CH);
      const mine = ds.filter(d => d < myD).length < 4 ? 'chaos' : 'exdeath';
      if (mine !== side(me)) hurt(`決戦：${side(me) === 'chaos' ? 'カオス' : 'エクスデス'}の近くにいなかった`);
      fxFlash('#ffffff', .25, .15); sfx.big();
    }],
  ];
  const fired = [];
  return {
    casts:[{ name:'サンダガ', start:TH[0] - 5, len:5 }, { name:'決戦', start:BATTLE - 3.5, len:3.5 }],
    bosses: () => { if (!copied) copy(); return [
      { id:'chaos', name:'カオス', x:CH.x, z:CH.z, face:CH.face, r:BOSS_TC, color:BOSS_COL.chaos },
      { id:'exdeath', name:'エクスデス', x:EX.x, z:EX.z, face:EX.face, r:BOSS_TC, color:BOSS_COL.exdeath },
    ]; },
    tick(t){
      if (!copied) copy();
      { const m = me === 'MT' ? S.player : botAt('MT', t), u = unitOf(EX, m); EX.face = { x:u.x, z:u.z }; }
      const dt = Math.min(.05, Math.max(0, t - (this._lt ?? t))); this._lt = t;
      // カオスだけ少し中央へ（ST が引き寄せる）。エクスデスは詠唱でその場
      if (t >= 1){ const g = chGoal(), d = dist(CH, g); if (d > .05){ const k = Math.min(1, 7 * dt / d); CH.x += (g.x - CH.x) * k; CH.z += (g.z - CH.z) * k; } }
      { const u = unitOf(CH, EX); CH.face = { x:u.x, z:u.z }; } // カオスはエクスデスの方（ST）を向く
      ev.forEach((e, i) => { if (!fired[i] && t >= e[0]){ fired[i] = true; e[1](); } });
    },
    safeActive: () => true,
    safe(x, z, t){ if (!copied) copy(); const g = spot(t); return Math.hypot(x - g.x, z - g.z) <= 2; },
    guide(t){ if (!copied) copy(); const g = spot(t); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
    mySpot: t => { if (!copied) copy(); return spot(t); },
    draw(t){ targetLast([CH, EX].map((b, i) => ({ ...b, id:i ? 'exdeath' : 'chaos', r:BOSS_TC }))).forEach(drawBossArt); fx3.draw(); },
  };
}

// P3 通し：ボスがターゲット可能（0.3）→ 時間切れ（バウル・オブ・アゴニー／メテオ 301.8〜306.8）
const RUN3 = (() => {
  const TARGETABLE = .3, C_BEGIN = 118, C_AT = 128, C_END = 265, D_AT = 265, ENRAGE = { cast:301.8, at:306.8 }, BIG_BANG = 288.3;
  const KILL_AT = .95, HEAL_EASE = .8; // ヒーラーは回復で攻撃が減るぶん、目標を 8 割に（推定）
  const activeLen = ENRAGE.cast - TARGETABLE;
  const dpsTarget = () => TARGET_DPS[opt.job] * (opt.job === 'ast' || opt.job === 'sch' ? HEAL_EASE : 1);
  return {
    id:'p3', name:'P3 通し', sub:'P3 を最初から最後まで', view:24, start:{ x:0, z:4 }, slots:true,
    gen(){
      const [a, b] = frontGen(), c = P3C.gen(), d = P3D.gen();
      return [a, b, c, { ...d, north:c.kefka.bok[1] }]; // 締めの北＝2回目のボクチンが来た方向
    },
    create(pr){
      const segs = frontSegs(pr);
      const gap = makeGap(segs[0].inst);
      const c3 = P3C.create({ ...pr[2], off:C_AT, pre:true, bossFrom:() => gap.bosses() });
      const d3 = P3D.create({ ...pr[3], off:D_AT, bossAt:{ chaos:{ x:c3.debug.CH.x, z:c3.debug.CH.z }, exdeath:{ x:c3.debug.EX.x, z:c3.debug.EX.z } } });
      segs.push({ inst:gap, at:FRONT_END, end:C_BEGIN }, { inst:c3, at:C_AT, begin:C_BEGIN, end:C_END }, { inst:d3, at:D_AT, end:ENRAGE.at });
      return chain(segs, {
        end:ENRAGE.at, t0:TARGETABLE, countdown:5,
        intro:`あなたは ${mySlot()}　最後まで被弾なしで`,
        casts:[{ name:'バウル・オブ・アゴニー', start:ENRAGE.cast, len:ENRAGE.at - ENRAGE.cast }, { name:'メテオ', start:ENRAGE.cast, len:ENRAGE.at - ENRAGE.cast }],
        bossHp: dpsTarget() * activeLen * KILL_AT, dpsTarget: dpsTarget(),
        bossName:'ボス', killAfter:BIG_BANG, enrageName:'バウル・オブ・アゴニー／メテオ', // 突出までは HP が残る（エーテルリンク）
        targetable: t => t >= TARGETABLE && t < ENRAGE.cast,
        // ボタン：1＝ターゲット切替、2＝タンクは前半 LB3・後半は攻撃マーカー（ほかは常に攻撃）、3＝バインド、4＝禁止
        buttons: t => ({ early:'ターゲット切替', late:isTankJob() && t < FRONT_END ? 'LB3' : '攻撃', stop:'バインド', move:'禁止' }),
        activeTime: end => Math.max(1, Math.min(end, ENRAGE.cast) - TARGETABLE),
        debug:{ ...segs[0].inst.debug, c3:c3.debug, d3:d3.debug, segs },
      });
    },
  };
})();

export { P3A, RUN3 };
