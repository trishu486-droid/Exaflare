// @ts-nocheck
import { S } from './state.js';
import { A } from './action.js';
import { bgm, sfx } from './audio.js';
import { fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, alpha, ctx, disc, rect, ring, px } from './gfx.js';
import { mySlot } from './jobs.js';
import { opt } from './store.js';
import { laugh } from './kefka_intro.js';
import { SLOTS, add, at, dist, drawBot, statueScreenBg } from './p1lib.js';
import { clearOutside, bgImg } from './mech_p2m.js';
import { RUN2 } from './mech_p2run.js';
import { RUN3 } from './mech_p3run.js';
import { P4 } from './mech_p4.js';
import { RUN } from './mech_run.js';
import { withSky, skyBg } from './sky.js';
import { bossSprite } from './p4boss.js';

// =====================================================================
// フェーズのつなぎ目（全通しの部品）。docs/README.md 6章の3（ユーザーの動画 2026-10-16）
//   つなぎ P1→P2：P1 の時間切れ（最後の裁きの光は来ない）→ ケフカが消える → 床が金色に → 光の柱からゴッドケフカ → 殴れる → P2 通しへ
//   つなぎ P2→P3：ゴッドケフカが殴れなくなる（HP は 0.1% で耐える）→ ケフカが出て「ずんずんエアロガ」→ ノックダウン → P3 通しへ（実機のムービーは入れない）
// 確認用（今だけ）：前のフェーズの終わり 5 秒から始まり、次のフェーズの始まりの少し後で終わる
// つなぎの時刻は、つなぎの 0（＝前のフェーズの終わり）からの秒。次のフェーズに切り替えるときは S.inst と S.t を差し替える（game.ts の handoff）
// =====================================================================
const LEAD = 5;                  // 確認用：前のフェーズの終わりの何秒前から始めるか
const BOSS_R = 6;                // ケフカ・ゴッドケフカのターゲットサークル（P1・P2 と同じ）
const P2_EMB = s => s === 'MT' ? { x:-.6, z:-8.6 } : s === 'ST' ? { x:.6, z:-8.6 } : add({ x:0, z:8 }, at(SLOTS.indexOf(s) * 45 + 22.5, 1.1)); // P2 通しの始まりの位置（mech_p2m の embSpot）
const P1_END = s => add({ x:0, z:10 }, at(SLOTS.indexOf(s) * 45 + 22.5, 2.6)); // P1 の終わり：中央の南寄りに集まって待つ（動画）
const lerp = (a, b, k) => ({ x:a.x + (b.x - a.x) * k, z:a.z + (b.z - a.z) * k });
const clamp01 = v => Math.max(0, Math.min(1, v));

