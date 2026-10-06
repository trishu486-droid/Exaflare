import { $, opt } from './store.js';
import { sfx } from './audio.js';
import { NEWS_LATEST } from './news.js';

// ===== お問い合わせ（上の手紙） =====
// 送り先は Google フォーム（届くと管理者にメールが来る）。ページは移動せず、裏で送るだけ
// 返信はしない。不具合の確認用に、ジョブ・ギミック・端末の種類を自動で添える
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSeAYeBtUk1nWG91UeoJzpd2n3Ilf3rQhHL0Q_PYT2dLV6FcWg/formResponse';
const ENTRY = { name:'entry.312787377', body:'entry.16255419', auto:'entry.613677479' };
const MAX = 1000;

const ua = navigator.userAgent;
const device = () => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPhone/iPad'
  : /Android/.test(ua) ? 'Android' : 'PC';
const autoInfo = () => [
  `ジョブ:${opt.job}`, `フェーズ:${opt.phase}`, `ギミック:${opt.mech}`, `端末:${device()}`,
  `画面:${innerWidth}x${innerHeight}`, `ホーム画面:${matchMedia('(display-mode: standalone)').matches ? 'はい' : 'いいえ'}`,
  `版:${NEWS_LATEST}`, `UA:${ua}`,
].join(' / ');

const nameEl = () => $('mailName') as HTMLInputElement, bodyEl = () => $('mailBody') as HTMLTextAreaElement;
function setNote(text: string, cls = ''){ const n = $('mailNote'); n.textContent = text; n.className = 'note ' + cls; }
function syncCount(){ $('mailCount').textContent = `${bodyEl().value.length}/${MAX}`; }

function openMail(){
  setNote(''); syncCount(); ($('mailSend') as HTMLButtonElement).disabled = false;
  $('mail').hidden = false; sfx.unlock(); sfx.ok();
}
function closeMail(){ $('mail').hidden = true; sfx.back(); }

async function send(){
  const body = bodyEl().value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!body){ setNote('内容を書いてください', 'ng'); return; }
  const btn = $('mailSend') as HTMLButtonElement;
  btn.disabled = true; setNote('送信中…');
  const data = new URLSearchParams({ [ENTRY.name]:nameEl().value.trim().slice(0, 12), [ENTRY.body]:body.slice(0, MAX), [ENTRY.auto]:autoInfo() });
  try {
    // Google フォームは別サイトなので返事の中身は読めない（no-cors）。通信できれば届いた扱い
    await fetch(FORM, { method:'POST', mode:'no-cors', body:data });
    bodyEl().value = ''; syncCount(); setNote('送信しました。ありがとうございます！', 'ok'); sfx.clear();
  } catch {
    btn.disabled = false; setNote('送れませんでした（通信を確認してください）', 'ng');
  }
}

$('bMail').addEventListener('click', openMail);
$('mailClose').addEventListener('click', closeMail);
$('mailSend').addEventListener('click', send);
$('mailBody').addEventListener('input', () => { syncCount(); ($('mailSend') as HTMLButtonElement).disabled = false; });
$('mail').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'mail') closeMail(); });

export { closeMail };
