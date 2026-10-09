// 開発版の住所（dev.／p2-dev. などのプレビュー）では、本番と見分けられるように「開発版」の札を上の並びの左に常に出す
// 本番（dancing-mad-sim.pages.dev・github.io）では何もしない。?devbadge で手元でも出せる（確認用）
const host = location.hostname;
const m = host.match(/^([^.]+)\.dancing-mad-sim\.pages\.dev$/);
const force = new URLSearchParams(location.search).has('devbadge');
const name = m ? m[1] : force ? 'local' : null;
if (name){
  const el = document.createElement('div');
  el.id = 'devBadge'; el.innerHTML = `開発<small>${name}</small>`; el.setAttribute('aria-label', `開発版（${name}）。本番ではありません`);
  document.querySelector('.top')?.prepend(el); // 上の並びのいちばん左（ギミック名の前）
  document.title = `【開発版】${document.title}`;
}
export {};