// 味方：決まった時刻の間に、ある位置から別の位置へ歩く（walk：[[from 時刻, to 時刻, from 位置, to 位置], …]）
function makeBots(me, plan){
  const bots = SLOTS.filter(k => k !== me).map(k => ({ k, x:0, z:0 }));
  const place = t => bots.forEach(b => { const q = plan(b.k, t); b.x = q.x; b.z = q.z; });
  return { bots, place, draw: () => bots.forEach(drawBot) };
}
// ボスの輪（ターゲットサークル）。出てくる・消えるは薄さで
const boss = (r = BOSS_R) => [{ id:'k', name:'ケフカ', x:0, z:0, face:{ x:0, z:-1 }, r }];
// 光の柱（上の層。フィールドの中心から画面の上の端まで）
function pillar(g, k){
  const C = 144, h = 1000, w = Math.round((10 + 8 * Math.sin(k * Math.PI)) * PPY / 6);
  g.save(); g.globalAlpha = Math.sin(k * Math.PI) * .9;
  g.fillStyle = '#ffe888'; g.fillRect(C - w, -h, w * 2, h + C);
  g.fillStyle = '#fff6c8'; g.fillRect(C - Math.round(w * .55), -h, Math.round(w * 1.1), h + C);
  g.fillStyle = '#ffffff'; g.fillRect(C - Math.round(w * .2), -h, Math.round(w * .4), h + C);
  g.restore();
}
// ずんずんエアロガの床の模様：桃色の山形が外へ流れる（動画）
function chevrons(k){
  const n = 6, rings = [6, 10, 14, 18];
  alpha(.75 * Math.min(1, k * 3), () => rings.forEach((r0, j) => {
    const r = r0 + (k * 8 % 4);
    for (let i = 0; i < n * 2; i++){
      const a = (i / (n * 2)) * 360 + j * 15, tip = at(a, r + 1.2), l = at(a - 9, r - .4), rr = at(a + 9, r - .4);
      [[l, tip], [tip, rr]].forEach(([p0, p1]) => {
        for (let s = 0; s <= 6; s++){ const q = lerp(p0, p1, s / 6); rect(px(q.x) - 1, px(q.z) - 1, 3, 3, s % 2 ? '#ff8ad8' : '#ffc8f0'); }
      });
    }
  }));
}
// 羽根が舞い落ちる（P1→P2：光の柱のまわり、P2→P3：ゴッドケフカが崩れるとき）。k：0〜1 の濃さ、t：時刻
function feathers(t, k, n = 26, fall = 6){
  alpha(k, () => { for (let i = 0; i < n; i++){
    const h = (i * 0.6180339) % 1, x = (h - .5) * 40 + Math.sin(t * 1.7 + i) * 2, z = ((h * 97 + t * fall) % 44) - 22;
    const X = px(x), Z = px(z), tilt = Math.sin(t * 3 + i) > 0 ? 1 : -1;
    rect(X - 2, Z, 5, 2, '#ffffff'); rect(X - 2 + (tilt > 0 ? 4 : 0), Z - 1, 1, 1, '#ffffff'); rect(X - 1, Z + 2, 3, 1, '#c8d0e8');
  } });
}
// 衝撃の輪（中心から広がる）。k：0〜1
function shock(k, col = '#fff6c8'){
  if (k <= 0 || k >= 1) return;
  const r = Math.round((3 + k * 22) * PPY);
  alpha(1 - k, () => { ring(px(0), px(0), r, col); ring(px(0), px(0), r - 1, col); ring(px(0), px(0), r - 3, '#ffffff'); });
}
// 金色の光が床に満ちる（P1→P2）。k：0〜1
function goldFlood(k){ if (k > 0) alpha(Math.min(.55, k * .55), () => disc(px(0), px(0), Math.round((2 + k * 22) * PPY), '#ffe888')); }
// 風の筋（ずんずんエアロガ）：中心から外へ流れる白い線
function windLines(t, k){
  alpha(.8 * k, () => { for (let i = 0; i < 24; i++){ const a = i * 15 + (i % 3) * 5, r0 = 4 + ((t * 18 + i * 7) % 16); const p0 = at(a, r0), p1 = at(a + 4, r0 + 3); ctx.strokeStyle = i % 2 ? '#ffffff' : '#ffc8f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(p0.x), px(p0.z)); ctx.lineTo(px(p1.x), px(p1.z)); ctx.stroke(); } });
}
// 話す枠（セリフ）。名前と行（| で改行）。フィールドの上のほう
const talkBox = (name, text) => `<div style="transform:translateY(-6.2em);display:inline-block;text-align:left;background:rgba(10,8,24,.9);border:2px solid var(--gold);box-shadow:0 0 0 2px #000;padding:3px 10px 5px;font-size:14px;line-height:1.35"><div style="color:var(--gold);font-size:12px">${name}</div>${text.split('|').join('<br>')}</div>`;
// ボスの名前の大きな文字（出てきたとき）
const banner = name => `<div class="big" style="color:var(--gold);transform:translateY(3.2em);letter-spacing:.08em">${name}</div>`;
// セリフ（| で改行）。フィールドの上のほうに出す
const say = text => talkBox('ケフカ', text);

// ---------------------------------------------------------------------
// つなぎ P1→P2（0＝P1 の時間切れ。P1 通しの 173.3）
// ケフカが消える 2 → 床が金色 4 → 光の柱 6.5〜9.5 → ゴッドケフカ 9（セリフ）→ 殴れる 11.5 → P2 通しの 0（＝殴れるの 4.4 秒後。cactbot 307.6 → 312.0）
// ---------------------------------------------------------------------
// 演出（2026-10-16 ユーザー「つまらない」→ 派手に）：ケフカが白く点滅して震え、紫の光の粒になって消える → 金の光が床に満ちて白く光る → 羽根が舞い、光の柱
// → ゴッドケフカが上から降りてくる → 着地で衝撃の輪と揺れ、名前の大きな文字とセリフの枠
const T12 = { blink:1.2, gone:2, gold:4, pillar:[6.5, 9.5], descend:[8.1, 9], god:9, talk:[9.6, 14], name:[9, 11.5], targetable:11.5, handoff:15.9 };
function makeLink12({ lead = 0, check = false } = {}){
  const me = mySlot();
  const p2 = RUN2.create(RUN2.gen());
  const P1_HP = 1e7; // 確認用の見た目だけ（P1 の終わりの HP は 15% 少し上）
  const bots = makeBots(me, (k, t) => t < T12.targetable ? P1_END(k) : lerp(P1_END(k), P2_EMB(k), clamp01((t - T12.targetable) / 3)));
  let started = false, music = false;
  // ボスの絵：P1 のケフカ（時間切れで白く点滅して震え、消える）→ ゴッドケフカ（上から降りてくる）
  const art12 = t => {
    if (t < 0) return 'kefka';
    if (t < T12.gone) return { id:'kefka', gray:t < T12.blink && Math.floor(t * 10) % 2 === 0, dx:Math.round(Math.sin(t * 60) * 2), a:t < T12.blink ? 1 : 1 - (t - T12.blink) / (T12.gone - T12.blink) };
    const k = clamp01((t - T12.descend[0]) / (T12.descend[1] - T12.descend[0])), e = 1 - (1 - k) * (1 - k);
    return { id:'god', a:k * 1.5, dy:(1 - e) * 140, k:.7 + .3 * e };
  };
  const self = {
    view:24, t0:-lead, countdown:3, start:P1_END(me), bossR:BOSS_R,
    intro:'つなぎ P1→P2（確認用）', end:1e9, noEnrage:true, killAfter:1e9,
    casts:[],
    get bossHp(){ return S.t < 0 ? P1_HP : S.t >= T12.targetable ? p2.bossHp : 0; },
    get bossName(){ return S.t < 0 ? 'ケフカ' : p2.bossName; },
    targetable: t => t < 0 || t >= T12.targetable,
    bosses: t => t < T12.gone ? [{ ...boss()[0], art:art12(t) }] : t >= T12.descend[0] ? [{ ...boss()[0], art:art12(t) }] : [],
    progress: t => t < 0 ? 'P1 の終わり' : t < T12.targetable ? 'つなぎ（P1→P2）' : 'P2 の始まり',
    message: t => (t >= T12.name[0] && t < T12.name[1] ? banner('ゴッドケフカ') : '') + (t >= T12.talk[0] && t < T12.talk[1] ? say('絶ッ！！|再現したな、この私を……！') : ''),
    tick(t){
      if (!started){ started = true; if (lead) A.dmg = P1_HP * .84; }
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#ffffff', .5, .25); sfx.big(); bgm.stop(1.5); }
      if (t >= T12.blink && !self._burst){ self._burst = true; fxParts(60, 0, 0, { cols:['#c890ff', '#7a2a7a', '#ffffff', '#ff8ad8'], speed:7, up:10, life:1.6, spread:3 }); fxShake(3, .6); sfx.boom(); }
      if (t >= T12.gold && !self._gold){ self._gold = true; fxFlash('#fff6c8', .8, .7); fxShake(2, .4); sfx.blip(880, .3); }
      if (t >= T12.god && !music){ music = true; fxFlash('#ffffff', .7, .4); fxShake(5, .7); bgm.use('p2'); setTimeout(() => { if (S.inst === self || S.inst === p2) bgm.start(); }, 300); fxParts(24, 0, 0, { cols:['#fff6c8', '#ffe888', '#ffffff'], speed:8, up:8, life:1, spread:4 }); sfx.big(); }
      if (t >= T12.targetable && !self._hit){ self._hit = true; A.dmg = 0; sfx.blip(990, .15); }
      bots.place(t);
    },
    safeActive: () => false, safe: () => true,
    guide(t){ if (t < T12.targetable) return; const g = P2_EMB(me); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
    screenBg: t => t < T12.gold ? statueScreenBg(3, 99) : bgImg(true),
    drawFloor(){ clearOutside(); },
    draw(t){
      // ケフカが消える（0〜2）・ゴッドケフカが出る（9〜）：輪の薄さで。消える間は紫の光
      if (t >= T12.blink && t < T12.gone) alpha((T12.gone - t) / (T12.gone - T12.blink) * .6, () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#c890ff'));
      if (t >= T12.gone && t < T12.gold + 1) goldFlood((t - T12.gone) / (T12.gold - T12.gone));
      if (t >= T12.god && t < T12.god + 1) alpha(1 - (t - T12.god), () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#fff6c8'));
      shock((t - T12.god) / .8);
      bots.draw();
      if (t >= T12.pillar[0] - 1 && t < T12.targetable + 2) feathers(t, Math.min(1, (t - T12.pillar[0] + 1), (T12.targetable + 2 - t) / 2));
    },
    drawTop(t, g){ if (t >= T12.pillar[0] && t < T12.pillar[1]) pillar(g, (t - T12.pillar[0]) / (T12.pillar[1] - T12.pillar[0])); },
    // P2 通しへ（0 から。ダメージはそのまま引き継ぐ）
    handoff:{ at:T12.handoff, go(){
      if (check){ p2.end = 12; p2.noEnrage = true; } // 確認用：終末の双腕のあと少しで終わり
      const t2 = p2.tick; p2.tick = t => { t2(t); if (p2.bossHp && A.dmg > p2.bossHp * .999) A.dmg = p2.bossHp * .999; }; // P2 は 0.1% で耐える（ユーザー 2026-10-16）
      return { inst:p2, t:0 };
    } },
  };
  return self;
}

// ---------------------------------------------------------------------
// つなぎ P2→P3（0＝ゴッドケフカが殴れなくなる。P2 通しの 166.7）
// ケフカが出る 2・ずんずんエアロガ 2〜5.5（床の模様 3〜6）→ ノックダウン 5.5 → P3 へ 6.5
// → P3 通しの −4.5 から（P3 の 0 ＝エアロガの 40 秒後。cactbot 600 → 640）。再構築の詠唱（P3 の −2.7〜2.5）のあいだにエクスデスとカオスが殴れる（0.3）
// ---------------------------------------------------------------------
// 演出：ゴッドケフカが震えて白く抜け、羽根が飛び散って消える → 紫の煙からケフカが飛び出す（高笑い）→ エアロガの風と床の模様 → ノックダウン（大きな揺れ）
// → 白く光って P3 へ（ムービーはなし）
// 実機ではノックダウンのあと約 31 秒のムービーがあるが、ツールでは入れない（ユーザー 2026-10-16）。ノックダウンの 1 秒後に白く光って P3 へ
const T23 = { fade:2, kefka:2, aeroCast:2, aero:5.5, floor:[3, 6], toP3:6.5, p3At:-4.5 };
function makeLink23({ lead = 0, check = false } = {}){
  const me = mySlot();
  const P2_HP = 1e7;
  const p3 = RUN3.create(RUN3.gen());
  const kb = {}; // ノックダウン：中心から外へ 3 押される（推定）
  const pos0 = k => P2_EMB(k);
  const bots = makeBots(me, (k, t) => { const q = pos0(k); if (t < T23.aero) return q; const u = dist(q, { x:0, z:0 }) || 1, f = clamp01((t - T23.aero) / .3) * 3; return { x:q.x + q.x / u * f, z:q.z + q.z / u * f }; });
  let started = false;
  // ボスの絵：ゴッドケフカ（震えて白く抜ける）→ ケフカ（小さく飛び出して大きくなる・詠唱中は左右に揺れる）
  const art23 = t => {
    if (t < 0) return 'god';
    if (t < T23.fade) return { id:'god', gray:t > .4, dx:Math.round(Math.sin(t * 50) * 2), a:t < 1 ? 1 : 2 - t };
    const k = clamp01((t - T23.kefka) / .35);
    return { id:'kefka', k:.3 + .7 * k, a:k * 2, dx:t >= T23.aeroCast + .3 && t < T23.aero ? Math.round(Math.sin(t * 8) * 2) : 0 };
  };
  const self = {
    view:24, t0:-lead, countdown:3, start:P2_EMB(me), bossR:BOSS_R,
    intro:'つなぎ P2→P3（確認用）', end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'ずんずんエアロガ', start:T23.aeroCast, len:T23.aero - T23.aeroCast }],
    get bossHp(){ return S.t < 0 ? P2_HP : 0; },
    bossName:'ケフカ',
    targetable: t => t < 0,
    bosses: t => t < T23.fade || (t >= T23.kefka && t < T23.toP3) ? [{ ...boss()[0], art:art23(t) }] : [],
    progress: t => t < 0 ? 'P2 の終わり' : 'つなぎ（P2→P3）',
    tick(t){
      if (!started){ started = true; if (lead) A.dmg = P2_HP * .999; }
      if (t < 0 && A.dmg > P2_HP * .999) A.dmg = P2_HP * .999; // 0.1% で耐える
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#ffffff', .5, .3); fxShake(3, 1.2); sfx.big(); bgm.stop(1.5); }
      if (t >= 1.2 && !self._feather){ self._feather = true; fxParts(50, 0, 0, { cols:['#ffffff', '#e8ecf8', '#c8d0e8'], speed:9, up:8, life:1.8, spread:5 }); fxFlash('#ffffff', .6, .4); sfx.boom(); }
      if (t >= T23.kefka && !self._kefka){ self._kefka = true; fxParts(30, 0, 0, { cols:['#7a2a7a', '#c890ff', '#3a0c40'], speed:5, up:4, life:1, spread:3 }); sfx.blip(220, .2); if (opt.sound && sfx.ac) laugh(sfx.ac, sfx.ac.currentTime + .05, .3); }
      if (t >= T23.aero && !self._aero){ self._aero = true; fxFlash('#ff8ad8', .7, .5); fxShake(6, .8); sfx.boom(); sfx.big();
        const u = dist(S.player, { x:0, z:0 }) || 1; kb.from = { ...S.player }; kb.to = { x:S.player.x + S.player.x / u * 3, z:S.player.z + S.player.z / u * 3 }; kb.t0 = t; }
      if (kb.t0 != null && t - kb.t0 <= .3){ const q = lerp(kb.from, kb.to, clamp01((t - kb.t0) / .3)); S.player.x = q.x; S.player.z = q.z; }
      bots.place(t);
    },
    lockMove: t => t >= T23.aero, // ノックダウンのあいだは動けない
    status: t => t >= T23.aero && t < T23.toP3 ? [{ glyph:'倒', color:'#b03a7a', name:'ノックダウン', sec:Math.ceil(T23.toP3 - t) }] : [],
    safeActive: () => false, safe: () => true,
    screenBg: t => t < T23.toP3 ? bgImg(true) : null,
    drawFloor(){ clearOutside(); },
    draw(t){
      if (t >= 0 && t < T23.fade) alpha((T23.fade - t) / T23.fade * .5, () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#fff6c8'));
      if (t >= T23.floor[0] && t < T23.floor[1]) chevrons((t - T23.floor[0]) / (T23.floor[1] - T23.floor[0]));
      if (t >= T23.aeroCast && t < T23.toP3) windLines(t, Math.min(1, (t - T23.aeroCast) / 1.5));
      bots.draw();
      if (t >= 1 && t < 4) feathers(t, Math.min(1, (4 - t) / 1.5), 30, 10);
    },
    // P3 通しへ（−4.5 から。再構築の詠唱を足す。自分は P3 の始まりの位置へ）
    handoff:{ at:T23.toP3, go(){
      p3.casts.push({ name:'再構築', start:-2.7, len:5.2 });
      p3.message = t => t < 0 ? say('さてさて、お立ち会い……|権限をちょっと拝借しまして～') : t < 4 ? say('ボクチンに不可能はなーい！') : '';
      if (check){ p3.end = 8; p3.noEnrage = true; } // 確認用：決戦のあと少しで終わり
      bgm.use('p3'); setTimeout(() => { if (S.inst === p3) bgm.start(); }, 300);
      fxFlash('#ffffff', .9, .8); fxShake(3, .5); sfx.big(); // ノックダウンのあと白く光って P3 へ
      return { inst:p3, t:T23.p3At, player:{ x:0, z:4 } };
    } },
  };
  return self;
}

// ---------------------------------------------------------------------
// つなぎ P3→P4（0＝エクスデスとカオスを倒した時。ユーザーの動画 2026-10-17・cactbot）
// 2 体が白く光って消える 0〜1 → ケフカが中央に出る 1.5（「つまらん！」2〜5）→ 殴れる 4.4（cactbot 1089.9＝倒して約 4.4 秒）
// → P4 通しの −3.6 から（P4 の 0＝倒して約 8 秒。おちょくりソウルの詠唱 1.45＝cactbot 1095.0）。足場と空は P3 のまま
// ---------------------------------------------------------------------
const T34 = { fade:1, kefka:1.5, talk:[2, 5], handoff:4.4, p4At:-3.6 };
const P3_BOSS = { chaos:{ x:-7, z:-2 }, exdeath:{ x:7, z:-2 } };
function makeLink34({ lead = 0, check = false } = {}){
  const me = mySlot();
  const p4 = withSky(P4, 'ruins', 'kefka').create(P4.gen());
  const P3_HP = 1e7;
  const home = k => add({ x:0, z:10 }, at(SLOTS.indexOf(k) * 45 + 22.5, 2.6));
  const bots = makeBots(me, k => home(k));
  let started = false;
  const self = {
    view:24, t0:-lead, countdown:3, start:home(me), bossR:6,
    intro:'つなぎ P3→P4（確認用）', end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'バウル・オブ・アゴニー', start:-3, len:5 }],
    get bossHp(){ return S.t < 0 ? P3_HP : 0; }, bossName:'ボス',
    targetable: t => t < 0,
    bosses: t => t < 0 ? [{ id:'chaos', name:'カオス', ...P3_BOSS.chaos, face:{ x:0, z:1 }, r:5 }, { id:'exdeath', name:'エクスデス', ...P3_BOSS.exdeath, face:{ x:0, z:1 }, r:5 }]
      : t >= T34.kefka ? [{ ...boss()[0], art:{ id:'kefka', k:.3 + .7 * clamp01((t - T34.kefka) / .3) } }] : [],
    progress: t => t < 0 ? 'P3 の終わり' : 'つなぎ（P3→P4）',
    message: t => t >= T34.talk[0] && t < T34.talk[1] ? say('つまらん！') : '',
    tick(t){
      if (!started){ started = true; if (lead) A.dmg = P3_HP * .97; }
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#ffffff', .6, .5); fxShake(4, .6); sfx.big(); bgm.stop(1.2); Object.values(P3_BOSS).forEach(q => fxParts(30, q.x, q.z, { cols:['#ffffff', '#ffe070', '#c8e0ff'], speed:7, up:8, life:1.2, spread:3 })); }
      if (t >= T34.kefka && !self._kefka){ self._kefka = true; fxParts(30, 0, 0, { cols:['#7a2a7a', '#c890ff', '#3a0c40'], speed:5, up:4, life:1, spread:3 }); sfx.blip(220, .2); if (opt.sound && sfx.ac) laugh(sfx.ac, sfx.ac.currentTime + .05, .3); }
      bots.place(t);
    },
    safeActive: () => false, safe: () => true,
    screenBg: () => skyBg('ruins'),
    drawFloor(){ clearOutside(); },
    draw(t){
      // P3 のボス（倒した後は白く光って薄くなる）
      [['chaos', P3_BOSS.chaos], ['exdeath', P3_BOSS.exdeath]].forEach(([id, q]) => {
        const a = t < 0 ? 1 : 1 - t / T34.fade; if (a <= 0) return;
        const sp = bossSprite(id); ctx.save(); ctx.globalAlpha = a; if (t >= 0) ctx.filter = 'brightness(2.2)'; ctx.drawImage(sp, Math.round(px(q.x) - sp.dw / 2), Math.round(px(q.z) - sp.dh / 2), sp.dw, sp.dh); ctx.restore();
      });
      bots.draw();
    },
    handoff:{ at:T34.handoff, go(){
      if (check){ p4.end = 14; p4.noEnrage = true; } // 確認用：最初のなぞなぞマジックのあと少しで終わり
      bgm.use('p4'); setTimeout(() => { if (S.inst === p4) bgm.start(); }, 300);
      return { inst:p4, t:T34.p4At };
    } },
  };
  return self;
}

// ---------------------------------------------------------------------
// つなぎ P4→P5（0＝どきどきアルテマの着弾＝P5 通しの 0。cactbot 1362.0。ユーザーの動画 2026-10-17）
// 青い光 0 → 足場と空が P5 に 2 → ケフカ（殴れない）「すべてはいずれ、壊れゆく……」3〜8 → ケフカが跳ねて消え、中央に黒い穴 8〜10
// → 大きな光の爆発 10 → 床の光の輪と光の柱 10〜20、カオスケフカが光の中から上がってくる 13〜17
// →「お前たちが造り続けるというのなら……」15〜21 →「私は破壊し続けよう！」21〜26 → P5 通しの 30 へ（殴れるのは 33。cactbot 1393〜1395）
// ---------------------------------------------------------------------
const T45 = { ultCast:-5, flash:0, stage:2, talk1:[3, 8], jump:8, hole:[8, 10.4], boom:10, light:[10, 20], rise:[13, 17], talk2:[15, 21], talk3:[21, 26], handoff:30 };
const P5_HOME = { T:{ x:0, z:-10 }, H:{ x:-7.5, z:7.5 }, D:{ x:7.5, z:7.5 } }; // mech_run の HOME
function makeLink45({ lead = 0, check = false } = {}){
  const me = mySlot();
  const p5 = withSky(RUN, 'nebula', 'chaos').create(RUN.gen());
  const P4_HP = 1e7;
  const role = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];
  const p4Spot = k => add({ x:0, z:11 }, at(SLOTS.indexOf(k) * 45 + 22.5, 2.6));
  const p5Spot = k => add(P5_HOME[role(k)], at(SLOTS.indexOf(k) * 90, .9));
  const bots = makeBots(me, (k, t) => t < 20 ? p4Spot(k) : lerp(p4Spot(k), p5Spot(k), clamp01((t - 20) / 4)));
  let started = false;
  const self = {
    view:24, t0:-lead, countdown:3, start:p4Spot(me), bossR:8,
    intro:'つなぎ P4→P5（確認用）', end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'どきどきアルテマ', start:T45.ultCast, len:-T45.ultCast }],
    get bossHp(){ return S.t < T45.ultCast ? P4_HP : 0; }, bossName:'ケフカ',
    targetable: t => t < T45.ultCast,
    bosses: t => t < T45.jump + .6 ? [{ ...boss(8)[0], art:art45(t) }] : t >= T45.rise[0] ? [{ ...boss(8)[0], art:art45(t) }] : [],
    progress: t => t < 0 ? 'P4 の終わり' : 'つなぎ（P4→P5）',
    message: t => t >= T45.talk1[0] && t < T45.talk1[1] ? say('すべてはいずれ、壊れゆく……') : t >= T45.talk2[0] && t < T45.talk2[1] ? say('お前たちが造り続けるというのなら……') : t >= T45.talk3[0] && t < T45.talk3[1] ? say('私は破壊し続けよう！') : '',
    tick(t){
      if (!started){ started = true; if (lead) A.dmg = P4_HP * .78; }
      if (t >= 0 && !self._ult){ self._ult = true; A.dmg = 0; fxFlash('#7ac8ff', .9, .9); fxShake(5, .8); sfx.big(); sfx.boom(); bgm.stop(1.5); }
      if (t >= T45.stage && !self._stage){ self._stage = true; fxFlash('#000000', .7, .6); }
      if (t >= T45.jump && !self._jump){ self._jump = true; sfx.blip(330, .15); if (opt.sound && sfx.ac) laugh(sfx.ac, sfx.ac.currentTime + .05, .25); }
      if (t >= T45.boom && !self._boom){ self._boom = true; fxFlash('#ffffff', 1, 1); fxShake(6, 1); sfx.big(); sfx.boom(); fxParts(60, 0, 0, { cols:['#ffffff', '#ffe888', '#c8e0ff', '#ffc8f0'], speed:10, up:10, life:1.6, spread:2 }); }
      if (t >= T45.rise[0] + 2 && !self._chaos){ self._chaos = true; fxShake(3, .6); sfx.big(); bgm.use('p5'); setTimeout(() => { if (S.inst === self || S.inst === p5) bgm.start(); }, 300); }
      bots.place(t);
    },
    safeActive: () => false, safe: () => true,
    guide(t){ if (t < 20) return; const g = p5Spot(me); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
    screenBg: t => t < T45.stage ? skyBg('ruins') : skyBg('nebula'),
    drawFloor(){ clearOutside(); },
    draw(t){
      // 黒い穴（中央に広がる）→ 爆発のあとは床に光の輪
      if (t >= T45.hole[0] && t < T45.hole[1]){ const k = clamp01((t - T45.hole[0]) / 1.6); disc(px(0), px(0), Math.round((1 + k * 7) * PPY), '#05030c'); ring(px(0), px(0), Math.round((1 + k * 7) * PPY), '#8a4aff'); }
      if (t >= T45.light[0] && t < T45.light[1]){ const k = Math.min(1, (t - T45.light[0]) / .6, (T45.light[1] - t) / 1.5); alpha(.55 * k, () => disc(px(0), px(0), Math.round(9 * PPY), '#ffe888')); alpha(.8 * k, () => ring(px(0), px(0), Math.round(9 * PPY), '#ffffff')); }
      shock((t - T45.boom) / .9, '#ffffff');
      bots.draw();
    },
    drawTop(t, g){ if (t >= T45.light[0] && t < T45.light[1]) pillar(g, (t - T45.light[0]) / (T45.light[1] - T45.light[0])); },
    handoff:{ at:T45.handoff, go(){
      if (check){ p5.end = 45; p5.noEnrage = true; } // 確認用：連続アルテマのあと少しで終わり
      return { inst:p5, t:T45.handoff };
    } },
  };
  // ボスの絵：P4 のケフカ（どきどきアルテマのあとは殴れない）→ 跳ねて消える → カオスケフカが光の中から上がってくる
  function art45(t){
    if (t < T45.jump) return 'kefka';
    if (t < T45.jump + .6){ const k = (t - T45.jump) / .6; return { id:'kefka', dy:Math.sin(k * Math.PI) * 30, k:1 - k * .6, a:1 - k }; }
    const k = clamp01((t - T45.rise[0]) / (T45.rise[1] - T45.rise[0])), e = 1 - (1 - k) * (1 - k);
    return { id:'chaos', a:k * 1.5, dy:-(1 - e) * 30, k:.4 + .6 * e };
  }
  return self;
}

// 確認用のメニュー（今だけ。全通しができたら消す）
const LINK12 = { id:'link12', name:'つなぎ P1→P2', sub:'', view:24, start:{ x:0, z:5 }, slots:true, bgmKey:'p1c',
  gen: () => null, create: () => makeLink12({ lead:LEAD, check:true }) };
const LINK23 = { id:'link23', name:'つなぎ P2→P3', sub:'', view:24, start:{ x:0, z:8 }, slots:true, bgmKey:'p2',
  gen: () => null, create: () => makeLink23({ lead:LEAD, check:true }) };

const LINK34 = { id:'link34', name:'つなぎ P3→P4', sub:'', view:24, start:{ x:0, z:6 }, slots:true, bgmKey:'p3',
  gen: () => null, create: () => makeLink34({ lead:LEAD, check:true }) };
const LINK45 = { id:'link45', name:'つなぎ P4→P5', sub:'', view:24, start:{ x:0, z:5 }, slots:true, bgmKey:'p4',
  gen: () => null, create: () => makeLink45({ lead:LEAD, check:true }) };

export { LINK12, LINK23, LINK34, LINK45, makeLink12, makeLink23, makeLink34, makeLink45 };
