import { BUFFS, GCD, KEYS, MELEE, QUEUE, SLIDECAST, dmgPerPot, isGcd, job } from './jobs.js';
import { $ } from './store.js';
import { S, keys, stickVec } from './state.js';
import { C0, P, PPY, W, alpha, hurt, jobIconSvg, line, px, rect, ring } from './gfx.js';
import { BOSS_R } from './config.js';
import { sfx } from './audio.js';

// ===== アクション（A=GCD。B・X・Y はアビリティ／バフ／コンボの段） =====
const A = { readyAt:0, queued:null, cast:null, combo:0, cds:{ b:0, x:0, y:0 }, q:{ b:false, x:false, y:false }, buffs:{}, instant:0,
            gcds:0, dmg:0, loss:0, failT:-9, bossFlash:-9, kit:null, cdName:{},
            provoke:null as number | null, shirk:null as number | null, sunUsed:false, instantArt:null as string | null } as {
  readyAt:number; queued:string | null; cast:{ start:number; end:number; k:string } | null; combo:number;
  cds:Record<string, number>; q:Record<string, boolean>; buffs:Record<string, number>; instant:number; instantArt:string | null;
  gcds:number; dmg:number; loss:number; failT:number; bossFlash:number; kit:any; cdName:Record<string, number>;
  provoke:number | null; shirk:number | null; sunUsed:boolean;
};
// 押しっぱなし：撃てるようになった瞬間に自動で発動（FF14 のホットバー長押しと同じ）
const held = { a:false, b:false, x:false, y:false };
// ===== ヒーラーのときだけ：自分のHP =====
// ギミック中に全員が必ず受ける攻撃（軽減表の1発ぶん）を受ける。HP 205,000。ほかの人の軽減は一律20%とみなす
// 自分の軽減は1つ10%（掛け算）。バリアが先に受ける。0になったらミス
const HP = { on:false, hp:100, shield:0, taken:0, prevented:0, absorbed:0, healed:0 };
const MAX_HP = 205000, PARTY_MIT = .8, MIT_PCT = .1;
function hpReset(){
  HP.on = job().role === 'healer'; HP.hp = 100; HP.shield = 0; HP.taken = HP.prevented = HP.absorbed = HP.healed = 0;
  $('hp').hidden = !HP.on;
}
function onBuff(id){
  if (!HP.on || S.phase !== 'run' && S.phase !== 'count') return;
  const b = BUFFS[id], ns = hasBuff('ns');
  if (b.heal){ const before = HP.hp; HP.hp = Math.min(100, HP.hp + b.heal * (ns ? 1.2 : 1)); HP.healed += HP.hp - before; popup(Math.round((HP.hp - before) * MAX_HP / 100).toLocaleString('en-US'), 'healnum self', BUFFS[id].name, S.player); }
  if (b.shield) HP.shield = Math.max(HP.shield, b.shield);
  if (id === 'helios' && ns) HP.shield = Math.max(HP.shield, 25); // ニュートラルセクト中のヘリオスはバリアも付く
}
// ギミックから呼ぶ：全員が受ける攻撃（name は被ダメージ表示に出す攻撃名）
function healerHit(raw, name?: string){
  if (!HP.on || S.phase !== 'run') return;
  const mits = Object.keys(A.buffs).filter(id => hasBuff(id) && BUFFS[id].mit).length;
  const base = raw / MAX_HP * 100 * PARTY_MIT;
  let dmg = base * Math.pow(1 - MIT_PCT, mits);
  const absorbed = Math.min(HP.shield, dmg); HP.shield -= absorbed; dmg -= absorbed;
  HP.taken += base; HP.prevented += base - (dmg + absorbed); HP.absorbed += absorbed;
  HP.hp -= dmg;
  popup(Math.round((dmg + absorbed) * MAX_HP / 100).toLocaleString('en-US'), 'hurtnum self', name, S.player);
  if (HP.hp <= 0){ hurt('HPが0になった'); HP.hp = 100; HP.shield = 0; }
}
function hpTick(dt){
  if (!HP.on) return;
  Object.keys(A.buffs).forEach(id => { if (hasBuff(id) && BUFFS[id].regen){ const before = HP.hp; HP.hp = Math.min(100, HP.hp + BUFFS[id].regen * dt); HP.healed += HP.hp - before; } });
  if (HP.shield > 0 && !hasBuff('galv') && !hasBuff('ns')) HP.shield = 0;
}
let enmityHtml = '';
function enmityDraw(){
  const el = $('enmity'), show = !!S.inst?.enmity && job().role === 'tank' && S.phase !== 'menu';
  el.hidden = !show;
  if (!show) return;
  const html = S.inst.enmity(Math.max(0, S.t)).map(r => `<div class="erow"><b class="rk ${r.top ? 'a' : 'n'}">${r.top ? 'A' : '2'}</b>` +
    `<span class="ej">${jobIconSvg(r.k === 'MT' ? 'pld' : 'drk')}<span class="ebar"><i style="width:${r.top ? 100 : 70}%;background:${r.top ? '#ff7a9a' : '#f0d060'}"></i></span></span>` +
    `<span class="en">${r.k}${r.me ? '<small style="color:var(--gold)">(自分)</small>' : ''}</span></div>`).join('');
  if (html !== enmityHtml){ el.innerHTML = html; enmityHtml = html; }
}
function hpDraw(){
  if (!HP.on) return;
  $('hpNum').textContent = `HP ${Math.max(0, Math.round(HP.hp * MAX_HP / 100)).toLocaleString('en-US')}`;
  $('hpFill').style.width = Math.max(0, HP.hp) + '%';
  $('hpShield').style.width = Math.min(100, HP.shield) + '%';
  $('hp').classList.toggle('low', HP.hp < 35);
}
function actReset(){
  Object.assign(A, { readyAt:0, queued:null, cast:null, combo:0, cds:{ b:0, x:0, y:0 }, q:{ b:false, x:false, y:false }, buffs:{}, instant:0, gcds:0, dmg:0, loss:0, failT:-9, provoke:null, shirk:null, sunUsed:false, kit:null, cdName:{} });
  fxEl.innerHTML = '';
}
const hasBuff = id => (A.buffs[id] ?? -Infinity) > S.t;
const hasMit = () => Object.keys(A.buffs).some(id => BUFFS[id].mit && hasBuff(id));
const hasInvuln = () => Object.keys(A.buffs).some(id => BUFFS[id].invuln && hasBuff(id));
const hasHeavy = () => Object.keys(A.buffs).some(id => (BUFFS[id].heavy || BUFFS[id].invuln) && hasBuff(id));
// ボスがターゲット不可の間（P5 通しの開幕）は攻撃できない
const canHit = () => S.inst?.targetable?.(S.t) ?? true;
function inRange(){ return !job().melee || Math.hypot(S.player.x, S.player.z) <= BOSS_R + MELEE; }
function isMoving(){ return keys.size > 0 || stickVec.x !== 0 || stickVec.z !== 0; }

