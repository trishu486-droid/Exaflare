import { $ } from './store.js';
import { S } from './state.js';
import { cv } from './gfx.js';

// ===== P4：PT チャット（マクロが流れてくる）と、自分で押すメモ・頭上マーカーのボタン =====
// マクロの行は味方が流す（ギミックの真偽が分かった順）。自分の指示は自分でボタンを押して流す／頭上に付ける
let shownVer = -1, shownInst = null;
function renderP4Panel(){
  const inst = S.inst, on = !!inst?.chat && S.phase !== 'menu';
  const panel = $('p4panel');
  if (panel.hidden === on) panel.hidden = !on;
  if (!on) return;
  if (inst === shownInst && inst.chatVer === shownVer) return;
  shownInst = inst; shownVer = inst.chatVer;
  const log = $('p4chat');
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);
  log.innerHTML = inst.chat.map(l => `<div class="${l.cls}">${esc(l.text)}</div>`).join('') || '<div class="dim">（PT チャット）</div>';
  log.scrollTop = log.scrollHeight;
}
function p4Say(kind: string){ if (S.phase === 'run' || S.phase === 'count') S.inst?.say?.(kind); }
function p4Mark(m: string){ if (S.phase === 'run' || S.phase === 'count') S.inst?.setMarker?.(m); }
$('p4panel').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  if (b.dataset.say) p4Say(b.dataset.say);
  if (b.dataset.mk !== undefined) p4Mark(b.dataset.mk);
  cv.focus({ preventScroll:true });
});
// PC：5〜0 でメモ、Z/X/C/V で頭上マーカー、B で外す
const KEY_SAY = { '5':'stop', '6':'move', '7':'spread', '8':'stack', '9':'away', '0':'look' };
const KEY_MK = { z:'a1', x:'a2', c:'b1', v:'x1', b:'' };
function p4Key(key: string){
  if (!S.inst?.say) return false;
  const k = key.toLowerCase();
  if (KEY_SAY[k]){ p4Say(KEY_SAY[k]); return true; }
  if (k in KEY_MK){ p4Mark(KEY_MK[k]); return true; }
  return false;
}

export { renderP4Panel, p4Key };
