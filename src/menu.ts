import { $, opt, store } from './store.js';
import { S } from './state.js';
import { JOBS, JOB_ORDER, job, mySlot } from './jobs.js';
import { OMAKE, openOmake } from './omake.js';
import { mech, menuMechs } from './mechs.js';
import { titleOn } from './title.js';
import { sfx } from './audio.js';
import { applyTitle } from './hud.js';
import { begin } from './game.js';
import { jobIconSvg } from './gfx.js';
import { PLANS, HOW } from './tankplan.js';

// メニュー：ジョブ選択 → フェーズ選択（P3／P4／P5／おまけ）→ ギミック一覧。担当が関係するギミックは次に MT/ST などを選ぶ
// β版（ユーザーの決定 2026-10-14）：P2〜P4 はフェーズ選択とギミック選択の見出しに「β」。P1 も作りかけなので β
const BETA = ['p1', 'p2', 'p3', 'full']; // P4 は 2026-10-16 に正式版
const beta = (id: string) => BETA.includes(id) ? '<em class="beta">β</em>' : '';
const PHASES = [['p1', 'P1', 'ケフカ'], ['p2', 'P2', 'ゴッドケフカ'], ['p3', 'P3', 'エクスデス＆カオス'], ['p4', 'P4', 'ネオエクスデス＆カオス'], ['p5', 'P5', 'カオスケフカ'], ['full', '全通し', 'P1〜P5'], ['omake', 'おまけ', '陰キャと見るあたしンち']];
// 文を「かたまり」ごとに折り返す（| ・全角空白と「・」「〜」のあと・（ の前で区切る。かたまりの途中では折り返さない）
const ph = (s: string) => s.split(/\||(?=（)|(?<=[　・〜])/).filter(Boolean).map(x => `<span class="ph">${x}</span>`).join('');
function renderMenu(){
  const head = $('menu').querySelector('.head'), note = $('menu').querySelector('.note');
  const list = $('menuList');
  list.className = S.menu === 'job' ? 'jobgrid' : ''; list.style.display = S.menu === 'job' ? '' : 'contents';
  if (S.menu === 'job'){
    head.textContent = 'ジョブ選択';
    note.innerHTML = ph('十字で選んで|A／STARTで決定');
    // ロールで色分けして、左にジョブアイコン
    const roleCls = k => JOBS[k].role === 'tank' ? 'r-tank' : JOBS[k].role === 'healer' ? 'r-heal' : 'r-dps';
    list.innerHTML = JOB_ORDER.map((k, i) => `<button type="button" data-i="${i}" class="${roleCls(k)}${i === S.cursor ? ' cur' : ''}">${jobIconSvg(k)}<span>${JOBS[k].name}</span><small>${JOBS[k].slots[0]}</small></button>`).join('');
    return;
  }
  if (S.menu === 'phase'){
    head.innerHTML = ph(`フェーズ選択（${job().name}）`);
    note.innerHTML = ph('十字で選んで|A／STARTで決定');
    list.innerHTML = PHASES.map(([id, name, sub], i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}${id === 'omake' ? ' extra' : ''}"><span>${name}${beta(id)}</span><small>${ph(sub)}</small></button>`).join('');
    return;
  }
  if (S.menu === 'omake'){
    head.textContent = '陰キャと見るあたしンち';
    note.innerHTML = ph('A／STARTでYouTubeを開く　Bでもどる');
    list.className = 'omake'; list.style.display = '';
    list.innerHTML = OMAKE.map(([, ep, sub], i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${ep}</span><small>${sub}</small></button>`).join('')
      + `<button type="button" data-i="${OMAKE.length}" class="${S.cursor === OMAKE.length ? 'cur' : ''}"><span>チャンネルを見る</span><small>しゃるるん</small></button>`;
    list.querySelector('.cur')?.scrollIntoView({ block:'nearest' });
    return;
  }
  if (S.menu === 'slot'){
    head.textContent = `${job().name}の担当`;
    note.innerHTML = ph('十字で選んで|A／STARTで開始（Bでもどる）');
    $('menuList').innerHTML = job().slots.map((sl, i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${sl}</span><small>${mech().name}</small></button>`).join('');
    return;
  }
  if (S.menu === 'missm'){
    head.innerHTML = ph(`${mech().name}の処理法`);
    note.innerHTML = ph('十字で選んで|A／STARTで開始（Bでもどる）');
    $('menuList').innerHTML = MISS_METHODS.map(([, name, sub], i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${name}</span><small>${ph(sub)}</small></button>`).join('');
    return;
  }
  if (S.menu === 'tplan'){
    // P1 のタンクのバフ回し（tankplan.ts）。4回のタンク強攻撃を、だれが・バフか無敵かで受けるか
    head.innerHTML = ph(`${job().name}（${mySlot()}）のバフ回し`);
    note.innerHTML = ph('十字で選んで|A／STARTで開始（Bでもどる）');
    const cell = ([w, h], k) => `<i class="tp${w === mySlot() ? ' me' : ''}">${k}<br>${w}${HOW[h]}</i>`;
    $('menuList').innerHTML = PLANS.map((pl, i) => `<button type="button" data-i="${i}" class="tplan${i === S.cursor ? ' cur' : ''}"><span>${pl.name}</span>` +
      `<span class="tpr">${[['r1', 'ルインガ1'], ['h1', 'ハイドラ1'], ['r2', 'ルインガ2'], ['h2', 'ハイドラ2']].map(([k, n]) => cell(pl.take[k], n)).join('')}</span></button>`).join(''); // 出典（だれの記録か）は出さない（2026-10-21 ユーザー。tankplan.ts の src に残す）
    return;
  }
  if (S.menu === 'view'){
    head.innerHTML = ph(`${mech().name}の見え方`);
    note.innerHTML = ph('十字で選んで|A／STARTで開始（Bでもどる）');
    $('menuList').innerHTML = VIEWS.map(([, name, sub], i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${name}</span><small>${ph(sub)}</small></button>`).join('');
    return;
  }
  if (S.menu === 'orchn'){
    head.innerHTML = ph(`${job().name}（${mySlot()}）`);
    note.innerHTML = ph('十字で選んで|A／STARTで開始（Bでもどる）');
    $('menuList').innerHTML = [1, 2].map((n, i) => {
      const flare = (mySlot() === 'MT') === (n === 1);
      return `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}"><span>${n}回目</span><small>${ph(flare ? 'フレア役（シャーク）' : 'ホーリー役（挑発・無敵）')}</small></button>`;
    }).join('');
    return;
  }
  // ギミック一覧（選んだフェーズの分）。左右で P1〜P5 を切り替え
  head.innerHTML = `<span class="pg" data-pg="-1" role="button" aria-label="前のフェーズ">◀</span> ${ph(`ギミック選択|（${job().name}）${opt.phase === 'full' ? '全通し' : opt.phase.toUpperCase()}`)}${beta(opt.phase)} <span class="pg" data-pg="1" role="button" aria-label="次のフェーズ">▶</span>`;
  note.innerHTML = ph('A／STARTで開始　Y／iで解説　←→でフェーズ切替');

  const L = menuMechs();
  $('menuList').innerHTML = L.map((m, i) => `<button type="button" data-i="${i}" class="${i === S.cursor ? 'cur' : ''}${(m as any).wip ? ' wip' : ''}"><span>${m.name}</span><small>${ph(m.sub)}</small><span class="i" data-info="${m.id}" role="button" aria-label="${m.name}の解説">i</span></button>`).join('');
}
function menuCount(){ return S.menu === 'omake' ? OMAKE.length + 1 : S.menu === 'mech' ? menuMechs().length : S.menu === 'phase' ? PHASES.length : S.menu === 'job' ? JOB_ORDER.length : S.menu === 'slot' ? job().slots.length : S.menu === 'orchn' ? 2 : S.menu === 'missm' ? MISS_METHODS.length : S.menu === 'tplan' ? PLANS.length : S.menu === 'view' ? VIEWS.length : 1; }
const infoTarget = () => S.phase === 'done' ? mech().id : S.phase === 'menu' && !titleOn && S.menu === 'mech' && S.cursor < menuMechs().length ? menuMechs()[S.cursor].id : null;
function openJobs(){ S.menu = 'job'; S.cursor = Math.max(0, JOB_ORDER.indexOf(opt.job)); renderMenu(); }
// フェーズ選択を開く。at：カーソルを置く項目（省略時は前に選んだフェーズ）
function openPhases(at = opt.phase){ S.menu = 'phase'; S.cursor = Math.max(0, PHASES.findIndex(p => p[0] === at)); renderMenu(); }
// ギミック一覧を開く（フェーズを決めて、前に選んだギミックにカーソル）
function openMechs(phase = opt.phase){ opt.phase = phase; store.set('phase', phase); S.menu = 'mech'; S.cursor = Math.max(0, menuMechs().indexOf(mech())); renderMenu(); }
// タンクでオーケストラを選んだら、1回目か2回目かを選ぶ
const needOrchN = () => mech().id === 'orch' && job().role === 'tank';
function openOrchN(){ S.menu = 'orchn'; S.cursor = opt.orch - 1; renderMenu(); }
// P2 のミッシング（と P2 通し）は、選んだあとに処理法（優先順／南調整）を選ぶ（ユーザーの決定 2026-10-14。設定ではなくメニューで）
const MISS_METHODS = [['prio', '優先順', 'ヤーン速報'], ['south', '南調整', 'ヤーン速報']];
const needMissM = () => mech().id === 'p2m' || mech().id === 'p2';
function openMissM(){ S.menu = 'missm'; S.cursor = Math.max(0, MISS_METHODS.findIndex(m => m[0] === opt.miss)); renderMenu(); }
// P1 のタンク（第二楽章・P1 通し・全通し）は、バフ回しを選ぶ（2026-10-20 ユーザー）
const needTPlan = () => JOBS[opt.job].role === 'tank' && ['p1b', 'p1', 'full'].includes(mech().id);
function openTPlan(){ S.menu = 'tplan'; S.cursor = Math.max(0, PLANS.findIndex(p => p.id === opt.tplan)); renderMenu(); }
// エクサは、選んだあとに見え方（真上／3D）を選ぶ（2026-10-30 ユーザー。view3d.ts）。
// 3D だけにしたので、今はこの画面を出さない（2026-10-30 ユーザー：真上はメニューから消す。作りは残す）
const VIEWS = [['2d', '真上', 'いつもの見え方'], ['3d', '3D', '実機のように後ろから見る|（スワイプでカメラを回す）']];
const needView = () => false;
function openView(){ S.menu = 'view'; S.cursor = Math.max(0, VIEWS.findIndex(v => v[0] === opt.view)); renderMenu(); }
const nextStep = () => { if (needOrchN()) openOrchN(); else if (needMissM()) openMissM(); else if (needTPlan()) openTPlan(); else if (needView()) openView(); else begin(); };
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
    nextStep();
    return;
  }
  if (S.menu === 'omake'){ openOmake(i); return; }
  const L = menuMechs();
  if (S.menu === 'orchn'){ opt.orch = i + 1; store.set('orch', opt.orch); applyTitle(); begin(); return; }
  if (S.menu === 'missm'){ opt.miss = MISS_METHODS[i][0]; store.set('miss', opt.miss); begin(); return; }
  if (S.menu === 'tplan'){ opt.tplan = PLANS[i].id; store.set('tplan', opt.tplan); begin(); return; }
  if (S.menu === 'view'){ opt.view = VIEWS[i][0]; store.set('view', opt.view); begin(); return; }
  if ((L[i] as any).wip){ sfx.back(); return; } // まだ作っていない（P3 の開発中）
  opt.mech = L[i].id; store.set('mech', opt.mech); applyTitle();
  if (L[i].slots && job().slots.length > 1){
    S.menu = 'slot'; S.cursor = Math.max(0, job().slots.indexOf(mySlot())); renderMenu();
    return;
  }
  nextStep();
}
function menuBack(){
  if (S.menu === 'job') return;
  if (S.menu === 'phase'){ openJobs(); sfx.unlock(); sfx.back(); return; }
  if (S.menu === 'mech' || S.menu === 'omake'){ openPhases(S.menu === 'omake' ? 'omake' : opt.phase); sfx.unlock(); sfx.back(); return; }
  if ((S.menu === 'orchn' || S.menu === 'missm' || S.menu === 'tplan' || S.menu === 'view') && job().slots.length > 1 && mech().slots){ S.menu = 'slot'; S.cursor = Math.max(0, job().slots.indexOf(mySlot())); }
  else { S.menu = 'mech'; S.cursor = Math.max(0, menuMechs().indexOf(mech())); }
  renderMenu(); sfx.unlock(); sfx.back();
}
function moveCursor(d, horiz = false){
  if (S.menu === 'job' && !horiz) d *= 2;
  S.cursor = (S.cursor + d + menuCount()) % menuCount();
  // カーソルの印だけ付け替える（全部作り直すと、ジョブアイコンの画像が一瞬消えて点滅する）
  const btns = [...$('menuList').querySelectorAll('button[data-i]')] as HTMLElement[];
  if (btns.length === menuCount()){ btns.forEach(b => b.classList.toggle('cur', +b.dataset.i === S.cursor)); btns[S.cursor]?.scrollIntoView({ block:'nearest' }); }
  else renderMenu();
  sfx.unlock(); sfx.cursor(); }
// ギミック一覧で左右：P1 → P2 → P3 → P4 → P5 → P1 の順に切り替え（d＝1 で右、-1 で左）
const PAGES = ['p1', 'p2', 'p3', 'p4', 'p5'];
function flipPage(d = 1){ const i = Math.max(0, PAGES.indexOf(opt.phase)); openMechs(PAGES[(i + d + PAGES.length) % PAGES.length]); sfx.unlock(); sfx.cursor(); }

export { renderMenu, menuCount, infoTarget, openJobs, openPhases, openMechs, needOrchN, openOrchN, menuConfirm, menuBack, moveCursor, flipPage };
