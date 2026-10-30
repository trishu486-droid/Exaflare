import { $, store } from './store.js';
import { sfx } from './audio.js';

// ===== お知らせ（上のベル） =====
// 更新を「確定」してコミットするたびに、いちばん上に1件足す（日時は日本時間・新しい順）
// 見たかどうかは、その端末に「最後に開いたときのいちばん新しい日時」を覚えておくだけ
const NEWS: [string, string][] = [
  ['2026/10/30 21:37', '3D カメラの左右反転を追加\n・設定の「ギミック」タブから'],
  ['2026/10/30 20:53', 'エクサが 3D に\n・実機のように自キャラの後ろから見る\n・スワイプでカメラ操作（横：向き、縦：高さ）\n・P5 通しもエクサの間だけ 3D\n・ほかに：混沌の渦の予兆をなくす（実機どおり）\n・ほかに：P1 の DPS チェックを残り15%に'],
  ['2026/10/24 09:32', 'タンクのバフ回しを追加\n・P1：4通りから選べる\n・P3：サンダガ5回を無敵・バフで受ける\n・ほかに：P1 の神々の像を見やすく'],
  ['2026/10/18 20:32', 'P1（β版）と全通しを追加\n・P1：神々の像 第一〜第三楽章・P1 通し\n・全通し：P1〜P5 を通しで（被弾で終了）\n・P4 が正式版に\n・ほかに：ボスの絵と背景を新しく'],
  ['2026/10/14 22:23', 'P2（β版）を追加\n・ミッシング・トライン・P2 通し\n・ほかに：アイコンを新しく、機工士・暗黒騎士のスキルを実機どおりに'],
  ['2026/10/09 08:38', '新しい URL ができました\n・https://dancing-mad-sim.pages.dev/ がメインに\n・設定は URL ごとに保存されます'],
  ['2026/10/09 04:29', 'P3 を追加\n・前半・じしん＆ブラックホール・どんどこ地団駄・P3 通し'],
  ['2026/10/07 01:20', '大きな攻撃の光を画面全体に'],
  ['2026/10/07 01:11', '被弾の赤い光を画面全体に'],
  ['2026/10/07 01:11', 'スマホの横向き画面を追加'],
  ['2026/10/07 00:14', 'ホーム画面から開くと小さく出るのを修正'],
  ['2026/10/07 00:14', 'プレイ画面とリザルトを大きく'],
  ['2026/10/06 15:05', 'アプリを切り替えたら音が止まるように'],
  ['2026/10/06 12:36', 'ホーム画面から開いたときの表示ずれを修正'],
  ['2026/10/06 12:27', '各画面の上が時計に隠れるのを修正'],
  ['2026/10/06 09:49', 'スマホで画面が小さく出るのを修正'],
  ['2026/10/06 08:47', 'お知らせ・お問い合わせを追加'],
  ['2026/10/06 01:35', 'エクサ：溶岩・破片・着弾の光を追加'],
  ['2026/10/06 01:35', 'ミッシング：3回目に北の穴が出ないように'],
  ['2026/10/06 00:31', 'P5 通しをいつでも選べるように'],
  ['2026/10/03 16:07', 'P4 を追加'],
  ['2026/10/01 08:50', 'オーケストラ2回目：D2・D4 の誘導を修正'],
  ['2026/09/30 12:27', 'BGM の音量を変えられるように'],
  ['2026/09/30 01:29', 'ランキングを追加'],
  ['2026/09/29 20:18', 'iPhone のホーム画面から開いたときの不具合を修正'],
  ['2026/09/29 11:58', '戦闘 BGM を追加（オリジナル曲）'],
  ['2026/09/28 12:33', 'P5 通し：ケフカの HP を追加'],
  ['2026/09/28 12:24', 'ギミック選択をフェーズごとのページに'],
  ['2026/09/28 01:23', 'ギミックの解説（i マーク）を追加'],
  ['2026/09/28 01:07', 'おまけを追加'],
  ['2026/09/28 01:40', 'P5 通しを追加'],
  ['2026/09/27 21:57', 'P5 の5つのギミックがそろいました'],
  ['2026/09/27 00:26', '公開（P5 のエクサ練習から）'],
].sort((a, b) => b[0].localeCompare(a[0])) as [string, string][];

const latest = NEWS[0][0];
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const unread = () => (store.get('newsSeen', '') as string) < latest;
function syncDot(){ $('bNews').classList.toggle('dot', unread()); }

// 1行目が見出し、「・」で始まる行は箇条書き（2026-10-30 ユーザー：長い文が続いて見づらかった。短く簡潔に書く）。「ほかに：」の行は小さく薄く
function body(text: string){
  const [head, ...rest] = text.split('\n'), items = rest.filter(l => l.startsWith('・')).map(l => l.slice(1));
  if (!items.length) return `<div>${esc(text)}</div>`;
  return `<div class="tt">${esc(head)}</div><ul>${items.map(l => `<li${l.startsWith('ほかに：') ? ' class="etc"' : ''}>${esc(l.replace(/^ほかに：/, ''))}</li>`).join('')}</ul>`;
}
function openNews(){
  const seen = store.get('newsSeen', '') as string;
  // 初めて開く人は、いちばん新しい日だけ NEW
  const isNew = (at: string) => seen ? at > seen : at.slice(0, 10) === latest.slice(0, 10);
  $('newsList').innerHTML = NEWS.map(([at, text]) =>
    `<li><div class="at">${at}${isNew(at) ? ' <b>NEW</b>' : ''}</div>${body(text)}</li>`).join('');
  store.set('newsSeen', latest); syncDot();
  $('news').hidden = false; ($('newsList').parentElement as HTMLElement).scrollTop = 0; sfx.unlock(); sfx.ok();
}
function closeNews(){ $('news').hidden = true; sfx.back(); }

$('bNews').addEventListener('click', openNews);
$('newsClose').addEventListener('click', closeNews);
$('news').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'news') closeNews(); });
syncDot();

export { closeNews, latest as NEWS_LATEST };