const fxEl = $('fx');
// at を渡すと、その場所（自キャラ）から出る。渡さなければボスに出る
function popup(text: string, cls?: string, name?: string, at?: { x:number; z:number }){
  const el = document.createElement('div');
  el.className = 'dmg outline ' + (cls || '');
  el.textContent = text;
  if (name){ const n = document.createElement('span'); n.className = 'act'; n.textContent = name; el.prepend(n); }
  if (at){ // 自キャラの頭の少し上から、上へ流れる（FF14 の被ダメージ・回復の出方）
    el.style.left = (px(at.x) / W * 100 + (Math.random() * 6 - 3)) + '%';
    el.style.top = ((px(at.z) - 40) / W * 100) + '%';
  } else {
    el.style.left = (50 + (Math.random() * 16 - 8)) + '%';
    el.style.top = (37 + Math.random() * 4) + '%';
  }
  fxEl.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
function dealDamage(pot, name){
  const up = Object.keys(A.buffs).reduce((m, id) => m * (hasBuff(id) && BUFFS[id].dmg ? BUFFS[id].dmg : 1), 1);
  const crit = Math.random() < .25;
  const dmg = Math.round(pot * dmgPerPot() * up * (.95 + Math.random() * .1) * (crit ? 1.5 : 1));
  A.dmg += dmg; A.bossFlash = performance.now();
  popup(dmg.toLocaleString('en-US') + (crit ? '!' : ''), crit ? 'crit' : '', name);
  crit ? sfx.crit() : sfx.hit();
}
function fail(){ A.failT = performance.now(); sfx.no(); }

// 先行入力：リキャスト残り0.5秒から受け付ける（カウントダウン終了直前も可）
const active = () => S.phase === 'run' || S.phase === 'count';
function pressKey(k){
  sfx.unlock();
  if (!active()) return;
  const ab = job()[k];
  // サンサイン：ニュートラルセクトのリキャストとは別で、すぐ使える
  if (ab.sunsign){ if (S.phase !== 'run') return; A.sunUsed = true; A.buffs.sun = S.t + BUFFS.sun.dur; sfx.buff(); popup(ab.name, 'crit'); return; }
  if (isGcd(job(), k)){
    if (ab.gcd){ if (S.t >= A.cds[k] - QUEUE) A.q[k] = true; return; } // GCD技：覚えておいて次のGCDで
    if (!A.cast && S.t >= A.readyAt - QUEUE) A.queued = k;
    return;
  }
  if (S.phase === 'count' || S.t < A.cds[k]){ if (S.t >= A.cds[k] - QUEUE) A.q[k] = true; return; }
  if (A.cast){ A.q[k] = true; return; } // 詠唱中に押したら、詠唱が終わってから発動
  if (ab.pot && (!inRange() || !canHit())){ fail(); return; }
  A.cds[k] = S.t + ab.cd;
  if (ab.buff){ A.buffs[ab.buff] = S.t + BUFFS[ab.buff].dur; sfx.buff(); popup(ab.name, 'crit'); onBuff(ab.buff); }
  else if (ab.enmity){ A[ab.enmity] = S.t; sfx.buff(); popup(ab.name, 'crit'); }
  else if (ab.instant){ if (ab.instant >= A.instant) A.instantArt = ab.instant > 1 ? 'triple' : 'swift'; A.instant = Math.max(A.instant, ab.instant); sfx.buff(); popup(ab.name, 'crit'); }
  else dealDamage(ab.pot, ab.name);
}
function runGcd(k){
  const j = job(), ab = j[k];
  A.readyAt = S.t + GCD; A.gcds++;
  if (ab.gcd){
    A.cds[k] = S.t + ab.cd;
    if (ab.cast && A.instant <= 0){ A.cast = { start:S.t, end:S.t + ab.cast, k }; return; }
    if (ab.cast) A.instant--;
    finishGcd(ab); return;
  }
  if (ab.chain){ // タンクの A：押すたびに 1→2→3段目と進む（途切れない）
    const c = ab.chain[A.combo % ab.chain.length];
    dealDamage(c.pot, c.name); A.combo = (A.combo + 1) % ab.chain.length;
    return;
  }
  if (ab.step){ // コンボ：前の段に続けて押すとフル威力
    const ok = ab.step === 1 || A.combo === ab.step - 1;
    dealDamage(ok ? ab.pot : ab.low, ab.name);
    A.combo = ok && ab.step < 3 ? ab.step : 0;
    return;
  }
  if (!ab.cast){ dealDamage(ab.pot, ab.name); return; }
  if (A.instant > 0){ A.instant--; dealDamage(ab.pot, ab.name); return; }
  A.cast = { start:S.t, end:S.t + ab.cast, k };
}
// GCD技の効果：バフが付くもの（回復・バリア）かダメージ
function finishGcd(ab){
  if (ab.buff){ A.buffs[ab.buff] = S.t + BUFFS[ab.buff].dur; sfx.buff(); popup(ab.name, 'crit'); onBuff(ab.buff); }
  else dealDamage(ab.pot, ab.name);
}
// タンク：P5 通しではオーケストラの前後で B・X・Y の技が入れ替わる。リキャストは技ごとに覚えておく
function kitSwap(j){
  if (A.kit === j) return;
  if (A.kit) ['b', 'x', 'y'].forEach(k => { A.cdName[A.kit[k].name] = A.cds[k]; A.cds[k] = A.cdName[j[k].name] ?? 0; A.q[k] = false; });
  A.kit = j; // A のコンボは切り替わっても途切れない
}
function actTick(dt){
  const j = job(), a = j.a;
  kitSwap(j);
  KEYS.forEach(k => {
    const ab = j[k];
    if (held[k] && !A.cast){
      if (isGcd(j, k)) { if (!ab.gcd || S.t >= A.cds[k] - QUEUE) pressKey(k); }
      else if (S.t >= A.cds[k] && (!ab.pot || inRange())) pressKey(k);
    }
    if (k === 'a' || !A.q[k] || A.cast) return;
    if (ab.gcd){ if (S.t >= A.cds[k] - QUEUE && S.t >= A.readyAt - QUEUE){ A.q[k] = false; A.queued = k; } }
    else if (S.t >= A.cds[k]){ A.q[k] = false; pressKey(k); }
  });
  // 詠唱中：スライドキャスト猶予前に動くと中断（GCDは戻る）
  if (A.cast){
    if (isMoving() && S.t < A.cast.end - SLIDECAST){ A.cast = null; A.readyAt = S.t; fail(); }
    else if (S.t >= A.cast.end){ const ab = job()[A.cast.k] || a; A.cast = null; finishGcd(ab); }
    return;
  }
  if (S.t < A.readyAt) return;
  if (A.queued){
    const k = A.queued; A.queued = null;
    if (j[k].gcd && S.t < A.cds[k]) return;
    if (!inRange() || (!canHit() && !j[k].buff)){ fail(); return; }
    runGcd(k);
    return;
  }
  if (S.t <= S.inst.end && canHit()) A.loss += dt; // 撃てるのに撃っていない時間
}
function drawActFx(){
  const now = performance.now(), X = px(S.player.x), Z = px(S.player.z);
  if (job().melee && S.phase !== 'menu') alpha(.45, () => ring(C0, C0, Math.round((BOSS_R + MELEE) * PPY), '#c9a2ff'));
  if (now - A.failT < 500){ // 射程外・詠唱中断
    line(X - 3, Z - 14, X + 3, Z - 8, P.hurt); line(X + 3, Z - 14, X - 3, Z - 8, P.hurt);
    line(X - 2, Z - 14, X + 4, Z - 8, P.hurt); line(X + 4, Z - 14, X - 2, Z - 8, P.hurt);
  }
  if (A.cast){ // 詠唱バー（キャラの下）
    const k = Math.min(1, (S.t - A.cast.start) / (A.cast.end - A.cast.start));
    rect(X - 11, Z + 8, 22, 5, '#000000'); rect(X - 10, Z + 9, 20, 3, '#3a2a55'); rect(X - 10, Z + 9, Math.round(20 * k), 3, '#ffffff');
  }
}

export { A, held, HP, MAX_HP, PARTY_MIT, MIT_PCT, hpReset, onBuff, healerHit, hpTick, enmityHtml, enmityDraw, hpDraw, actReset, hasBuff, hasMit, hasInvuln, hasHeavy, canHit, inRange, isMoving, fxEl, popup, dealDamage, fail, active, pressKey, runGcd, finishGcd, kitSwap, actTick, drawActFx };
