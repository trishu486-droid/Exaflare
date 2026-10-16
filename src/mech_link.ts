// @ts-nocheck
import { S } from './state.js';
import { A } from './action.js';
import { bgm, sfx } from './audio.js';
import { fxAdd, fxFlash, fxShake, fxParts } from './fx.js';
import { P, PPY, alpha, disc, rect, ring, px } from './gfx.js';
import { mySlot } from './jobs.js';
import { SLOTS, add, at, dist, drawBot, statueScreenBg } from './p1lib.js';
import { clearOutside, bgImg } from './mech_p2m.js';
import { RUN2 } from './mech_p2run.js';
import { RUN3 } from './mech_p3run.js';

// =====================================================================
// フェーズのつなぎ目（全通しの部品）。docs/README.md 6章の3（ユーザーの動画 2026-10-16）
//   つなぎ P1→P2：P1 の時間切れ（最後の裁きの光は来ない）→ ケフカが消える → 床が金色に → 光の柱からゴッドケフカ → 殴れる → P2 通しへ
//   つなぎ P2→P3：ゴッドケフカが殴れなくなる（HP は 0.1% で耐える）→ ケフカが出て「ずんずんエアロガ」→ ムービー（START で飛ばせる）→ P3 通しへ
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
// ムービーの字幕（動画のケフカのセリフ）と、ムービーの長さ（約 31 秒）
const MOVIE_LEN = 31;
const MOVIE_LINES = [[2, 'ボクチン もうすっかり把握！'], [11, '今から後悔させてやるよ……'], [19, '誰に言ってるのかって？'], [25, 'お前だよ　オ・マ・エ！']];
// セリフ（| で改行）。フィールドの上のほうに出す
const say = text => `<div class="sub" style="transform:translateY(-6.6em);color:var(--gold)">ケフカ</div>${text.split('|').map(l => `<div class="sub" style="transform:translateY(-6.6em)">${l}</div>`).join('')}`;

