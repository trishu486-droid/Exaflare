import { $, opt, store } from './store.js';
import { S, keys, stickVec } from './state.js';
import { flipPage, infoTarget, kin, menuBack, menuConfirm, moveCursor } from './menu.js';
import { begin, openMenu } from './game.js';
import { closeSheet } from './settings.js';
import { closeInfo, openInfo } from './info.js';
import { BTN, selectJob } from './hud.js';
import { KEYS } from './jobs.js';
import { held, pressKey } from './action.js';
import { cv } from './gfx.js';

// ===== 入力：キーボード（キー割り当ては設定で変えられる。1つの操作に2キーまで） =====
const KEY_ACTS = [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['a', 'A'], ['b', 'B'], ['x', 'X'], ['y', 'Y'],
  ['start', 'START'], ['select', 'SELECT'], ['safe', '安地表示'], ['menu', 'ギミック選択へ']];
const KEY_DEFAULT = { up:['w', 'arrowup'], down:['s', 'arrowdown'], left:['a', 'arrowleft'], right:['d', 'arrowright'],
  a:['j', '1'], b:['k', '2'], x:['u', '3'], y:['i', '4'], start:['enter'], select:['shift'], safe:[' '], menu:['escape'] };
let keyBind: Record<string, string[]> = (() => { const v = store.get('keys', null); return v && typeof v === 'object' ? { ...KEY_DEFAULT, ...v } : { ...KEY_DEFAULT }; })();
let keyOf = {};
function rebuildKeys(){
  keyOf = {};
  Object.entries(keyBind).forEach(([act, ks]) => ks.forEach(k => { if (k && !keyOf[k]) keyOf[k] = act; }));
  renderHelp();
}
const keyLabel = k => ({ ' ':'Space', arrowup:'↑', arrowdown:'↓', arrowleft:'←', arrowright:'→', escape:'Esc', enter:'Enter', shift:'Shift', control:'Ctrl', alt:'Alt', tab:'Tab', backspace:'BS' })[k] || (k.length === 1 ? k.toUpperCase() : k);
const keysText = act => keyBind[act].filter(Boolean).map(keyLabel).join('/') || '－';
function renderHelp(){
  const kb = act => `<kbd>${keysText(act)}</kbd>`;
  $('keyHelp').innerHTML = `${kb('up')} ${kb('left')} ${kb('down')} ${kb('right')} 移動　${kb('a')} A　${kb('b')} B　${kb('x')} X　${kb('y')} Y<br>${kb('start')} START　${kb('select')} SELECT　${kb('safe')} 安地表示　${kb('menu')} ギミック選択`;
}
const MOVE = { up:'w', down:'s', left:'a', right:'d' };
function toggleSafe(){ opt.safe = !opt.safe; store.set('safe', opt.safe); syncSafe(); }
function syncSafe(){ $('oSafe').checked = opt.safe; }
function pressStart(){ if (S.phase === 'menu') menuConfirm(); else begin(); }
window.addEventListener('keydown', e => {
  if (!$('sheet').hidden) { if (keyWait) return; if (e.key === 'Escape') closeSheet(); return; }
  const act = keyOf[e.key.toLowerCase()];
  if (!$('info').hidden){ if (act === 'menu' || act === 'b' || act === 'y' || e.key === 'Escape') closeInfo(); return; }
  // Y：メニューではカーソルのギミック、リザルトではいまのギミックの解説
  if (act === 'y' && !e.repeat && infoTarget()){ openInfo(infoTarget()); e.preventDefault(); return; }
  if (!act) return;
  if (S.phase === 'menu'){
    e.preventDefault();
    if (act === 'up') moveCursor(-1);
    else if (act === 'down') moveCursor(1);
    else if (act === 'a' || act === 'start'){ if (!kin('a')) menuConfirm(); }
    else if (act === 'b' || act === 'menu'){ if (!kin('b')) menuBack(); }
    else if (act === 'left'){ if (S.menu === 'job') moveCursor(-1, true); else if (S.menu === 'mech'){ kin('l'); flipPage(); } }
    else if (act === 'right'){ if (S.menu === 'job') moveCursor(1, true); else if (S.menu === 'mech'){ kin('r'); flipPage(); } }
    else if (act === 'select') selectJob(1);
    return;
  }
  e.preventDefault();
  if (MOVE[act]){ keys.add(MOVE[act]); return; }
  if (e.repeat) return;
  if (KEYS.includes(act)){ held[act] = true; pressKey(act); }
  else if (act === 'start') pressStart();
  else if (act === 'select') selectJob();
  else if (act === 'safe') toggleSafe();
  else if (act === 'menu') openMenu();
});
window.addEventListener('keyup', e => {
  const act = keyOf[e.key.toLowerCase()];
  if (MOVE[act]) keys.delete(MOVE[act]);
  if (KEYS.includes(act)) held[act] = false;
});
// 設定：キー割り当て。ボタンを押してから、割り当てたいキーを押す（同じキーがほかにあればそちらから外す）
let keyWait = null;
function cancelKeyWait(){ keyWait = null; }
function renderKeyOpts(){
  $('keyOpts').innerHTML = KEY_ACTS.map(([act, name]) => `<div class="opt keyopt"><span>${name}</span><span>` +
    [0, 1].map(i => { const k = keyBind[act][i]; const w = keyWait && keyWait.act === act && keyWait.i === i;
      return `<button type="button" class="kbtn${w ? ' wait' : ''}" data-act="${act}" data-i="${i}">${w ? '押して…' : k ? keyLabel(k) : '－'}</button>`; }).join('') + `</span></div>`).join('');
}
$('keyOpts').addEventListener('click', e => {
  const b = e.target.closest('.kbtn'); if (!b) return;
  keyWait = keyWait && keyWait.act === b.dataset.act && keyWait.i === +b.dataset.i ? null : { act:b.dataset.act, i:+b.dataset.i };
  renderKeyOpts();
});
window.addEventListener('keydown', e => {
  if (!keyWait) return;
  e.preventDefault(); e.stopPropagation();
  const k = e.key.toLowerCase(), { act, i } = keyWait;
  if (k === 'backspace' || k === 'delete'){ keyBind[act] = [...keyBind[act]]; keyBind[act][i] = ''; } // BS／Del で空に
  else {
    Object.keys(keyBind).forEach(a => { keyBind[a] = keyBind[a].map(x => x === k ? '' : x); });
    keyBind[act] = [...keyBind[act]]; keyBind[act][i] = k;
  }
  keyWait = null; store.set('keys', keyBind); rebuildKeys(); renderKeyOpts();
}, true);
$('keyReset').addEventListener('click', () => { keyBind = { ...KEY_DEFAULT }; keyWait = null; store.set('keys', null); rebuildKeys(); renderKeyOpts(); });
rebuildKeys(); renderKeyOpts();
window.addEventListener('blur', () => { keys.clear(); stickVec.x = stickVec.z = 0; held.a = held.b = held.x = held.y = false; });

