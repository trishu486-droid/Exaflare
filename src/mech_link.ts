// @ts-nocheck
import { S } from './state.js';
import { A } from './action.js';
import { bgm, sfx } from './audio.js';
import { fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, alpha, ctx, disc, rect, ring, px } from './gfx.js';
import { mySlot } from './jobs.js';
import { opt } from './store.js';
import { laugh } from './kefka_intro.js';
import { SLOTS, add, at, dist, drawBot, statueScreenBg, statueRiseBg } from './p1lib.js';
import { clearOutside, bgImg } from './mech_p2m.js';
import { RUN1 } from './mech_p1run.js';
import { RUN2 } from './mech_p2run.js';
import { RUN3 } from './mech_p3run.js';
import { P4 } from './mech_p4.js';
import { RUN } from './mech_run.js';
import { withSky, skyBg } from './sky.js';
import { bossSprite } from './p4boss.js';
import { kefkaSprite } from './kefka_art.js';
import { setBossArtFx } from './mech_p3.js';
import { chaosFall, chaosLand, chaosJump, kefkaSmoke, godDescend, godFlyAway, exdeathLight } from './bossfx.js';

// =====================================================================
// フェーズのつなぎ目（全通しの部品）。docs/README.md 6章の3（ユーザーの動画 2026-10-16）
//   つなぎ P1→P2：P1 の時間切れ（最後の裁きの光は来ない）→ ケフカが消える → 床が金色に → 光の柱からゴッドケフカ → 殴れる → P2 通しへ
//   つなぎ P2→P3：ゴッドケフカが殴れなくなる（HP は 0.1% で耐える）→ ケフカが出て「ずんずんエアロガ」→ ノックダウン → P3 通しへ（実機のムービーは入れない）
// つなぎの時刻は、つなぎの 0（＝前のフェーズの終わり）からの秒。次のフェーズに切り替えるときは S.inst と S.t を差し替える（game.ts の handoff）
// =====================================================================
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
// 風の筋（ずんずんエアロガ）：中心から外へ流れる白い線
function windLines(t, k){
  alpha(.8 * k, () => { for (let i = 0; i < 24; i++){ const a = i * 15 + (i % 3) * 5, r0 = 4 + ((t * 18 + i * 7) % 16); const p0 = at(a, r0), p1 = at(a + 4, r0 + 3); ctx.strokeStyle = i % 2 ? '#ffffff' : '#ffc8f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(p0.x), px(p0.z)); ctx.lineTo(px(p1.x), px(p1.z)); ctx.stroke(); } });
}
// 話す枠（セリフ）。名前と行（| で改行）。フィールドの上のほう
const talkBox = (name, text) => `<div style="transform:translateY(-6.2em);display:inline-block;text-align:left;background:rgba(10,8,24,.9);border:2px solid var(--gold);box-shadow:0 0 0 2px #000;padding:3px 10px 5px;font-size:14px;line-height:1.35"><div style="color:var(--gold);font-size:12px">${name}</div>${text.split('|').join('<br>')}</div>`;
// セリフ（| で改行）。フィールドの上のほうに出す
const say = text => talkBox('ケフカ', text);

// ---------------------------------------------------------------------
// つなぎ P1→P2（0＝P1 の時間切れ。P1 通しの 173.3）
// ケフカが消える 2 → 床が金色 4 → 光の柱 6.5〜9.5 → ゴッドケフカ 9（セリフ）→ 殴れる 11.5 → P2 通しの 0（＝殴れるの 4.4 秒後。cactbot 307.6 → 312.0）
// ---------------------------------------------------------------------
// 演出（2026-10-16 ユーザー「つまらない」→ 派手に）：ケフカが白く点滅して震え、紫の光の粒になって消える → 金の光が床に満ちて白く光る → 羽根が舞い、光の柱
// → ゴッドケフカが上から降りてくる → 着地で衝撃の輪と揺れ、名前の大きな文字とセリフの枠
// ケフカは時間切れで白く点滅して震え、白い煙（手品）の中に消える 1.2〜2.2。ゴッドケフカは上から神々しくゆっくり舞い降りる 5.5〜9（ユーザー 2026-10-17）
// ステージが天へ昇る 1.5〜5（像が下へ流れて通り越し、どんどん明るくなって P2 の金色に。昇る間だけステージを揺らす）
const T12 = { blink:1.2, gone:2.2, rise:[1.5, 5], gold:5, pillar:[5, 9.5], descend:[5.5, 9], god:9, talk:[9.6, 14], targetable:11.5, handoff:15.9 };
function makeLink12(){
  const me = mySlot();
  const p2 = RUN2.create(RUN2.gen()); p2.floorTheme = 'gold';
  const P1_HP = 1e7; // つなぎの 0 より前の HP の見た目（全通しでは 0 から入るので使わない）
  const bots = makeBots(me, (k, t) => t < T12.targetable ? P1_END(k) : lerp(P1_END(k), P2_EMB(k), clamp01((t - T12.targetable) / 3)));
  let music = false;
  // ボスの絵：P1 のケフカ（時間切れで白く点滅して震える）→ 煙の中に消える・ゴッドケフカが舞い降りる間は draw で描く → ゴッドケフカ
  const art12 = t => {
    if (t < 0) return 'kefka';
    if (t < T12.blink) return { id:'kefka', gray:Math.floor(t * 10) % 2 === 0, dx:Math.round(Math.sin(t * 60) * 2) };
    return t >= T12.descend[1] ? 'god' : null;
  };
  const self = {
    view:24, t0:0, countdown:3, start:P1_END(me), bossR:BOSS_R,
    end:1e9, noEnrage:true, killAfter:1e9,
    casts:[],
    get bossHp(){ return S.t < 0 ? P1_HP : S.t >= T12.targetable ? p2.bossHp : 0; },
    get bossName(){ return S.t < 0 ? 'ケフカ' : p2.bossName; },
    targetable: t => t < 0 || t >= T12.targetable,
    bosses: t => t < T12.blink || t >= T12.descend[1] ? [{ ...boss()[0], art:art12(t) }] : [],
    progress: t => t < 0 ? 'P1 の終わり' : t < T12.targetable ? 'つなぎ（P1→P2）' : 'P2 の始まり',
    message: t => t >= T12.talk[0] && t < T12.talk[1] ? say('絶ッ！！|再現したな、この私を……！') : '', // 名前の大きな文字はなし（ユーザー 2026-10-17）
    tick(t){
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#ffffff', .5, .25); sfx.big(); bgm.stop(1.5); }
      if (t >= T12.blink && !self._burst){ self._burst = true; fxParts(30, 0, 0, { cols:['#ffffff', '#e8e4f0', '#d0cce0'], speed:5, up:6, life:1.2, spread:3 }); sfx.blip(520, .1); sfx.blip(780, .12); }
      if (t >= T12.rise[0] && !self._rise){ self._rise = true; fxShake(2, T12.rise[1] - T12.rise[0]); sfx.tone(46, T12.rise[1] - T12.rise[0], 'sawtooth', .05, -8); sfx.tone(62, T12.rise[1] - T12.rise[0], 'triangle', .08, -12); } // ゴゴゴゴ
      if (t >= T12.gold && !self._gold){ self._gold = true; fxFlash('#ffffff', .9, .9); sfx.blip(880, .3); }
      if (t >= T12.god && !music){ music = true; fxFlash('#ffffff', .5, .4); bgm.use('p2'); setTimeout(() => { if (S.inst === self || S.inst === p2) bgm.start(); }, 300); fxParts(24, 0, 0, { cols:['#fff6c8', '#ffe888', '#ffffff'], speed:8, up:8, life:1, spread:4 }); sfx.big(); }
      if (t >= T12.targetable && !self._hit){ self._hit = true; A.dmg = 0; sfx.blip(990, .15); }
      bots.place(t);
    },
    safeActive: () => false, safe: () => true,
    guide(t){ if (t < T12.targetable) return; const g = P2_EMB(me); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
    // 背景：上段の像 → 天へ昇って像が下へ抜ける → 光が半分以上かかったところで P2 の金色の空（光を描く層は画面の上下の端まで届かないので、そこで目立たないように）
    screenBg: t => t < T12.rise[0] ? statueScreenBg(3, 99) : t < T12.rise[1] - .9 ? statueRiseBg(Math.pow(clamp01((t - T12.rise[0]) / (T12.rise[1] - T12.rise[0])), 1.6)) : bgImg(true),
    drawFloor(){ clearOutside(); },
    draw(t){
      // ケフカは白い煙の中に消える（手品）。ゴッドケフカは上から神々しくゆっくり舞い降りる（bossfx.ts）
      if (t >= T12.blink && t < T12.gone + .4) kefkaSmoke(kefkaSprite('kefka'), px(0), px(0), (t - T12.blink) / (T12.gone + .4 - T12.blink), false);
      if (t >= T12.descend[0] && t < T12.descend[1]) godDescend(kefkaSprite('god'), px(0), px(0), (t - T12.descend[0]) / (T12.descend[1] - T12.descend[0]));
      if (t >= T12.god && t < T12.god + 1) alpha(1 - (t - T12.god), () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#fff6c8'));
      shock((t - T12.god) / .8);
      bots.draw();
      if (t >= T12.pillar[0] - 1 && t < T12.targetable + 2) feathers(t, Math.min(1, (t - T12.pillar[0] + 1), (T12.targetable + 2 - t) / 2));
    },
    drawTop(t, g){
      // 天へ昇るにつれて、画面がどんどん明るく（金色の光）なり、P2 の明るさへ
      if (t >= T12.rise[0] + 1 && t < T12.gold + 1.2){ const k = t < T12.gold ? (t - T12.rise[0] - 1) / (T12.gold - T12.rise[0] - 1) : 1 - (t - T12.gold) / 1.2; g.save(); g.globalAlpha = Math.max(0, Math.min(.75, k * .75)); g.fillStyle = '#fff2c0'; g.fillRect(-50, -5000, 400, 10000); g.restore(); }
      if (t >= T12.pillar[0] && t < T12.pillar[1]) pillar(g, (t - T12.pillar[0]) / (T12.pillar[1] - T12.pillar[0]));
    },
    // P2 通しへ（0 から。ダメージはそのまま引き継ぐ）
    handoff:{ at:T12.handoff, go(){
      // 全通し：殴れなくなる時（166.7）に削りきっていれば、つなぎ P2→P3 へ。足りなければそのまま時間切れ（裁きの光）
      p2.stage = 'P2'; p2.killAfter = P2_UNTARGET; p2.next = () => ({ inst:linkInst(makeLink23(), 'gold', 'つなぎ P2→P3'), t:0 });
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
// ゴッドケフカは羽ばたいて一瞬で真上へ飛び去る 0〜1.2、ケフカは白い煙（手品）の中から出る 2〜2.8（ユーザー 2026-10-17）
// エアロガでステージの半径の 6 割（12）飛ばされ、その瞬間に背景が P3 の空へ（短いグラデーション。暗転はしない）。飛ばされた所で P3 が始まる
// P3 は実機のムービー明け（P3 の −7。ケフカが北で「再構築」を詠唱中・残り約 4 秒）から。ノックダウンは −6 まで（ユーザー 2026-10-17）
const T23 = { fade:1.2, kefka:2, kefkaIn:.8, aeroCast:2, aero:5.5, floor:[3, 6], toP3:5.85, p3At:-7, kbLen:.35, kbDist:12, fadeBg:.35 };
function makeLink23(){
  const me = mySlot();
  const P2_HP = 1e7;
  const p3 = RUN3.create(RUN3.gen()); p3.floorTheme = 'blue';
  const kb = {}; // エアロガ：中心から外へ 12（ステージの半径の 6 割。ユーザー 2026-10-17）。外周の 19 まで
  const push = q => { const u = Math.hypot(q.x, q.z) || 1, r = Math.min(19, u + T23.kbDist); return { x:q.x / u * r, z:q.z / u * r }; };
  const pos0 = k => P2_EMB(k);
  const bots = makeBots(me, (k, t) => { const q = pos0(k); return t < T23.aero ? q : lerp(q, push(q), clamp01((t - T23.aero) / T23.kbLen)); });
  // ボスの絵：ゴッドケフカ（震えて白く抜ける）→ ケフカ（小さく飛び出して大きくなる・詠唱中は左右に揺れる）
  const art23 = t => {
    if (t < 0) return 'god';
    if (t < T23.kefka + T23.kefkaIn) return null; // 飛び去る・煙から出る間は draw で描く
    return { id:'kefka', dx:t >= T23.aeroCast + .3 && t < T23.aero ? Math.round(Math.sin(t * 8) * 2) : 0 };
  };
  const self = {
    view:24, t0:0, countdown:3, start:P2_EMB(me), bossR:BOSS_R,
    end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'ずんずんエアロガ', start:T23.aeroCast, len:T23.aero - T23.aeroCast }],
    get bossHp(){ return S.t < 0 ? P2_HP : 0; },
    bossName:'ケフカ',
    targetable: t => t < 0,
    bosses: t => t < 0 || (t >= T23.kefka + T23.kefkaIn && t < T23.toP3) ? [{ ...boss()[0], art:art23(t) }] : [],
    progress: t => t < 0 ? 'P2 の終わり' : 'つなぎ（P2→P3）',
    tick(t){
      if (t < 0 && A.dmg > P2_HP * .999) A.dmg = P2_HP * .999; // 0.1% で耐える
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#ffffff', .5, .3); sfx.big(); bgm.stop(1.5); }
      if (t >= .6 && !self._feather){ self._feather = true; fxParts(40, 0, 0, { cols:['#ffffff', '#e8ecf8', '#c8d0e8'], speed:8, up:12, life:1.6, spread:4 }); sfx.blip(880, .1); sfx.boom(); }
      if (t >= T23.kefka && !self._kefka){ self._kefka = true; fxParts(30, 0, 0, { cols:['#ffffff', '#e8e4f0', '#d0cce0'], speed:5, up:6, life:1.2, spread:3 }); sfx.blip(520, .1); sfx.blip(780, .12); } // 笑い声はなし（ユーザー 2026-10-17）
      if (t >= T23.aero && !self._aero){ self._aero = true; sfx.boom(); sfx.big();
        kb.from = { ...S.player }; kb.to = push(S.player); kb.t0 = t; }
      if (kb.t0 != null && t - kb.t0 <= T23.kbLen + .05){ const q = lerp(kb.from, kb.to, clamp01((t - kb.t0) / T23.kbLen)); S.player.x = q.x; S.player.z = q.z; }
      bots.place(t);
    },
    lockMove: t => t >= T23.aero, // ノックダウンのあいだは動けない（P3 に入っても −6 まで）
    status: t => t >= T23.aero ? [{ glyph:'倒', color:'#b03a7a', name:'ノックダウン', sec:Math.ceil(T23.toP3 - t + 1) }] : [],
    safeActive: () => false, safe: () => true,
    screenBg: t => t < T23.aero ? bgImg(true) : skyBg('ruins'), // 飛ばされた瞬間に P3 の空へ
    drawFloor(){ clearOutside(); },
    draw(t){
      if (t >= 0 && t < T23.fade) godFlyAway(kefkaSprite('god'), px(0), px(0), t / T23.fade);
      if (t >= T23.kefka && t < T23.kefka + T23.kefkaIn + .4) kefkaSmoke(kefkaSprite('kefka'), px(0), px(0), (t - T23.kefka) / (T23.kefkaIn + .4), true);
      if (t >= T23.floor[0] && t < T23.floor[1]) chevrons((t - T23.floor[0]) / (T23.floor[1] - T23.floor[0]));
      if (t >= T23.aeroCast && t < T23.toP3) windLines(t, Math.min(1, (t - T23.aeroCast) / 1.5));
      // 味方は出さない（P2 のミッシングの最後で自分に重なって消えている。P3〜P5 はオーケストラのほかは出さない。ユーザー 2026-10-17）
      if (t >= 1 && t < 4) feathers(t, Math.min(1, (4 - t) / 1.5), 30, 10);
    },
    // 飛ばされた瞬間、金色が短いグラデーションで薄れて P3 の空に（暗転はしない）
    drawTop(t, g){ if (t >= T23.aero && t < T23.aero + T23.fadeBg){ g.save(); g.globalAlpha = 1 - (t - T23.aero) / T23.fadeBg; g.fillStyle = '#f0bc3a'; g.fillRect(-50, -5000, 400, 10000); g.restore(); } },
    // P3 通しへ（−7＝ムービー明けから。飛ばされた所のまま。再構築の詠唱とケフカを足す）
    handoff:{ at:T23.toP3, go(){
      const REBUILD = [-7.7, -2.7], IN = [-2.7, -1.6], KD = -6; // 再構築（cactbot 637.3＝P3 の −2.7 に完了）、ボスが出る、ノックダウンが解ける
      const KQ = { x:0, z:-9 }; // ケフカは北で詠唱（セリフの枠に隠れないように少し内側）
      p3.casts.push({ name:'再構築', start:REBUILD[0], len:REBUILD[1] - REBUILD[0] });
      p3.message = t => t >= KD - .7 && t < REBUILD[1] ? say('さてさて、お立ち会い……|権限をちょっと拝借しまして～') : t >= 0 && t < 4 ? say('ボクチンに不可能はなーい！') : '';
      const lm = p3.lockMove, st = p3.status, dr = p3.draw;
      p3.lockMove = t => t < KD || !!lm?.(t);
      p3.status = t => [...(t < KD ? [{ glyph:'倒', color:'#b03a7a', name:'ノックダウン', sec:Math.ceil(KD - t) }] : []), ...(st?.(t) || [])];
      // ケフカ（殴れない・輪なし）：北で再構築を詠唱 → 詠唱が終わると白い煙で消える
      p3.draw = t => {
        dr.call(p3, t);
        const sp = kefkaSprite('kefka'), X = px(KQ.x), Z = px(KQ.z);
        if (t < REBUILD[1] && sp) ctx.drawImage(sp, Math.round(X - sp.width / 2 + (t > REBUILD[0] ? Math.round(Math.sin(t * 8)) : 0)), Math.round(Z - sp.height / 2));
        if (t >= REBUILD[1] && t < REBUILD[1] + 1.2) kefkaSmoke(sp, X, Z, (t - REBUILD[1]) / 1.2, false);
      };
      p3.stage = 'P3'; p3.next = () => ({ inst:linkInst(makeLink34(), 'blue', 'つなぎ P3→P4'), t:0 }); // 2体を倒したら
      bgm.use('p3'); setTimeout(() => { if (S.inst === p3) bgm.start(); }, 300);
      // P3 のボスの出方：カオスは上から降ってくる、エクスデスは縦の白い光の筋の中から出る（再構築が終わってから）。それまでは見えない。輪は殴れる 0.3 から
      const bz = p3.bosses, fired = {};
      p3.bosses = t => bz.call(p3, t).map(b => t < .3 ? { ...b, hideRing:true } : b);
      setBossArtFx((b, X, Z) => {
        if (S.inst !== p3 || S.t >= IN[1] + .4) return false;
        const k = (S.t - IN[0]) / (IN[1] - IN[0]), sp = bossSprite(b.id);
        if (k < 0) return true;
        if (b.id === 'chaos'){
          if (k < 1){ chaosFall(sp, X, Z, k); return true; }
          if (!fired.c){ fired.c = true; sfx.boom(); } // 着地
          ctx.drawImage(sp, Math.round(X - sp.dw / 2), Math.round(Z - sp.dh / 2), sp.dw, sp.dh); chaosLand(X, Z, sp, (S.t - IN[1]) / .4); return true;
        }
        if (k < 1){ exdeathLight(sp, X, Z, k, true); return true; }
        return false;
      });
      return { inst:p3, t:T23.p3At }; // 自分は飛ばされた所のまま
    } },
  };
  return self;
}

// ---------------------------------------------------------------------
// つなぎ P3→P4（0＝エクスデスとカオスを倒した時。ユーザーの動画 2026-10-17・cactbot）
// 2 体が白く光って消える 0〜1 → ケフカが中央に出る 1.5（「つまらん！」2〜5）→ 殴れる 4.4（cactbot 1089.9＝倒して約 4.4 秒）
// → P4 通しの −3.6 から（P4 の 0＝倒して約 8 秒。おちょくりソウルの詠唱 1.45＝cactbot 1095.0）。足場と空は P3 のまま
// ---------------------------------------------------------------------
// エクスデスは縦の白い光の筋の中に消える、カオスは真上にジャンプして消える 0〜1。ケフカは白い煙（手品）の中から出る 1.5〜2.3（ユーザー 2026-10-17）
const T34 = { fade:1, kefka:1.5, kefkaIn:.8, talk:[2, 5], handoff:4.4, p4At:-3.6 };
const P3_BOSS = { chaos:{ x:-7, z:-2 }, exdeath:{ x:7, z:-2 } };
function makeLink34(){
  const me = mySlot();
  const p4 = withSky(P4, 'ruins', 'kefka').create(P4.gen()); p4.floorTheme = 'blue';
  const P3_HP = 1e7;
  const home = k => add({ x:0, z:10 }, at(SLOTS.indexOf(k) * 45 + 22.5, 2.6));
  const bots = makeBots(me, k => home(k));
  const self = {
    view:24, t0:0, countdown:3, start:home(me), bossR:6,
    end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'バウル・オブ・アゴニー', start:-3, len:5 }],
    get bossHp(){ return S.t < 0 ? P3_HP : 0; }, bossName:'ボス',
    targetable: t => t < 0,
    bosses: t => t < 0 ? [{ id:'chaos', name:'カオス', ...P3_BOSS.chaos, face:{ x:0, z:1 }, r:5 }, { id:'exdeath', name:'エクスデス', ...P3_BOSS.exdeath, face:{ x:0, z:1 }, r:5 }]
      : t >= T34.kefka + T34.kefkaIn ? [{ ...boss()[0], art:'kefka' }] : [],
    progress: t => t < 0 ? 'P3 の終わり' : 'つなぎ（P3→P4）',
    message: t => t >= T34.talk[0] && t < T34.talk[1] ? say('つまらん！') : '',
    tick(t){
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#ffffff', .6, .5); sfx.big(); bgm.stop(1.2); fxParts(20, P3_BOSS.exdeath.x, P3_BOSS.exdeath.z, { cols:['#ffffff', '#c8e0ff'], speed:4, up:12, life:1, spread:2 }); }
      if (t >= T34.kefka && !self._kefka){ self._kefka = true; fxParts(30, 0, 0, { cols:['#ffffff', '#e8e4f0', '#d0cce0'], speed:5, up:6, life:1.2, spread:3 }); sfx.blip(520, .1); sfx.blip(780, .12); if (opt.sound && sfx.ac) laugh(sfx.ac, sfx.ac.currentTime + .05, .3); }
      bots.place(t);
    },
    safeActive: () => false, safe: () => true,
    screenBg: () => skyBg('ruins'),
    drawFloor(){ clearOutside(); },
    draw(t){
      // P3 のボス：倒すまではふつう。倒したら、カオスは真上にジャンプして消え、エクスデスは縦の白い光の筋の中に消える（bossfx.ts）
      const cs = bossSprite('chaos'), es = bossSprite('exdeath'), C = P3_BOSS.chaos, E = P3_BOSS.exdeath;
      if (t < 0){ [[cs, C], [es, E]].forEach(([sp, q]) => ctx.drawImage(sp, Math.round(px(q.x) - sp.dw / 2), Math.round(px(q.z) - sp.dh / 2), sp.dw, sp.dh)); }
      else {
        if (t < .8) chaosJump(cs, px(C.x), px(C.z), t / .8);
        if (t < 1.1) exdeathLight(es, px(E.x), px(E.z), t / 1.1, false);
      }
      if (t >= T34.kefka && t < T34.kefka + T34.kefkaIn + .4) kefkaSmoke(kefkaSprite('kefka'), px(0), px(0), (t - T34.kefka) / (T34.kefkaIn + .4), true);
      // 味方は出さない（P2 のミッシングの最後で自分に重なって消えている。P3〜P5 はオーケストラのほかは出さない。ユーザー 2026-10-17）
    },
    handoff:{ at:T34.handoff, go(){
      // 全通し：P4 の最後（25%未満まで削れていたら）→ つなぎ P4→P5 のどきどきアルテマの詠唱から。P4 のこの先（実機の 120 秒〜）はまだ作っていない
      p4.stage = 'P4'; p4.next = () => ({ inst:linkInst(makeLink45(), 'blue', 'つなぎ P4→P5'), t:T45.ultCast });
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
function makeLink45(){
  const me = mySlot();
  const p5 = withSky(RUN, 'nebula', 'chaos').create(RUN.gen()); p5.floorTheme = 'rust';
  const P4_HP = 1e7;
  const role = k => k[0] === 'M' || k[0] === 'S' ? 'T' : k[0];
  const p4Spot = k => add({ x:0, z:11 }, at(SLOTS.indexOf(k) * 45 + 22.5, 2.6));
  const p5Spot = k => add(P5_HOME[role(k)], at(SLOTS.indexOf(k) * 90, .9));
  const bots = makeBots(me, (k, t) => t < 20 ? p4Spot(k) : lerp(p4Spot(k), p5Spot(k), clamp01((t - 20) / 4)));
  const self = {
    view:24, t0:0, countdown:3, start:p4Spot(me), bossR:8,
    end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'どきどきアルテマ', start:T45.ultCast, len:-T45.ultCast }],
    get bossHp(){ return S.t < T45.ultCast ? P4_HP : 0; }, bossName:'ケフカ',
    targetable: t => t < T45.ultCast,
    bosses: t => t < T45.jump + .6 ? [{ ...boss(8)[0], art:art45(t) }] : t >= T45.rise[0] ? [{ ...boss(8)[0], art:art45(t) }] : [],
    progress: t => t < 0 ? 'P4 の終わり' : 'つなぎ（P4→P5）',
    message: t => t >= T45.talk1[0] && t < T45.talk1[1] ? say('すべてはいずれ、壊れゆく……') : t >= T45.talk2[0] && t < T45.talk2[1] ? say('お前たちが造り続けるというのなら……') : t >= T45.talk3[0] && t < T45.talk3[1] ? say('私は破壊し続けよう！') : '',
    tick(t){
      if (t >= 0 && !self._ult){ self._ult = true; A.dmg = 0; fxFlash('#7ac8ff', .9, .9); sfx.big(); sfx.boom(); bgm.stop(1.5); }
      if (t >= T45.stage && !self._stage){ self._stage = true; fxFlash('#000000', .7, .6); }
      if (t >= T45.jump && !self._jump){ self._jump = true; sfx.blip(330, .15); if (opt.sound && sfx.ac) laugh(sfx.ac, sfx.ac.currentTime + .05, .25); }
      if (t >= T45.boom && !self._boom){ self._boom = true; fxFlash('#ffffff', 1, 1); sfx.big(); sfx.boom(); fxParts(60, 0, 0, { cols:['#ffffff', '#ffe888', '#c8e0ff', '#ffc8f0'], speed:10, up:10, life:1.6, spread:2 }); }
      if (t >= T45.rise[0] + 2 && !self._chaos){ self._chaos = true; sfx.big(); bgm.use('p5'); setTimeout(() => { if (S.inst === self || S.inst === p5) bgm.start(); }, 300); }
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
      // 味方は出さない（P2 のミッシングの最後で自分に重なって消えている。P3〜P5 はオーケストラのほかは出さない。ユーザー 2026-10-17）
    },
    drawTop(t, g){ if (t >= T45.light[0] && t < T45.light[1]) pillar(g, (t - T45.light[0]) / (T45.light[1] - T45.light[0])); },
    handoff:{ at:T45.handoff, go(){
      p5.stage = 'P5';
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

// ---------------------------------------------------------------------
// 全通し：P1 通し → つなぎ P1→P2 → P2 通し → … → P5 通し（ユーザー 2026-10-16・17）
// 被弾したら終わり。必ず P1 から。各フェーズを成功したら次のつなぎへ（game.ts の next）：
//   P1：時間切れの 173.3 に削りきっていれば／P2：殴れなくなる 166.7 に削りきっていれば／P3：2体を倒したら／P4：最後に 25%未満なら／P5：撃破でクリア
// ランキングは対象外（ranking.ts）。stage：リザルトに出す「どこまで行ったか」
// ---------------------------------------------------------------------
const P1_TIMEUP = 173.3, P2_UNTARGET = 166.7; // mech_p1run の ENRAGE.cast・mech_p2run の UNTARGET（＝つなぎの 0）
const linkInst = (inst, floor, stage) => { inst.floorTheme = floor; inst.stage = stage; return inst; };
const FULL = { id:'full', name:'全通し', sub:'P1〜P5', view:24, start:RUN1.start, slots:true, bgmKey:'p1',
  gen: () => RUN1.gen(),
  create(pr){
    const p1 = RUN1.create(pr);
    p1.floorTheme = 'blue'; p1.stage = 'P1'; p1.killAfter = P1_TIMEUP;
    p1.next = () => ({ inst:linkInst(makeLink12(), 'blue', 'つなぎ P1→P2'), t:0 });
    return p1;
  } };

export { FULL };
