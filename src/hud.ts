import { $, opt, store } from './store.js';
import { S } from './state.js';
import { W, ctx, drawBoss, drawField, drawHurtFlash, drawIcon, drawSafe, misses, px, setPPY } from './gfx.js';
import { mech } from './mechs.js';
import { fxDraw, fxFlashDraw, fxShakeOffset } from './fx.js';
import { A, HP, drawActFx, enmityDraw, hasBuff, hpDraw } from './action.js';
import { BUFFS, GCD, JOB_ORDER, KEYS, TARGET_DPS, isGcd, job, mySlot } from './jobs.js';
import { needOrchN, openJobs } from './menu.js';
import { titleOn } from './title.js';
import { sfx } from './audio.js';
import { rankBlock, rankPrepare } from './ranking.js';

// ===== 詠唱バー（ボス） =====
const castEl = $('cast'), castFill = $('castFill'), castName = $('castName');
function drawCast(){
  const c = S.phase === 'run' && S.inst ? S.inst.casts.find(c => S.t >= c.start && S.t < c.start + c.len && S.t <= S.inst.end) : null;
  castEl.hidden = !c;
  if (!c) return;
  if (castName.textContent !== c.name) castName.textContent = c.name;
  castFill.style.width = ((S.t - c.start) / c.len * 100).toFixed(1) + '%';
  castFill.style.background = c.color || '#fff';
}

function drawPlayer(){
  const now = performance.now(), hurtNow = now - S.hurtT < 500;
  drawIcon(px(S.player.x), px(S.player.z), hurtNow && (Math.floor(now / 70) & 1));
}

function draw(){
  const v = S.inst?.view ?? mech().view;
  setPPY((W / 2) / (typeof v === 'function' ? v(S.t) : v));
  const [sx, sz] = fxShakeOffset();
  ctx.save(); ctx.translate(sx, sz);
  drawField();
  if (opt.spots && S.inst) S.inst.guide?.(S.t);
  drawBoss();
  if (S.inst) S.inst.draw(S.t);
  if (S.phase !== 'menu') fxDraw();
  drawSafe();
  drawActFx(); drawPlayer();
  ctx.restore();
  fxFlashDraw(); drawCast(); drawHurtFlash();
}

