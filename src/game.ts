import { mech, menuMechs, phaseOf } from './mechs.js';
import { S, keys, stickVec, logClear } from './state.js';
import { fxReset, fxShiftTime } from './fx.js';
import { ARENA_R, COUNTDOWN, PLAYER_SPEED } from './config.js';
import { cv, hurt, misses } from './gfx.js';
import { A, HP, actReset, actTick, hpReset, hpTick } from './action.js';
import { bgm, menuBgm, sfx } from './audio.js';
import { $, opt } from './store.js';
import { applyTitle, buildResult, draw, drawButtons, resetMsg, setMsg, updateHud } from './hud.js';
import { titleOn } from './title.js';
import { flipPage, moveCursor, renderMenu } from './menu.js';

// ===== 進行 =====
function begin(){
  const m = mech();
  logClear(); // チャット欄（P4 の PT マクロと自分のメモ）を空にする
  S.inst = m.create(m.gen());   // 毎回ランダムな新しいパターン
  fxReset(); S.killed = false; S.t0 = S.inst.t0 || 0; S.t = S.t0 - (S.inst.countdown || COUNTDOWN); S.phase = 'count'; S.failAt = null; S.fall = null; S.hits = 0; S.hurtT = -9; misses.clear(); actReset();
  S.player = { ...(S.inst.start || m.start) };
  S.face = { x:0, z:-1 };
  hpReset();
  bgm.use((m as any).bgmKey ?? (phaseOf(m.id) === 'p1' ? m.id : phaseOf(m.id))); // P1〜P4 はフェーズごとの曲（P1 は楽章ごと）。つなぎ目は前のフェーズの曲
  menuBgm.stop(.3); bgm.stop(.05); setTimeout(() => bgm.start(), 60);
  $('menu').hidden = true; applyTitle();
  sfx.unlock(); sfx.blip(660, .08);
  cv.focus({ preventScroll:true });
}
function openMenu(){
  bgm.stop(); bgm.use(null); if (!titleOn) menuBgm.start();
  S.phase = 'menu'; S.menu = 'mech'; S.inst = null; A.cast = null; applyTitle();
  HP.on = false; $('hp').hidden = true;
  opt.phase = phaseOf(mech().id); // 終わったギミックのフェーズの一覧へ戻る
  S.cursor = Math.max(0, menuMechs().indexOf(mech()));
  renderMenu(); $('menu').hidden = titleOn; resetMsg(); setMsg('');
}

// ===== 更新 =====
const FALL_OVER = .3; // 床の縁からこれだけはみ出したら落ちる（キャラの半分くらい）
function movePlayer(dt){
  if (S.phase === 'menu' || S.fall) return; // 落ちたあとは動けない
  if (S.phase === 'run' && S.inst?.lockMove?.(S.t)) return; // 混乱・睡眠・ノックバックの最中など（P1）。動かすのはギミックの側
  let mx = stickVec.x, mz = stickVec.z;
  if (keys.has('w')) mz -= 1; if (keys.has('s')) mz += 1;
  if (keys.has('a')) mx -= 1; if (keys.has('d')) mx += 1;
  const len = Math.hypot(mx, mz); if (!len) return;
  S.face = { x:mx / len, z:mz / len }; // 最後に動いた向き（P4 の視線の判定）
  let x = S.player.x + mx / len * PLAYER_SPEED * dt, z = S.player.z + mz / len * PLAYER_SPEED * dt;
  // 外周には見えない壁がない：実行中に床の外へ出たら落ちて失敗。カウントダウン中は端で止める
  const fall = S.phase === 'run', lim = fall ? ARENA_R + FALL_OVER : ARENA_R - .5, r = Math.hypot(x, z);
  if (r > lim){ x *= lim / r; z *= lim / r; if (fall && S.failAt == null){ hurt('外周から落ちた'); S.fall = { at:performance.now(), ux:x / lim, uz:z / lim }; sfx.fall(); } }
  S.player.x = x; S.player.z = z;
}

let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000) * opt.speed; last = now;
  // メニューはスティックの上下でも選べる
  if (S.phase === 'menu' && !titleOn && Math.abs(stickVec.z) > .7 && now > S.stickRepeat){ moveCursor(stickVec.z > 0 ? 1 : -1); S.stickRepeat = now + 280; }
  else if (S.phase === 'menu' && !titleOn && Math.abs(stickVec.x) > .7 && now > S.stickRepeat){ if (S.menu === 'job') moveCursor(stickVec.x > 0 ? 1 : -1, true); else if (S.menu === 'mech') flipPage(stickVec.x > 0 ? 1 : -1); S.stickRepeat = now + 280; }
  movePlayer(dt);
  if (S.phase === 'count' || S.phase === 'run'){
    const before = S.t;
    S.t += dt;
    if (S.phase === 'count'){
      if (Math.ceil(S.t0 - before) !== Math.ceil(S.t0 - S.t) && S.t < S.t0) sfx.blip(660, .08);
      if (S.t >= S.t0){ S.phase = 'run'; sfx.blip(990, .15); }
    }
    if (S.phase === 'run'){
      S.inst.tick(S.t);
      // つなぎ目（mech_link）：決まった時刻で次のフェーズの通しに差し替える。時計もそのフェーズの時刻に
      const h = S.inst.handoff;
      if (h && S.t >= h.at && S.failAt == null){ const n = h.go(); fxShiftTime(n.t - S.t); S.inst = n.inst; S.t = n.t; if (n.player) S.player = { ...n.player }; A.tgt = n.inst.target0 ?? null; A.cast = null; }
      hpTick(dt);
      actTick(dt);
      // P5 通し：ボスのHPを削りきったら撃破で終了。削りきれずに最後まで行ったら時間切れ（ミッシング・ゼロ）
      // P4（hpGate あり）は 25% 未満まで削っても最後まで続き、時間切れの時点で判定する
      const reached = S.inst.bossHp && A.dmg >= S.inst.bossHp, gate = S.inst.hpGate;
      const killed = reached && !gate && (S.inst.killAfter == null || S.t >= S.inst.killAfter); // P3 通し：突出までは HP が残る（killAfter から撃破できる）
      if (killed || (gate && reached && S.t > S.inst.end)) S.killed = true;
      if (S.inst.bossHp && !reached && !S.inst.noEnrage && S.t > S.inst.end && S.failAt == null) hurt(S.inst.enrageName ? `時間切れ（${S.inst.enrageName}）` : gate ? '時間切れ（裁きの光）' : '時間切れ（ミッシング・ゼロ）', '');
      if (killed || S.t > S.inst.end || (S.failAt != null && S.t >= S.failAt)){ S.endT = Math.min(S.t, S.inst.end); S.phase = 'done'; A.cast = null; S.resultHtml = buildResult(); bgm.stop(1.2); S.hits ? sfx.fail() : sfx.clear(); }
    }
  }
  draw(); updateHud(); drawButtons();
  requestAnimationFrame(frame);
}

export { begin, openMenu, movePlayer, last, frame };
