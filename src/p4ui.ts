import { $ } from './store.js';
import { S, LOG } from './state.js';
import { cv } from './gfx.js';
import { fit } from './fit.js';
import { p4IconUrl } from './p4icons.js';

// ===== P4：PT チャット（マクロが流れてくる）と、自分で押すメモ・頭上マーカーのボタン =====
// マクロの行は味方が流す（ギミックの真偽が分かった順）。自分の指示は自分でボタンを押して流す／頭上に付ける
// チャット欄は画面の中（全ギミック共通）。P4 以外はミスや結果が流れる。ボタンは P4 のときだけ
let shownVer = -1, shownInst = null, shownBtns = '';
const BTN_TXT = { early:'早 散開', late:'遅 散開', stop:'止まる', move:'動く' };
function renderP4Panel(){
  // チャット欄は inst.chat があるときだけ（P4 型の画面）。ボタンは inst.buttons があれば P5 型の画面でも使える
  const on = !!S.inst?.chat && S.phase !== 'menu', keysOn = (!!S.inst?.chat || !!S.inst?.buttons) && S.phase !== 'menu';
  const panel = $('p4panel');
  if (panel.classList.contains('off') === keysOn) panel.classList.toggle('off', !keysOn);
  if ($('game').classList.contains('p4on') !== on){ $('game').classList.toggle('p4on', on); fit(); } // P4 型（チャット欄あり）と P5 型で画面の作りが違うので大きさを測り直す
  // ボタンの名前はギミックごと（P3 は左端だけターゲット切替、ほかは灰色）。P3 通しは途中で変わる（buttons が関数）
  const btns = typeof S.inst?.buttons === 'function' ? S.inst.buttons(S.t) : S.inst?.buttons, bKey = JSON.stringify(btns || null);
  if (S.inst !== shownInst || bKey !== shownBtns){
    shownInst = S.inst; shownBtns = bKey;
    panel.querySelectorAll('[data-say]').forEach((b: HTMLElement) => {
      const lab = btns ? btns[b.dataset.say] : null;
      b.querySelector('span').textContent = lab || BTN_TXT[b.dataset.say];
      b.classList.toggle('dis', !!btns && !lab);
    });
  }
  renderParty(S.phase !== 'menu' && !!S.inst?.party); // パーティリスト（ヒーラーだけ）は画面の型に関係なくフィールドの右上
  renderMacroBox(S.phase !== 'menu' && !!S.inst?.macroBox);
  if (LOG.ver === shownVer) return;
  shownVer = LOG.ver;
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);
  const put = (el: HTMLElement, lines, empty: string) => {
    el.innerHTML = lines.map(l => `<div class="${l.cls}">${esc(l.text)}</div>`).join('') || `<div class="dim">${empty}</div>`;
    el.scrollTop = el.scrollHeight;
  };
  put($('p4chat'), LOG.lines.filter(l => l.cls !== 'me'), '（チャット）');
  put($('chatMe'), LOG.lines.filter(l => l.cls === 'me'), '（自分）');
}
// マクロ欄（P3 アルテマブラスター）：流れてきたマクロの行から「番号 : 担当 | …」の左の列だけを取り出して縦に並べる（例「1 C4」）
let mboxVer = -1;
function renderMacroBox(show: boolean){
  const gb = $('game');
  if (gb.classList.contains('mbon') !== show) gb.classList.toggle('mbon', show);
  if (!show){ mboxVer = -1; return; }
  if (LOG.ver === mboxVer) return;
  mboxVer = LOG.ver;
  // P4 のチャット欄と同じ：流れてきた行を下から積む。アルテマブラスターのマクロは左の列（「1 : C4」）だけ。区切りの線は出さない
  const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);
  const rows = LOG.lines.map(l => {
    const m = l.cls === 'rule' ? /^\s*(\d)\s*:\s*([^|\s]+)/.exec(l.text) : null;
    if (m) return `<div class="rule">${m[1]} : ${m[2]}</div>`;
    if (l.cls === 'rule' && /^[-\s]*$|^\S{1,2}$/.test(l.text)) return '';
    return `<div class="${l.cls}">${esc(l.text)}</div>`;
  }).filter(Boolean);
  const box = $('mbox'); box.innerHTML = rows.join('') || '<div class="dim">（PT）</div>'; box.scrollTop = box.scrollHeight;
}
// パーティリスト（P3 じしん＆ブラックホール・ヒーラーだけ）：フィールドの右上に8人の HP と、土・泥土・土属性耐性低下のアイコン。選んだ人は白い枠
// ヒーラーは8人分の HP が見えるので、自分の HP バーは消す（その場所までリストを上げる）
const ROLE_BG = { M:'#4a7ad8', S:'#4a7ad8', H:'#3aa85a', D:'#c84a4a' };
let partyHtml = '';
// 札の種類 → アイコン（土・泥土・土属性耐性低下［強］の3つだけ出す）
const TAG_ICON = { d:'earth', m:'mud', e:'earthDown' };
function renderParty(show: boolean){
  const pt = S.inst?.party, list = show ? pt.members(S.t) : null;
  show = !!list && list.some(m => m.me && m.k[0] === 'H'); // ヒーラーのときだけ
  const gb = $('game');
  if (gb.classList.contains('plon') !== show) gb.classList.toggle('plon', show);
  if (!show){ partyHtml = ''; return; }
  const sel = pt.sel;
  const html = list.map(m => `<div class="pm${m.k === sel ? ' on' : ''}${m.me ? ' me' : ''}${m.dead ? ' dead' : ''}" data-k="${m.k}">` +
    `<b style="background:${ROLE_BG[m.k[0]]}">${m.k}</b>` +
    `<span class="tg">${(m.tags || []).filter(g => TAG_ICON[g.c]).map(g => `<img class="ti" src="${p4IconUrl(TAG_ICON[g.c])}" alt="${g.t}">`).join('')}</span>` +
    `<span class="hb"><span style="width:${Math.max(0, Math.min(100, m.hp)).toFixed(0)}%"></span>${m.shield ? `<u style="left:${Math.min(100, m.hp).toFixed(0)}%;width:${Math.min(100, m.shield).toFixed(0)}%"></u>` : ''}</span>` +
    `${m.k === sel ? '<em>▶</em>' : ''}</div>`).join('');
  if (html !== partyHtml){ $('plist').innerHTML = html; partyHtml = html; }
}
$('plist').addEventListener('pointerdown', e => {
  const m = (e.target as HTMLElement).closest('.pm') as HTMLElement; if (!m || !S.inst?.party) return;
  S.inst.party.select(m.dataset.k); e.preventDefault(); cv.focus({ preventScroll:true });
});
function p4Say(kind: string){ if (S.phase === 'run' || S.phase === 'count') S.inst?.say?.(kind); }
$('p4panel').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  if (b.dataset.say && !b.classList.contains('dis')) p4Say(b.dataset.say);
  cv.focus({ preventScroll:true });
});
// PC：5＝早 散開、6＝遅 散開、7＝止まる、8＝動く
const KEY_SAY = { '5':'early', '6':'late', '7':'stop', '8':'move' };
function p4Key(key: string){
  // F1〜F8：パーティリストの対象を選ぶ（MT ST H1 H2 D1 D2 D3 D4 の順）
  const f = /^F([1-8])$/.exec(key);
  if (f && S.inst?.party){ S.inst.party.select(['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'][+f[1] - 1]); return true; }
  if (!S.inst?.say) return false;
  const k = key.toLowerCase();
  if (KEY_SAY[k]){ p4Say(KEY_SAY[k]); return true; }
  return false;
}

export { renderP4Panel, p4Key };