// ---------------------------------------------------------------------
// つなぎ P1→P2（0＝P1 の時間切れ。P1 通しの 173.3）
// ケフカが消える 2 → 床が金色 4 → 光の柱 6.5〜9.5 → ゴッドケフカ 9（セリフ）→ 殴れる 11.5 → P2 通しの 0（＝殴れるの 4.4 秒後。cactbot 307.6 → 312.0）
// ---------------------------------------------------------------------
const T12 = { gone:2, gold:4, pillar:[6.5, 9.5], god:9, talk:[9, 14], targetable:11.5, handoff:15.9 };
function makeLink12({ lead = 0, check = false } = {}){
  const me = mySlot();
  const p2 = RUN2.create(RUN2.gen());
  const P1_HP = 1e7; // 確認用の見た目だけ（P1 の終わりの HP は 15% 少し上）
  const bots = makeBots(me, (k, t) => t < T12.targetable ? P1_END(k) : lerp(P1_END(k), P2_EMB(k), clamp01((t - T12.targetable) / 3)));
  let started = false, music = false;
  const self = {
    view:24, t0:-lead, countdown:3, start:P1_END(me), bossR:BOSS_R,
    intro:'つなぎ P1→P2（確認用）', end:1e9, noEnrage:true, killAfter:1e9,
    casts:[],
    get bossHp(){ return S.t < 0 ? P1_HP : S.t >= T12.targetable ? p2.bossHp : 0; },
    get bossName(){ return S.t < 0 ? 'ケフカ' : p2.bossName; },
    targetable: t => t < 0 || t >= T12.targetable,
    bosses: t => t < T12.gone || t >= T12.god ? boss() : [],
    progress: t => t < 0 ? 'P1 の終わり' : t < T12.targetable ? 'つなぎ（P1→P2）' : 'P2 の始まり',
    message: t => t >= T12.talk[0] && t < T12.talk[1] ? say('絶ッ！！|再現したな、この私を……！') : '',
    tick(t){
      if (!started){ started = true; if (lead) A.dmg = P1_HP * .84; }
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#c890ff', .5, .4); sfx.big(); bgm.stop(1.5); }
      if (t >= T12.gold && !self._gold){ self._gold = true; fxFlash('#ffe888', .6, .5); sfx.blip(880, .3); }
      if (t >= T12.god && !music){ music = true; bgm.use('p2'); setTimeout(() => { if (S.inst === self || S.inst === p2) bgm.start(); }, 300); fxParts(24, 0, 0, { cols:['#fff6c8', '#ffe888', '#ffffff'], speed:8, up:8, life:1, spread:4 }); sfx.big(); }
      if (t >= T12.targetable && !self._hit){ self._hit = true; A.dmg = 0; sfx.blip(990, .15); }
      bots.place(t);
    },
    safeActive: () => false, safe: () => true,
    guide(t){ if (t < T12.targetable) return; const g = P2_EMB(me); ring(px(g.x), px(g.z), Math.round(1.2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
    screenBg: t => t < T12.gold ? statueScreenBg(3, 99) : bgImg(true),
    drawFloor(){ clearOutside(); },
    draw(t){
      // ケフカが消える（0〜2）・ゴッドケフカが出る（9〜）：輪の薄さで。消える間は紫の光
      if (t >= 0 && t < T12.gone) alpha((T12.gone - t) / T12.gone * .5, () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#c890ff'));
      if (t >= T12.god && t < T12.god + 1) alpha(1 - (t - T12.god), () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#fff6c8'));
      bots.draw();
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
// ケフカが出る 2・ずんずんエアロガ 2〜5.5（床の模様 3〜6）→ ノックダウン 5.5 → ムービー 6.5〜37.5（START で飛ばせる）
// → P3 通しの −4.5 から（P3 の 0 ＝エアロガの 40 秒後。cactbot 600 → 640）。再構築の詠唱（P3 の −2.7〜2.5）のあいだにエクスデスとカオスが殴れる（0.3）
// ---------------------------------------------------------------------
const T23 = { fade:2, kefka:2, aeroCast:2, aero:5.5, floor:[3, 6], movie:6.5, p3At:-4.5 };
const MOVIE_END = T23.movie + MOVIE_LEN;
function makeLink23({ lead = 0, check = false } = {}){
  const me = mySlot();
  const P2_HP = 1e7;
  const p3 = RUN3.create(RUN3.gen());
  const kb = {}; // ノックダウン：中心から外へ 3 押される（推定）
  const pos0 = k => P2_EMB(k);
  const bots = makeBots(me, (k, t) => { const q = pos0(k); if (t < T23.aero) return q; const u = dist(q, { x:0, z:0 }) || 1, f = clamp01((t - T23.aero) / .3) * 3; return { x:q.x + q.x / u * f, z:q.z + q.z / u * f }; });
  let started = false;
  const self = {
    view:24, t0:-lead, countdown:3, start:P2_EMB(me), bossR:BOSS_R,
    intro:'つなぎ P2→P3（確認用）', end:1e9, noEnrage:true, killAfter:1e9,
    casts:[{ name:'ずんずんエアロガ', start:T23.aeroCast, len:T23.aero - T23.aeroCast }],
    get bossHp(){ return S.t < 0 ? P2_HP : 0; },
    bossName:'ケフカ',
    targetable: t => t < 0,
    bosses: t => t < T23.fade || (t >= T23.kefka && t < T23.movie) ? boss() : [],
    progress: t => t < 0 ? 'P2 の終わり' : 'つなぎ（P2→P3）',
    message: t => t >= T23.movie && t < MOVIE_END
      ? `${MOVIE_LINES.filter(([s]) => t - T23.movie >= s).slice(-1).map(([, l]) => `<div class="sub" style="transform:translateY(4.5em)">${l}</div>`).join('')}<div class="sub blink" style="transform:translateY(7em);font-size:13px;color:var(--dim)">START でスキップ</div>`
      : '',
    // ムービーを飛ばす（input.ts の pressStart から）。飛ばしたら true
    skip(){ if (S.t >= T23.movie && S.t < MOVIE_END - .2){ S.t = MOVIE_END - .05; sfx.blip(660, .08); return true; } return false; },
    tick(t){
      if (!started){ started = true; if (lead) A.dmg = P2_HP * .999; }
      if (t < 0 && A.dmg > P2_HP * .999) A.dmg = P2_HP * .999; // 0.1% で耐える
      if (t >= 0 && !self._end){ self._end = true; A.dmg = 0; fxFlash('#fff6c8', .6, .5); sfx.big(); bgm.stop(1.5); }
      if (t >= T23.aero && !self._aero){ self._aero = true; fxFlash('#ff8ad8', .5, .3); fxShake(3, .4); sfx.boom();
        const u = dist(S.player, { x:0, z:0 }) || 1; kb.from = { ...S.player }; kb.to = { x:S.player.x + S.player.x / u * 3, z:S.player.z + S.player.z / u * 3 }; kb.t0 = t; }
      if (kb.t0 != null && t - kb.t0 <= .3){ const q = lerp(kb.from, kb.to, clamp01((t - kb.t0) / .3)); S.player.x = q.x; S.player.z = q.z; }
      bots.place(t);
    },
    lockMove: t => t >= T23.aero, // ノックダウンからムービーのあいだは動けない
    status: t => t >= T23.aero && t < T23.movie ? [{ glyph:'倒', color:'#b03a7a', name:'ノックダウン', sec:Math.ceil(T23.movie - t) }] : [],
    safeActive: () => false, safe: () => true,
    screenBg: t => t < T23.movie ? bgImg(true) : null,
    drawFloor(){ clearOutside(); },
    draw(t){
      if (t >= 0 && t < T23.fade) alpha((T23.fade - t) / T23.fade * .5, () => disc(px(0), px(0), Math.round(BOSS_R * PPY), '#fff6c8'));
      if (t >= T23.floor[0] && t < T23.floor[1]) chevrons((t - T23.floor[0]) / (T23.floor[1] - T23.floor[0]));
      bots.draw();
    },
    // ムービー：画面を黒く（字幕は message）
    drawTop(t, g){ if (t >= T23.movie && t < MOVIE_END){ g.fillStyle = '#000'; g.fillRect(-10, -2000, 400, 2400); } },
    // P3 通しへ（−4.5 から。再構築の詠唱を足す。自分は P3 の始まりの位置へ）
    handoff:{ at:MOVIE_END, go(){
      p3.casts.push({ name:'再構築', start:-2.7, len:5.2 });
      p3.message = t => t < 0 ? say('さてさて、お立ち会い……|権限をちょっと拝借しまして～') : t < 4 ? say('ボクチンに不可能はなーい！') : '';
      if (check){ p3.end = 8; p3.noEnrage = true; } // 確認用：決戦のあと少しで終わり
      bgm.use('p3'); setTimeout(() => { if (S.inst === p3) bgm.start(); }, 300);
      return { inst:p3, t:T23.p3At, player:{ x:0, z:4 } };
    } },
  };
  return self;
}

// 確認用のメニュー（今だけ。全通しができたら消す）
const LINK12 = { id:'link12', name:'つなぎ P1→P2', sub:'', view:24, start:{ x:0, z:5 }, slots:true, bgmKey:'p1c',
  gen: () => null, create: () => makeLink12({ lead:LEAD, check:true }) };
const LINK23 = { id:'link23', name:'つなぎ P2→P3', sub:'', view:24, start:{ x:0, z:8 }, slots:true, bgmKey:'p2',
  gen: () => null, create: () => makeLink23({ lead:LEAD, check:true }) };

export { LINK12, LINK23, makeLink12, makeLink23 };
