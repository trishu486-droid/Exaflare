import { $ } from './store.js';
import { S, LOG } from './state.js';
import { cv } from './gfx.js';

// ===== P4：PT チャット（マクロが流れてくる）と、自分で押すメモ・頭上マーカーのボタン =====
// マクロの行は味方が流す（ギミックの真偽が分かった順）。自分の指示は自分でボタンを押して流す／頭上に付ける
// チャット欄は画面の中（全ギミック共通）。P4 以外はミスや結果が流れる。ボタンは P4 のときだけ
let shownVer = -1;
function renderP4Panel(){
  const on = !!S.inst?.chat && S.phase !== 'menu';
  const panel = $('p4panel');
  if (panel.classList.contains('off') === on){ panel.classList.toggle('off', !on); $('game').classList.toggle('p4on', on); }
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
function p4Say(kind: string){ if (S.phase === 'run' || S.phase === 'count') S.inst?.say?.(kind); }
$('p4panel').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  if (b.dataset.say) p4Say(b.dataset.say);
  cv.focus({ preventScroll:true });
});
// PC：5＝早 散開、6＝遅 散開、7＝止まる、8＝動く
const KEY_SAY = { '5':'early', '6':'late', '7':'stop', '8':'move' };
function p4Key(key: string){
  if (!S.inst?.say) return false;
  const k = key.toLowerCase();
  if (KEY_SAY[k]){ p4Say(KEY_SAY[k]); return true; }
  return false;
}

export { renderP4Panel, p4Key };
