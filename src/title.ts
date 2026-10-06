import { $ } from './store.js';
import { openJobs } from './menu.js';
import { menuBgm, sfx } from './audio.js';
import { opt } from './store.js';
import { drawFace, laugh, stopLaugh } from './kefka_intro.js';

// ブラウザは操作があるまで音を出せないので、最初の操作でメニューBGMを鳴らし始める
// タイトル画面：どのボタン・キーでも抜けてメニューへ（この操作で音が鳴らせるようになる）
// タイトル → 演出（暗闇に顔が一瞬うっすら出て高笑い、約2秒。押すと飛ばせる）→ ジョブ選択
let titleOn = true, swallowClickUntil = 0, introTimers = [];
function leaveTitle(skip = true){
  titleOn = false; swallowClickUntil = performance.now() + 600;
  introTimers.forEach(clearTimeout); introTimers = []; if (skip) stopLaugh(sfx.ac); // 飛ばしたときだけ笑い声を止める
  $('intro').hidden = true; $('intro').className = 'intro';
  $('title').hidden = true; $('menu').hidden = false; openJobs(); sfx.unlock(); sfx.ok(); menuBgm.start();
}
function startIntro(){
  sfx.unlock();
  const el = $('intro'), img = $('introFace');
  if (!img.src) img.src = drawFace().toDataURL();
  $('title').hidden = true; el.hidden = false; el.className = 'intro';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));   // 暗闇からじわっと
  const ac = sfx.ac;
  if (opt.sound && ac) introTimers.push(setTimeout(() => laugh(ac, ac.currentTime + .02, .3), 150)); // 浮かんだところで高笑い
  introTimers.push(setTimeout(() => el.classList.add('out'), 1000));
  introTimers.push(setTimeout(() => leaveTitle(false), 1900));
}
['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, (e: KeyboardEvent & PointerEvent) => {
  if (!titleOn || document.querySelector('.sheet:not([hidden])')) return; // 設定・お知らせなどを開いている間は抜けない
  if (t === 'keydown' && ['Shift','Control','Alt','Meta','Tab'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  if ($('intro').hidden) startIntro(); else leaveTitle(); // 演出中にもう一度押すと飛ばす
}, true));
// タイトルを抜けたタップの直後の click（START など）は無視する
window.addEventListener('click', e => { if (performance.now() < swallowClickUntil){ e.preventDefault(); e.stopPropagation(); } }, true);

export { titleOn, swallowClickUntil, leaveTitle };
