// ホーム画面に追加したときのオフライン対応（公開サイトだけ。アーティファクトなどでは登録しない）
// 公開先：Cloudflare Pages（dancing-mad-sim.pages.dev）。移行の間は GitHub Pages（github.io）でも動かす
if ('serviceWorker' in navigator && location.protocol === 'https:' && /(\.pages\.dev|\.github\.io)$/.test(location.hostname)){
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

// スマホ：操作中に画面が拡大されたり、長押しで虫眼鏡・メニューが出たりしないようにする
const stop = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', stop);   // iPhone のピンチ拡大
document.addEventListener('gesturechange', stop);
document.addEventListener('dblclick', stop, { passive:false });
// 操作部分（スティック・ボタン）とフィールドは、触れている間ブラウザの標準の動き（拡大・スクロール・長押し）を止める
['.controls', '#cv'].forEach(sel => document.querySelector(sel)?.addEventListener('touchstart', stop, { passive:false }));
// 2本指の拡大（ページ全体）
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive:false });
document.addEventListener('contextmenu', e => { if ((e.target as HTMLElement).closest('.gb')) e.preventDefault(); });

export {};
