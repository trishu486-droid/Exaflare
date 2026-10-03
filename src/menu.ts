import { $, opt, store } from './store.js';
import { S } from './state.js';
import { JOBS, JOB_ORDER, job, mySlot } from './jobs.js';
import { OMAKE, openOmake } from './omake.js';
import { mech, menuMechs } from './mechs.js';
import { RUN } from './mech_run.js';
import { titleOn } from './title.js';
import { sfx } from './audio.js';
import { applyTitle } from './hud.js';
import { begin } from './game.js';

// メニュー：ジョブ選択 → フェーズ選択（P4／P5／おまけ）→ ギミック一覧。担当が関係するギミックは次に MT/ST などを選ぶ
const PHASES = [['p4', 'P4', 'おちょくりソウル'], ['p5', 'P5', '混沌の終末ほか'], ['omake', 'おまけ', '陰キャと見るあたしンち']];
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
  if (S.menu === 'phase'){
    head.textContent = `フェーズ選択（${job().name}）`;
    note.textContent = '十字で選んでA／STARTで決定';
    list.innerHTML = PHASES.map(([id, name, sub], i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}${id === 'omake' ? ' extra' : ''}"><span>${name}</span><small>${sub}</small></button>`).join('');
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
  // ギミック一覧（選んだフェーズの分）。左右で P4／P5 を切り替え
  head.innerHTML = `<span class="pg" data-pg="-1" role="button" aria-label="前のフェーズ">◀</span> ギミック選択（${job().name}） ${opt.phase === 'p4' ? 'P4' : 'P5'} <span class="pg" data-pg="1" role="button" aria-label="次のフェーズ">▶</span>`;
  note.textContent = 'A／STARTで開始　Y／iで解説　←→でP4・P5';

  const L = menuMechs();
  $('menuList').innerHTML = L.map((m, i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}${m === RUN ? ' secret' : ''}"><span>${m.name}</span><small>${m.sub}</small><span class="i" data-info="${m.id}" role="button" aria-label="${m.name}の解説">i</span></button>`).join('');
}
function menuCount(){ return S.menu === 'omake' ? OMAKE.length + 1 : S.menu === 'mech' ? menuMechs().length : S.menu === 'phase' ? PHASES.length : S.menu === 'job' ? JOB_ORDER.length : S.menu === 'slot' ? job().slots.length : S.menu === 'orchn' ? 2 : 1; }
const infoTarget = () => S.phase === 'done' ? mech().id : S.phase === 'menu' && !titleOn && S.menu === 'mech' && S.cursor < menuMechs().length ? menuMechs()[S.cursor].id : null;
function openJobs(){ S.menu = 'job'; S.cursor = Math.max(0, JOB_ORDER.indexOf(opt.job)); renderMenu(); }
// フェーズ選択を開く。at：カーソルを置く項目（省略時は前に選んだフェーズ）
function openPhases(at = opt.phase){ S.menu = 'phase'; S.cursor = Math.max(0, PHASES.findIndex(p => p[0] === at)); renderMenu(); }
// ギミック一覧を開く（フェーズを決めて、前に選んだギミックにカーソル）
function openMechs(phase = opt.phase){ opt.phase = phase; store.set('phase', phase); S.menu = 'mech'; S.cursor = Math.max(0, menuMechs().indexOf(mech())); renderMenu(); }
// タンクでオーケストラを選んだら、1回目か2回目かを選ぶ
const needOrchN = () => mech().id === 'orch' && job().role === 'tank';
function openOrchN(){ S.menu = 'orchn'; S.cursor = opt.orch - 1; renderMenu(); }
function menuConfirm(i = S.cursor){
  sfx.unlock(); sfx.ok();
  if (S.menu === 'job'){
    opt.job = JOB_ORDER[i]; store.set('job', opt.job); applyTitle();
    openPhases();
    return;
  }
  if (S.menu === 'phase'){
    if (PHASES[i][0] === 'omake'){ S.menu = 'omake'; S.cursor = 0; renderMenu(); }
    else openMechs(PHASES[i][0]);
    return;
  }
  if (S.menu === 'slot'){
    opt.slot[opt.job] = job().slots[i]; store.set('slot', opt.slot); applyTitle();
    if (needOrchN()) openOrchN(); else begin();
    return;
  }
  if (S.menu === 'omake'){ openOmake(i); return; }
  const L = menuMechs();
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
  if (S.menu === 'phase'){ openJobs(); sfx.unlock(); sfx.back(); return; }
  if (S.menu === 'mech' || S.menu === 'omake'){ openPhases(S.menu === 'omake' ? 'omake' : opt.phase); sfx.unlock(); sfx.back(); return; }
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
  opt.phase = 'p5'; store.set('phase', 'p5');
  S.cursor = menuMechs().indexOf(RUN); renderMenu();
  const head = $('menu').querySelector('.head'); head.textContent = '隠しステージ解放！'; head.classList.add('blink');
  setTimeout(() => { head.classList.remove('blink'); if (S.phase === 'menu' && S.menu === 'mech') renderMenu(); }, 1200); // メニューに出すだけ（始めるのは自分で選んでから）
}
function moveCursor(d, horiz = false){
  if (!horiz) kin(d < 0 ? 'u' : 'd');
  if (S.menu === 'job' && !horiz) d *= 2;
  S.cursor = (S.cursor + d + menuCount()) % menuCount();
  renderMenu(); sfx.unlock(); sfx.cursor(); }
// ギミック一覧で左右：P4 と P5 を切り替え
function flipPage(){ openMechs(opt.phase === 'p4' ? 'p5' : 'p4'); sfx.unlock(); sfx.cursor(); }

export { renderMenu, menuCount, infoTarget, openJobs, openPhases, openMechs, needOrchN, openOrchN, menuConfirm, menuBack, KONAMI, kbuf, kin, unlockRun, moveCursor, flipPage };
