import { $ } from './store.js';
import { openJobs } from './menu.js';
import { menuBgm, sfx } from './audio.js';

// ブラウザは操作があるまで音を出せないので、最初の操作でメニューBGMを鳴らし始める
// タイトル画面：どのボタン・キーでも抜けてメニューへ（この操作で音が鳴らせるようになる）
let titleOn = true, swallowClickUntil = 0;
function leaveTitle(){
  titleOn = false; swallowClickUntil = performance.now() + 600;
  $('title').hidden = true; $('menu').hidden = false; openJobs(); sfx.unlock(); sfx.ok(); menuBgm.start();
}
['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, (e: KeyboardEvent & PointerEvent) => {
  if (!titleOn || !$('sheet').hidden) return;
  if (t === 'keydown' && ['Shift','Control','Alt','Meta','Tab'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation(); leaveTitle();
}, true));
// タイトルを抜けたタップの直後の click（START など）は無視する
window.addEventListener('click', e => { if (performance.now() < swallowClickUntil){ e.preventDefault(); e.stopPropagation(); } }, true);

export { titleOn, swallowClickUntil, leaveTitle };