// ===== 入力：タッチ・マウス（スティックとボタンは同時に操作できる） =====
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once:true, passive:true });

const stick = $('stick'), knob = $('knob');
let stickId = null;
let stickO = null;
const STICK_DEAD = .55, STICK_MAX = 44; // 倒し幅 44px のうち 55% までは動かない
function stickMove(e){
  let dx = e.clientX - stickO.x, dz = e.clientY - stickO.y;
  const d = Math.hypot(dx, dz);
  if (d > STICK_MAX){ dx *= STICK_MAX / d; dz *= STICK_MAX / d; }
  knob.style.transform = `translate(${dx}px,${dz}px)`;
  if (d < STICK_MAX * STICK_DEAD){ stickVec.x = stickVec.z = 0; } else { stickVec.x = dx / d; stickVec.z = dz / d; }
}
function stickEnd(){ stickId = null; stickO = null; stickVec.x = stickVec.z = 0; knob.style.transform = ''; S.stickRepeat = 0; }
stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stickO = { x:e.clientX, y:e.clientY }; try { stick.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);

// 画面をドラッグしても移動できる
let dragId = null, dragO = null;
cv.addEventListener('pointerdown', e => { dragId = e.pointerId; dragO = { x:e.clientX, y:e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch {} });
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - dragO.x, dz = e.clientY - dragO.y, d = Math.hypot(dx, dz);
  if (d < 30){ stickVec.x = stickVec.z = 0; return; }
  stickVec.x = dx / d; stickVec.z = dz / d;
  if (d > 60){ dragO.x = e.clientX - dx / d * 60; dragO.y = e.clientY - dz / d * 60; }
});
['pointerup','pointercancel'].forEach(t => cv.addEventListener(t, (e: PointerEvent) => { if (e.pointerId === dragId){ dragId = null; stickVec.x = stickVec.z = 0; } }));

// A/B は押した瞬間に反応させる
function holdButton(el, fn, onUp){
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('press'); fn(); });
  ['pointerup','pointercancel','pointerleave'].forEach(t => el.addEventListener(t, () => { el.classList.remove('press'); onUp?.(); }));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
KEYS.forEach(k => holdButton(BTN[k], () => {
  if (k === 'y' && infoTarget()){ openInfo(infoTarget()); return; }
  if (S.phase === 'menu' && S.menu === 'omake' && k === 'a'){ S.omakePending = true; return; }
  if (S.phase === 'menu'){ if (k === 'a'){ if (!kin('a')) menuConfirm(); } else if (k === 'b'){ if (!kin('b')) menuBack(); } return; }
  held[k] = true; pressKey(k);
}, () => { held[k] = false; if (k === 'a' && S.omakePending){ S.omakePending = false; if (S.phase === 'menu' && S.menu === 'omake') menuConfirm(); } }));
$('btnStart').addEventListener('click', pressStart);
$('btnSelect').addEventListener('click', () => selectJob(1));
$('bMenu').addEventListener('click', openMenu);
$('oFx').checked = opt.fx;
$('oFx').addEventListener('change', () => { opt.fx = $('oFx').checked; store.set('fx', opt.fx); });
$('oSafe').addEventListener('change', () => { opt.safe = $('oSafe').checked; store.set('safe', opt.safe); });
$('menu').querySelector('.head').addEventListener('click', e => { if (e.target.closest('[data-pg]') && S.menu === 'mech') flipPage(); });
$('menuList').addEventListener('click', e => {
  const inf = e.target.closest('[data-info]'); if (inf){ openInfo(inf.dataset.info); return; }
  const b = e.target.closest('button[data-i]'); if (b) menuConfirm(Number(b.dataset.i));
});
syncSafe();

export { KEY_ACTS, KEY_DEFAULT, keyBind, keyOf, rebuildKeys, keyLabel, keysText, renderHelp, MOVE, toggleSafe, syncSafe, pressStart, keyWait, cancelKeyWait, renderKeyOpts, stick, knob, stickId, stickO, STICK_DEAD, STICK_MAX, stickMove, stickEnd, dragId, dragO, holdButton };
