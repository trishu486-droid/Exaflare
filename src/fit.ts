// ===== スマホ：本体を画面の高さにちょうど収まる大きさにする =====
// 本体の高さは幅に比例しない（ボタンや余白は大きさが決まっている）ので、機種ごとの数字ではなく、その場で測って決める
// 開いたとき・向きを変えたとき・Safari のバーが出たり引っ込んだりしたときに、
// 「今の画面の高さに収まる一番大きい幅」を二分探索で探す（CSS の max-width は JS が動く前の仮の大きさ）
const gb = document.getElementById('game') as HTMLElement;
// ホーム画面に追加して開いたとき（全画面）は html に .app を付ける。上の余白を多めにとる（style.css）
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
document.documentElement.classList.toggle('app', standalone);
const touch = matchMedia('(pointer:coarse)');
const MIN = 225, MAX = 640; // 下限より小さくすると横がはみ出す（iPhone SE で Safari のバーが出ているときなどは、これでも少しスクロールが出る。前と同じ）

function fit(){
  gb.style.setProperty('--grow', '0px');
  if (!touch.matches){ gb.style.maxWidth = ''; return; }
  const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  const vh = window.visualViewport?.height ?? innerHeight;
  const fits = (w: number) => { gb.style.maxWidth = w + 'px'; return gb.getBoundingClientRect().bottom + bodyPad <= vh + .5; };
  let lo = MIN, hi = MAX;
  // いちばん大きくしても収まる（横幅で決まる）：余った高さは画面（.screen）を縦に伸ばして使う
  if (fits(hi)){ gb.style.setProperty('--grow', Math.max(0, Math.floor(vh - gb.getBoundingClientRect().bottom - bodyPad)) + 'px'); return; }
  if (!fits(lo)){ return; } // いちばん小さくしても収まらない（そのまま小さく出す）
  for (let i = 0; i < 9; i++){ const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } // 0.8px まで詰める
  gb.style.maxWidth = Math.floor(lo) + 'px';
}

let raf = 0;
const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
addEventListener('resize', later);
addEventListener('orientationchange', later);
window.visualViewport?.addEventListener('resize', later);
touch.addEventListener?.('change', later);
document.fonts?.ready.then(later); // 文字の大きさが決まってから測り直す
// 開いた直後は画面の高さが決まりきっていないことがある（ホーム画面のアプリなど）。少しあとと、戻ってきたときにも測り直す
[300, 1000].forEach(ms => setTimeout(later, ms));
addEventListener('pageshow', later);
document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
fit();

export { fit };