const BTN = { a:$('btnA'), b:$('btnB'), x:$('btnX'), y:$('btnY') }, buffEl = $('buff');
// ステータスアイコン：属性色の四角に白いドット絵（右下に下向き矢印＝耐性低下）
function statusIcon({ color, icon }){
  let r = `<rect width="8" height="8" fill="${color}"/>`;
  icon.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') r += `<rect x="${i + .5}" y="${j + .5}" width="1" height="1" fill="#fff"/>`; }));
  r += '<rect x="5.5" y="5.5" width="2.5" height="2.5" fill="#000"/><rect x="6" y="6" width="1.5" height=".5" fill="#ff4d5e"/><rect x="6.5" y="6.5" width=".5" height="1" fill="#ff4d5e"/>';
  return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
// ステータスアイコン（実機のアイコンの色と絵柄を参考にした 12×14 のドット絵）
// バフは屋根付きの家形（shape:'house'）、耐性低下は上にプラスの付いた赤い盾（形ごと手描き）。文字→色、. は透明
const HOUSE = (i, j) => j >= 3 || Math.abs(i - 5.5) <= 2.5 + j * 1.5; // 緩い屋根の家形
const BUFF_ART = {
  rampart:{ shape:'house', pal:{ n:'#1a2250', o:'#ff9a3a', r:'#d84a2a', y:'#ffe070', b:'#3a5ad8', l:'#6a8aff', d:'#1a2a7a' }, px:[
    'nnnnnnooorrr','nnnnnooyyorr','nnnnnoyyyoor','bnbbnbbnbbno','bbbbbbbbbbbb','bldbbbdbbbdb','bbbdbbbbdbbb',
    'bldbbyydbbdb','bbbdbyybbdbb','bldbbbdbbbdb','bbbdbbbbdbbb','bldbbbdbbbdb','dddddddddddd','dddddddddddd'] },
  invuln:{ shape:'house', pal:{ y:'#f0c860', w:'#fff4d0', p:'#e8a0a0', r:'#c04a4a', o:'#c8902a' }, px:[
    'yyyywwwwyyyy','yyywwwwwwyyy','yywwwppwwwyy','ywwwpppwwwwy','ywwpprpwwwwy','ywwwprrpwwwy','ywwwwprpwwwy',
    'yywwwprrpwwy','yyywwwprpwyy','yyyywwwprpyy','yyyyywwwpryy','yyyyyywwwpyy','oyyyyyyywwyy','ooyyyyyyyyyy'] },
  guardian:{ shape:'house', pal:{ b:'#1a4aa8', s:'#8a9ab8', w:'#e8eef8', k:'#2a3040', l:'#5ab0ff' }, px:[
    'bbbbbbbbbbbb','bbbbbsssbbbb','bbbbswwwsbbb','bbbbswkwsbbb','bbbbsswssbbb','bbbbbsssbbbb','bbbsssssssbb',
    'bbsswwwwwssb','bbswwwwwwwsb','bbswwwwwwwsb','llbswwwwwsbl','lllbsssssbll','llllllllllll','llllllllllll'] },
  living:{ shape:'house', pal:{ r:'#c8281e', x:'#ff6a4a', G:'#8a5a2a', g:'#e8b870', w:'#ffffff', c:'#9ad0ff', s:'#f0c060' }, px:[
    'rrrrrrrrrrrr','rrrrrrrGgGrr','rxrrrrGgGwrr','rrrrrrwccwrr','rrxrrwcccwrr','rrrrrwcsswrr','rrrrrrwswrrr',
    'rrrrrwswrrxr','rrrrwcswrrrr','rrrwcsscwrrr','rrwssssswrxr','rGgGgGwwrrrr','GgGgGrrrrxrr','rrrrrrrrrrrr'] },
  vigil:{ shape:'house', pal:{ p:'#5a2a8a', m:'#e85ad8', c:'#5ad8ff', d:'#2a1040' }, px:[
    'pppppppppppp','ppmppppppmpp','pcpmppppmpcp','pcpcpmmpcpcp','pcpcpccpcpcp','pcpcpccpcpcp','pcpcpccpcpcp',
    'pcpcpccpcpcp','pcmcpccpcmcp','pcpcmccmcpcp','mmmmmmmmmmmm','pppppppppppp','dddddddddddd','dddddddddddd'] },
  soil:{ shape:'house', pal:{ l:'#e8f070', G:'#8aa820', y:'#c8d840', g:'#6a8a10' }, px:[
    'llllllllllll','lGllGllGllGl','GlGGlGGlGGlG','llllllllllll','llGllGllGllG','lGlGGlGGlGGl','llllllllllll',
    'lGllGllGllGl','GlGGlGGlGGlG','yyyyyyyyyyyy','yyGyyGyyGyyG','yGyGGyGGyGGy','gggggggggggg','gggggggggggg'] },
  exped:{ shape:'house', pal:{ t:'#2a8a8a', b:'#6a4a2a', w:'#bff4ff', c:'#5ad8e8' }, px:[
    'tttttttttttt','ttttttbbtttt','ttttttbbtttt','tttbbbbbbttt','ttbttbbtbttt','tttttbbttbtt','ttttbbbbtttt',
    'tttbbttbbttt','wwbbwwwwbbww','twbwttttwbwt','ttwwtttwwttt','cccccccccccc','tttttttttttt','tttttttttttt'] },
  cu:{ shape:'house', pal:{ n:'#1a2a6a', l:'#8ad0ff', y:'#ffe070', b:'#3a6ad8' }, px:[
    'nnnnnnnnnnnn','nnnnllllnnnn','nnnllnnllnnn','nnllnnnnllnn','nllnnnynnlln','nlnnyyyyynln','nlnnnyyynnln',
    'nlnnyynyynln','nlnnnnnnnnln','llllllllllll','bbbbbbbbbbbb','bbbbbbbbbbbb','bbbbbbbbbbbb','bbbbbbbbbbbb'] },
  div:{ shape:'house', pal:{ n:'#2a1a5a', y:'#ffd84a', w:'#fffbe0', p:'#5a3a9a' }, px:[
    'nnnnnnnnnnnn','nnnnnynnnnnn','nnnnnynnnnnn','nnynnynnynnn','nnnywwwynnnn','yyyywwwyyyyn','nnnywwwynnnn',
    'nnynnynnynnn','nnnnnynnnnnn','nnnnnynnnnnn','nnnnnnnnnnnn','pppppppppppp','pppppppppppp','pppppppppppp'] },
  helios:{ shape:'house', pal:{ y:'#e8b840', w:'#fff4c0', o:'#a07020' }, px:[
    'yyyyywwyyyyy','ywyyywwyyywy','yywyywwyywyy','yyywwwwwwyyy','yyywwwwwwyyy','wwwwwwwwwwww','yyywwwwwwyyy',
    'yyywwwwwwyyy','yywyywwyywyy','ywyyywwyyywy','yyyyywwyyyyy','oyyyyyyyyyyo','oooyyyyyyooo','oooooooooooo'] },
  ns:{ shape:'house', pal:{ b:'#3a3a9a', p:'#8a5ae8', y:'#ffe070', w:'#fffbe0' }, px:[
    'bbbbbbbbbbbb','bbbbbybbbbbb','bbbbbybbbbbb','bpbbywybbpbb','bbpywwwypbbb','byyywwwyyyyb','bbpywwwypbbb',
    'bpbbywybbpbb','bbbbbybbbbbb','bbbbbybbbbbb','pppppppppppp','bbbbbbbbbbbb','bbbbbbbbbbbb','bbbbbbbbbbbb'] },
  sun:{ shape:'house', pal:{ y:'#e8b840', w:'#fff4c0', o:'#a07020', k:'#3a2a40' }, px:[
    'yyyyywwyyyyy','yywyywwyywyy','yyywwwwwwyyy','ywwwwwwwwwwy','yyywwwwwwyyy','yywyykkyywyy','yyyyykkyyyyy',
    'yyyykkkkyyyy','yyykkkkkkyyy','yyyykkkkyyyy','yyyykyykyyyy','oyyyyyyyyyyo','oooyyyyyyooo','oooooooooooo'] },
  galv:{ shape:'house', pal:{ g:'#3a7a2a', l:'#8ae05a', y:'#e8ff9a', w:'#ffffff', d:'#1a4a1a' }, px:[
    'gggggggggggg','ggggllllgggg','gggllyylllgg','ggllyyyyllgg','gllyywwyyllg','gllywwwwyllg','gllyywwyyllg',
    'ggllyyyyllgg','gggllyylllgg','ggggllllgggg','gggggggggggg','dddddddddddd','dddddddddddd','dddddddddddd'] },
  // オーケストラ：フレア（橙の炎）とホーリー（水色の光）
  flare:{ shape:'house', pal:{ r:'#c83a1a', o:'#ff8a2a', y:'#ffe070', w:'#fffbe0' }, px:[
    'rrrrrrrrrrrr','rrrrroorrrrr','rrrrooorrrrr','rrrooyoorrrr','rrooyyyoorrr','rrooyyyyoorr','rooyywwyyoor',
    'rooywwwwyoor','rooywwwwyoor','rrooywwyoorr','rrrooyyoorrr','rrrrooorrrrr','oooooooooooo','rrrrrrrrrrrr'] },
  holy:{ shape:'house', pal:{ b:'#3a7ac8', l:'#9ad8ff', w:'#ffffff' }, px:[
    'bbbbbbbbbbbb','bbbbblbbbbbb','bbbbblbbbbbb','blbbblbbblbb','bblblwlblbbb','bbbwwwwwbbbb','llwwwwwwwllb',
    'bbbwwwwwbbbb','bblblwlblbbb','blbbblbbblbb','bbbbblbbbbbb','llllllllllll','bbbbbbbbbbbb','bbbbbbbbbbbb'] },
  // 三連魔（紫地に3つの光の玉）・迅速魔（青地に白い稲妻）
  triple:{ shape:'house', pal:{ p:'#5a2a9a', m:'#e85ad8', w:'#ffffff', d:'#2a1040' }, px:[
    'pppppppppppp','pppppppppppp','pppppmmppppp','ppppmwwmpppp','pppppmmppppp','ppmmppppmmpp','pmwwmppmwwmp',
    'ppmmppppmmpp','pppppppppppp','pppppppppppp','dddddddddddd','dddddddddddd','dddddddddddd','dddddddddddd'] },
  swift:{ shape:'house', pal:{ b:'#1a4aa8', l:'#5ab0ff', w:'#ffffff', d:'#0a2050' }, px:[
    'bbbbbbbbbbbb','bbbbbbbwwbbb','bbbbbbwwlbbb','bbbbbwwlbbbb','bbbbwwlbbbbb','bbbwwwwwwbbb','bbbbbbwwlbbb',
    'bbbbbwwlbbbb','bbbbwwlbbbbb','bbbwwlbbbbbb','bbbwlbbbbbbb','dddddddddddd','dddddddddddd','dddddddddddd'] },
  // 被魔法ダメージ増加（紫の盾に白い魔法の星）
  magicVuln:{ pal:{ k:'#1a0a0a', w:'#d8d8d8', R:'#b05aff', s:'#ffffff' }, px:[
    '....kwwk....','..kkkwwkkk..','.kwwwwwwwwk.','.kkkkwwkkkk.','kRRRRsRRRRRk','kRRRRsRRRRRk','kRRsssssRRRk',
    'kRRRsssRRRRk','kRRsRRRsRRRk','kRRRRRRRRRRk','.kRRRRRRRRk.','..kRRRRRRk..','...kkRRkk...','.....kk.....'] },
  // 耐性低下（上にプラスの付いた盾。見分けやすいよう盾を属性色、模様を白に）
  fireDown:{ pal:{ k:'#1a0a0a', w:'#d8d8d8', R:'#ff6a3a', o:'#ffffff' }, px:[
    '....kwwk....','..kkkwwkkk..','.kwwwwwwwwk.','.kkkkwwkkkk.','kRRRRRRRRRRk','kRoRRoRRoRRk','kRRoRoRoRRRk',
    'kRRRooooRRRk','kRRooooooRRk','kRRRooooRRRk','.kRRRooRRRk.','..kRRRRRRk..','...kkRRkk...','.....kk.....'] },
  iceDown:{ pal:{ k:'#1a0a0a', w:'#d8d8d8', R:'#6ad8ff', s:'#ffffff' }, px:[
    '....kwwk....','..kkkwwkkk..','.kwwwwwwwwk.','.kkkkwwkkkk.','kRRRRsRRRRRk','kRRsRsRsRRRk','kRRRsssRRRRk',
    'kRsssssssRRk','kRRRsssRRRRk','kRRsRsRsRRRk','.kRRRsRRRRk.','..kRRRRRRk..','...kkRRkk...','.....kk.....'] },
  thunderDown:{ pal:{ k:'#1a0a0a', w:'#d8d8d8', R:'#c08cff', p:'#ffffff' }, px:[
    '....kwwk....','..kkkwwkkk..','.kwwwwwwwwk.','.kkkkwwkkkk.','kRRRRRRRRRRk','kRpRRpRRpRRk','kRRpRRpRRpRk',
    'kRpRRpRRpRRk','kRRpRRpRRpRk','kRpRRpRRpRRk','.kRRpRRpRRk.','..kRRRRRRk..','...kkRRkk...','.....kk.....'] },
};
const buffIcon = id => {
  const a = BUFF_ART[id];
  if (!a) return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><rect width="8" height="8" fill="${BUFFS[id]?.color || '#888'}"/></svg>`;
  const W = 12, H = 14, inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H && HOUSE(i, j);
  let r = '';
  a.px.forEach((row, j) => [...row].forEach((ch, i) => {
    let c = a.pal[ch];
    if (a.shape === 'house'){
      if (!inside(i, j)) return;
      if (!inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1)) c = '#101018'; // 黒い縁
    }
    if (c) r += `<rect x="${i}" y="${j}" width="1" height="1" fill="${c}"/>`;
  }));
  return `<svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
};
// ボタンに出す略称（攻略記事・ブログ・掲示板で使われているのを確認できたものだけ）
const SHORT = { 'ロイヤルアソリティ':'ロイアソ', 'エクスピアシオン':'エクスピ', 'インビンシブル':'インビン', 'ランパート':'ランパ',
  'リビングデッド':'リビデ', 'シャドウヴィジル':'ヴィジル', 'ゼノグロシー':'ゼノ', 'ニュートラルセクト':'ニューセク',
  '士気高揚の策':'士気', '野戦治療の陣':'陣', '疾風怒濤の計':'疾風',
  'ヒートスプリットショット':'スプリット', 'ヒートスラッグショット':'スラッグ', 'ヒートクリーンショット':'クリーン',
  'ワクシングスライス':'ワクシング', 'インファナルスライス':'インファナル' };
function setBtn(el, key, name, p, ready, combo = false){
  name = SHORT[name] || name;
  el.classList.toggle('longname', name.length > 10);
  el.style.setProperty('--p', p.toFixed(3));
  el.classList.toggle('ready', ready);
  el.classList.toggle('combo', combo);
  const b = el.firstElementChild, sm = el.lastElementChild;
  if (b.textContent !== key) b.textContent = key;
  if (sm.textContent !== name) sm.textContent = name;
}
// 通しのタンク：ホットバーが切り替わる3秒前から、ボタンの上に残り秒数を出す。切り替わった直後はボタンが光る
function swapHint(run){
  const ab = document.querySelector('.ab') as HTMLElement;
  let soon = '';
  if (run && job().role === 'tank' && S.inst?.tankRole){
    const now = S.inst.tankRole(S.t);
    for (let d = .25; d <= 3; d += .25) if (S.inst.tankRole(S.t + d) !== now){ soon = `切替まで ${Math.ceil(d)}`; break; }
  }
  if (ab.dataset.soon !== soon){ ab.dataset.soon = soon; ab.classList.toggle('soon', !!soon); }
  ab.classList.toggle('swapped', run && S.t - A.swapAt < 1.2);
}
function drawButtons(){
  const run = S.phase === 'run', j = job();
  swapHint(run);
  const gcdP = run ? Math.max(0, Math.min(1, (A.readyAt - S.t) / GCD)) : 0;
  KEYS.forEach(k => {
    const ab = j[k];
    if (isGcd(j, k) && !ab.gcd){
      // コンボは「次に押す段」だけ金枠
      const next = !ab.step || ab.step === 1 ? A.combo === 0 || !ab.step : A.combo === ab.step - 1;
      // 1段目を打ったあとは、次の段のボタンを点滅させる
      if (ab.chain){ setBtn(BTN[k], k.toUpperCase(), ab.chain[A.combo % ab.chain.length].name, gcdP, run && gcdP === 0 && !A.cast, run && A.combo > 0); return; }
      setBtn(BTN[k], k.toUpperCase(), ab.name, gcdP, run && gcdP === 0 && !A.cast && (!ab.step || next), run && !!ab.step && A.combo > 0 && next);
      return;
    }
    const left = run && !ab.sunsign ? Math.max(0, A.cds[k] - S.t) : 0;
    setBtn(BTN[k], left > 0 ? String(Math.ceil(left)) : k.toUpperCase(), ab.name, Math.max(ab.cd ? left / ab.cd : 0, ab.gcd ? gcdP : 0), run && left === 0 && !(ab.gcd && (gcdP > 0 || A.cast)));
  });
  const st = [...[].concat(S.phase === 'run' || S.phase === 'done' ? S.inst?.status?.(S.t) ?? [] : [])];
  hpDraw(); enmityDraw();
  // 左上はバフ・デバフのアイコンだけ。上段＝デバフ（ギミックで付くもの）、下段＝バフ（自分で使ったもの）
  const icon = (art, name, n) => `<i title="${name}">${buffIcon(art)}<b>${n}</b></i>`;
  const debuffs = st.filter(x => x && x.art).map(x => icon(x.art, x.name, x.sec)).join('');
  const buffs = (run ? Object.keys(A.buffs).filter(hasBuff).map(id => icon(id, BUFFS[id].name, Math.ceil(A.buffs[id] - S.t))).join('') : '')
    + (run && A.instant ? icon(A.instantArt || 'triple', A.instantArt === 'swift' ? '迅速魔' : '三連魔', A.instant) : ''); // 数字は残りの回数
  const html = (debuffs ? `<div class="bufrow debuffs">${debuffs}</div>` : '') + (buffs ? `<div class="bufrow">${buffs}</div>` : '');
  if (buffEl.innerHTML !== html) buffEl.innerHTML = html;
}

// ===== HUD / メッセージ =====
const hSet = $('hSet'), hHit = $('hHit'), hDmg = $('hDmg'), msg = $('msg');
let lastMsg = '';
function resetMsg(){ lastMsg = ''; }
function setMsg(html){ if (html !== lastMsg){ msg.innerHTML = html; lastMsg = html; } }
function updateHud(){
  const on = S.inst && (S.phase === 'run' || S.phase === 'done');
  hSet.textContent = on ? S.inst.progress(S.t) : '';
  hHit.textContent = `HIT ${S.hits}`; hHit.className = S.hits ? 'hit' : '';
  const bossHp = S.phase !== 'menu' && S.inst?.bossHp;
  $('bossHp').hidden = !bossHp;
  if (bossHp){ const left = Math.max(0, 1 - A.dmg / bossHp); $('bossFill').style.width = (left * 100).toFixed(1) + '%'; hDmg.textContent = `ケフカ ${(left * 100).toFixed(1)}%`; }
  else hDmg.textContent = S.phase === 'menu' ? '' : `DMG ${A.dmg.toLocaleString('en-US')}`;
  if (S.phase === 'menu') hHit.textContent = '';
  if (S.phase === 'menu') setMsg('');
  else if (S.phase === 'count') setMsg(`<div class="big">${Math.ceil(S.t0 - S.t)}</div><div class="sub">${mech().name}</div>${S.inst.intro ? `<div class="sub" style="color:var(--gold)">${S.inst.intro}</div>` : ''}`);
  else if (S.phase === 'done') setMsg(S.resultHtml);
  else setMsg('');
}
// リザルトは終了した瞬間の内容で固定する（後から SELECT でジョブを変えても変わらない）
function buildResult(){
  const ok = S.hits === 0, n = v => Math.round(v).toLocaleString('en-US'), rk = rankHtml();
  // みんなのランキング：登録用に今回の記録を覚えておく（登録は上の★から）
  rankPrepare({ mech:mech().id, job:opt.job, slot:mech().slots ? mySlot() : null, score:Math.round(S.score * 100), dps:Math.round(fightDps()) });
  const block = rankBlock();
  const rankLine = block === 'off' ? '' : block ? `<div class="sub" style="color:var(--dim);font-size:12px">ランキング：${block}</div>` : `<div class="sub" style="color:var(--gold)">★ ランキングに登録できます（上の★）</div>`;
  return `<div class="result"><div class="big"><span style="color:${ok ? 'var(--green)' : 'var(--red)'}">${ok ? 'CLEAR!' : 'FAILED'}</span> ${rk}</div>` +
    `<div class="sub">${job().name}　スコア ${Math.round(S.score * 100)}%</div>` +
    (S.inst.bossHp ? `<div class="sub" style="color:${S.killed ? 'var(--gold)' : 'var(--dim)'}">${S.killed ? `ケフカ撃破！（P5 ${Math.floor((S.endT - S.t0) / 60)}:${String(Math.floor(S.endT - S.t0) % 60).padStart(2, '0')}）` : `ケフカ 残り ${(Math.max(0, 1 - A.dmg / S.inst.bossHp) * 100).toFixed(1)}%`}</div>` : '') +
    `<div class="sub">DPS ${n(fightDps())} <span style="color:var(--dim)">／ 目標 ${n(TARGET_DPS[opt.job])}</span></div>` +
    (HP.on && HP.taken ? `<div class="sub">回復・軽減 ${Math.round(healRatio() * 100)}%</div>` : '') +
    `<div class="sub">GCD ${A.gcds}回 ／ ロス ${A.loss.toFixed(1)}秒</div>` +
    [...misses].map(([r, c]) => `<div class="sub" style="color:var(--red)">${r} ×${c}</div>`).join('') + rankLine +
    `<div class="sub blink" style="margin-top:6px">START：リトライ　≡：選択</div><div class="sub" style="color:var(--dim)">Y：解説を見る</div></div>`;
}
// ランク：目標DPSに対する割合。ヒーラーは被弾するギミックでは「回復・軽減の割合」と半々。被弾したら D
const RANKS: [string, number, string][] = [['S', .95, '#ffcf4a'], ['A', .85, '#58e07a'], ['B', .70, '#5ad0ff'], ['C', .50, '#d08cff'], ['D', 0, '#8c83a8']];
const fightDps = () => { const end = S.endT ?? S.inst.end; return A.dmg / Math.max(1, S.inst.activeTime ? S.inst.activeTime(end) : end); };
// 受けたダメージ（ほかの人の軽減込み）のうち、自分の軽減・バリア・回復で埋めた割合
const healRatio = () => HP.taken ? Math.min(1, (HP.prevented + HP.absorbed + HP.healed) / HP.taken) : 1;
function rankHtml(){
  const dps = Math.min(1.2, fightDps() / TARGET_DPS[opt.job]);
  const score = HP.on && HP.taken ? (dps + healRatio()) / 2 : dps;
  const i = S.hits ? RANKS.length - 1 : RANKS.findIndex(r => score >= r[1]); // 被弾したら即 D（実戦なら落ちてDPS 0）
  const [name, , color] = RANKS[i];
  S.score = score;
  return `<span style="color:${color}">RANK ${name}</span>`;
}
function applyTitle(){
  document.querySelector<HTMLElement>('.top h1').style.visibility = S.phase === 'menu' ? 'hidden' : '';
  $('mechName').textContent = mech().name;
  $('jobName').textContent = job().name + (job().slots.length > 1 && mech().slots ? ` ${mySlot()}` : '') + (needOrchN() ? ` ${opt.orch}回目` : '');
}
function selectJob(d = 1){
  if (S.phase === 'count' || S.phase === 'run') return;
  if (S.phase === 'menu'){ if (!titleOn){ openJobs(); sfx.unlock(); sfx.cursor(); } return; } // メニュー中の SELECT はジョブ選択画面へ
  opt.job = JOB_ORDER[(JOB_ORDER.indexOf(opt.job) + d + JOB_ORDER.length) % JOB_ORDER.length];
  store.set('job', opt.job); applyTitle(); lastMsg = '';
  sfx.unlock(); sfx.blip(520, .05);
}

export { castEl, castFill, castName, drawCast, drawPlayer, draw, BTN, buffEl, statusIcon, HOUSE, BUFF_ART, buffIcon, SHORT, setBtn, drawButtons, hSet, hHit, hDmg, msg, lastMsg, resetMsg, setMsg, updateHud, buildResult, RANKS, fightDps, healRatio, rankHtml, applyTitle, selectJob };
