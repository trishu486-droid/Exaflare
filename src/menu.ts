import { $, opt, store } from './store.js';
import { S } from './state.js';
import { JOBS, JOB_ORDER, job, mySlot } from './jobs.js';
import { OMAKE, openOmake } from './omake.js';
import { MECHS, mech, menuMechs } from './mechs.js';
import { RUN } from './mech_run.js';
import { titleOn } from './title.js';
import { sfx } from './audio.js';
import { applyTitle } from './hud.js';
import { begin } from './game.js';

// メニュー：ジョブの行（SELECT／左右で切り替え）＋ ギミック一覧。担当が関係するギミックは次に MT/ST などを選ぶ
function renderMenu(){
  const head = $('menu').querySelector('.head'), note = $('menu').querySelector('.note');
  const list = $('menuList');
  list.className = S.menu === 'job' ? 'jobgrid' : ''; list.style.display = S.menu === 'job' ? '' : 'contents';
  if (S.menu === 'job'){
    head.textContent = 'ジョブ選択';
    note.textContent = '十字で選んでA／STARTで決定';
    list.innerHTML = JOB_ORDER.map((k, i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${JOBS[k].name}</span><small>${JOBS[k].slots[0]}</small></button>`).join('');
    return;
  }
  if (S.menu === 'omake'){
    head.textContent = '陰キャと見るあたしンち';
    note.textContent = 'A／STARTでYouTubeを開く　Bでもどる';
    list.className = 'omake'; list.style.display = '';
    list.innerHTML = OMAKE.map(([, ep, sub], i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${ep}</span><small>${sub}</small></button>`).join('')
      + `<button type="button" data-i="${OMAKE.length}" class="${S.cursor === OMAKE.length ? 'cur' : ''}"><span>チャンネルを見る</span><small>しゃるるん</small></button>`;
    list.querySelector('.cur')?.scrollIntoView({ block:'nearest' });
    return;
  }
  if (S.menu === 'slot'){
    head.textContent = `${job().name}の担当`;
    note.textContent = '十字で選んでA／STARTで開始（Bでもどる）';
    $('menuList').innerHTML = job().slots.map((sl, i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${sl}</span><small>${mech().name}</small></button>`).join('');
    return;
  }
  if (S.menu === 'orchn'){
    head.textContent = `${job().name}（${mySlot()}）`;
    note.textContent = '十字で選んでA／STARTで開始（Bでもどる）';
    $('menuList').innerHTML = [1, 2].map((n, i) => {
      const flare = (mySlot() === 'MT') === (n === 1);
      return `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${n}回目</span><small>${flare ? 'フレア役（シャーク）' : 'ホーリー役（挑発・無敵）'}</small></button>`;
    }).join('');
    return;
  }
  // 2ページ：1ページ目＝ギミック（＋解放後の P5 通し）、2ページ目＝おまけ。左右で切り替え
  const pg = S.cursor >= menuMechs().length ? 1 : 0;
  head.innerHTML = `<span class="pg" data-pg="-1" role="button" aria-label="前のページ">◀</span> ギミック選択（${job().name}） ${pg + 1}/2 <span class="pg" data-pg="1" role="button" aria-label="次のページ">▶</span>`;
  note.textContent = pg ? 'A／STARTで開く　←→でページ' : 'A／STARTで開始　Y／iで解説　←→でページ';

  const L = menuMechs();
  $('menuList').innerHTML = pg ? `<button type="button" data-i="${L.length}" class="extra cur"><span>おまけ</span><small>陰キャと見るあたしンち</small></button>` : L.map((m, i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}${m === RUN ? ' secret' : ''}"><span>${m.name}</span><small>${m.sub}</small><span class="i" data-info="${m.id}" role="button" aria-label="${m.name}の解説">i</span></button>`).join('');
}
function menuCount(){ return S.menu === 'omake' ? OMAKE.length + 1 : S.menu === 'mech' ? menuMechs().length + 1 : S.menu === 'job' ? JOB_ORDER.length : S.menu === 'slot' ? job().slots.length : S.menu === 'orchn' ? 2 : MECHS.length; }
const infoTarget = () => S.phase === 'done' ? mech().id : S.phase === 'menu' && !titleOn && S.menu === 'mech' && S.cursor < menuMechs().length ? menuMechs()[S.cursor].id : null;
function openJobs(){ S.menu = 'job'; S.cursor = Math.max(0, JOB_ORDER.indexOf(opt.job)); renderMenu(); }
// タンクでオーケストラを選んだら、1回目か2回目かを選ぶ
const needOrchN = () => mech().id === 'orch' && job().role === 'tank';
function openOrchN(){ S.menu = 'orchn'; S.cursor = opt.orch - 1; renderMenu(); }
function menuConfirm(i = S.cursor){
  sfx.unlock(); sfx.ok();
  if (S.menu === 'job'){
    opt.job = JOB_ORDER[i]; store.set('job', opt.job); applyTitle();
    S.menu = 'mech'; S.cursor = Math.max(0, menuMechs().indexOf(mech())); renderMenu();
    return;
  }
  if (S.menu === 'slot'){
    opt.slot[opt.job] = job().slots[i]; store.set('slot', opt.slot); applyTitle();
    if (needOrchN()) openOrchN(); else begin();
    return;
  }
  if (S.menu === 'omake'){ openOmake(i); return; }
  const L = menuMechs();
  if (S.menu === 'mech' && i === L.length){ S.menu = 'omake'; S.cursor = 0; renderMenu(); return; }
  if (S.menu === 'orchn'){ opt.orch = i + 1; store.set('orch', opt.orch); applyTitle(); begin(); return; }
  opt.mech = L[i].id; store.set('mech', opt.mech); applyTitle();
  if (L[i].slots && job().slots.length > 1){
    S.menu = 'slot'; S.cursor = Math.max(0, job().slots.indexOf(mySlot())); renderMenu();
    return;
  }
  if (needOrchN()){ openOrchN(); return; }
  begin();
}
function menuBack(){
  if (S.menu === 'job') return;
  if (S.menu === 'mech'){ openJobs(); sfx.unlock(); sfx.back(); return; }
  if (S.menu === 'omake'){ S.menu = 'mech'; S.cursor = menuMechs().length; renderMenu(); sfx.unlock(); sfx.back(); return; }
  if (S.menu === 'orchn' && job().slots.length > 1 && mech().slots){ S.menu = 'slot'; S.cursor = Math.max(0, job().slots.indexOf(mySlot())); }
  else { S.menu = 'mech'; S.cursor = Math.max(0, menuMechs().indexOf(mech())); }
  renderMenu(); sfx.unlock(); sfx.back();
}
// 隠しコマンド：ギミック選択で ↑↑↓↓←→←→BA → メニューに「P5 通し」が出る（一度入れたら残る）
const KONAMI = ['u', 'u', 'd', 'd', 'l', 'r', 'l', 'r', 'b', 'a'];
let kbuf = [];
function kin(tok){
  if (titleOn || S.phase !== 'menu' || S.menu !== 'mech'){ kbuf = []; return false; }
  kbuf.push(tok); if (kbuf.length > KONAMI.length) kbuf.shift();
  if (tok === 'b' && kbuf.slice(-9).join() === KONAMI.slice(0, 9).join()) return true; // B で戻らない
  if (tok === 'a' && kbuf.join() === KONAMI.join()){ kbuf = []; unlockRun(); return true; }
  return false;
}
function unlockRun(){
  store.set('p5', true); sfx.unlock(); sfx.clear();
  S.cursor = menuMechs().indexOf(RUN); renderMenu();
  const head = $('menu').querySelector('.head'); head.textContent = '隠しステージ解放！'; head.classList.add('blink');
  setTimeout(() => { head.classList.remove('blink'); if (S.phase === 'menu' && S.menu === 'mech') renderMenu(); }, 1200); // メニューに出すだけ（始めるのは自分で選んでから）
}
function moveCursor(d, horiz = false){
  if (!horiz) kin(d < 0 ? 'u' : 'd');
  if (S.menu === 'mech'){ // 今のページの中だけで上下
    const n = menuMechs().length;
    if (S.cursor < n) S.cursor = (S.cursor + d + n) % n;
  }
  else { if (S.menu === 'job' && !horiz) d *= 2; S.cursor = (S.cursor + d + menuCount()) % menuCount(); }
  renderMenu(); sfx.unlock(); sfx.cursor(); }
// ギミック選択のページ切り替え（2ページなので左右どちらでも反対のページへ）
function flipPage(){
  const n = menuMechs().length;
  S.cursor = S.cursor >= n ? Math.max(0, menuMechs().indexOf(mech())) : n;
  renderMenu(); sfx.unlock(); sfx.cursor();
}

export { renderMenu, menuCount, infoTarget, openJobs, needOrchN, openOrchN, menuConfirm, menuBack, KONAMI, kbuf, kin, unlockRun, moveCursor, flipPage };
