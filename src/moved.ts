// ===== 旧URL（GitHub Pages）から開いたときだけ、引っ越しのお知らせを出す =====
// 本番は Cloudflare Pages。GitHub のリポジトリを非公開にすると旧URLは見られなくなる（2026-10-31 まで。ユーザーの決定）
// 確かめるときは ?moved を付けて開く
const NEW_URL = 'https://dancing-mad-sim.pages.dev/';
const UNTIL = '2026年10月31日';

if (location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('moved')){
  const el = document.createElement('div');
  el.className = 'sheet moved';
  el.innerHTML = `<div class="panel" role="dialog" aria-labelledby="movedTitle">
    <h2 id="movedTitle">URLが変わりました</h2>
    <p>このシミュレーターは新しいURLに引っ越しました。このURL（GitHub）は <b>${UNTIL}</b> までで見られなくなります。</p>
    <p>ブックマークやホーム画面のアイコンは、新しいURLで作り直してください。</p>
    <input class="mvurl" type="text" readonly value="${NEW_URL}" aria-label="新しいURL">
    <div class="row"><button class="close" type="button" data-act="copy">URLをコピー</button><a class="close mvgo" href="${NEW_URL}">新しいURLで開く</a></div>
    <button class="close" type="button" data-act="close">とじる</button>
  </div>`;
  document.body.appendChild(el);
  const input = el.querySelector('.mvurl') as HTMLInputElement, copyBtn = el.querySelector('[data-act="copy"]') as HTMLButtonElement;
  input.addEventListener('focus', () => input.select());
  el.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (b?.dataset.act === 'close' || e.target === el){ el.remove(); return; }
    if (b?.dataset.act === 'copy'){
      try { await navigator.clipboard.writeText(NEW_URL); }
      catch { input.focus(); input.select(); document.execCommand?.('copy'); } // 古いブラウザ
      copyBtn.textContent = 'コピーしました';
      setTimeout(() => { copyBtn.textContent = 'URLをコピー'; }, 1500);
    }
  });
}

export {};
