import { $, store } from './store.js';
import { sfx } from './audio.js';

// ===== お知らせ（上のベル） =====
// 更新を「確定」してコミットするたびに、いちばん上に1件足す（日時は日本時間・新しい順）
// 見たかどうかは、その端末に「最後に開いたときのいちばん新しい日時」を覚えておくだけ
const NEWS: [string, string][] = [
  ['2026/10/06 12:36', 'ホーム画面から開いたとき、上のボタンが時計の表示に被って見えるのを修正（上の余白を多めに）。開いた直後に画面が小さく出ることがあるのも修正'],
  ['2026/10/06 12:27', 'お知らせ・お問い合わせ・ランキング・設定・解説の画面で、上が時計の表示に隠れる・「とじる」が下にありすぎてスクロールしないと押せないのを修正'],
  ['2026/10/06 09:49', 'スマホで画面が小さく出ることがあったのを修正。機種ごとに、画面の高さにちょうど収まる大きさで表示するように'],
  ['2026/10/06 08:47', 'お知らせ（ベル）とお問い合わせ（手紙）を追加。ランキングに登録した日付を表示するように。プレイ中の左上のギミック名とジョブを2行に分けて、切れにくく'],
  ['2026/10/06 01:35', 'エクサ：爆発した床（溶岩）が約0.9秒残るように。床が割れる破片と着弾の光を追加。爆発の見た目は判定より0.1秒遅れて出るように（実機の「見えた時にはもう当たっている」感覚に近づけました）'],
  ['2026/10/06 01:35', 'ミッシング：3回目に北（A）の穴が出ないように。4回目まで時計回りで回れます'],
  ['2026/10/06 00:31', 'P5 通しを、隠しコマンドなしでいつでも選べるように（P5 のギミック一覧のいちばん下）'],
  ['2026/10/03 16:07', 'P4（おちょくりソウル）を追加。ツール名を「絶妖星乱舞 シミュレーター」に'],
  ['2026/10/01 08:50', 'オーケストラ2回目：D2・D4 の誘導を修正'],
  ['2026/09/30 12:27', '設定に「サウンド」タブを追加。BGM の音量を変えられるように'],
  ['2026/09/30 01:29', 'みんなのランキングを追加（DPS 順・Perf 表示）'],
  ['2026/09/29 20:18', 'ホーム画面に追加したとき（iPhone）に、上が隠れる・BGM が鳴らない問題を修正'],
  ['2026/09/29 11:58', '戦闘 BGM を追加して、設定から選べるように（すべてオリジナル曲）'],
  ['2026/09/28 12:33', 'P5 通し：ケフカの HP を追加。削りきればクリア'],
  ['2026/09/28 12:24', 'ギミック選択を P4・P5 のページに分けて、左右で切り替えられるように'],
  ['2026/09/28 01:23', 'ギミックごとの解説（i マーク）を追加'],
  ['2026/09/28 01:07', 'おまけ（陰キャと見るあたしンち）を追加'],
  ['2026/09/28 01:40', 'P5 通しを追加'],
  ['2026/09/27 21:57', 'P5 の5つのギミック（フラッド・オーケストラ・スリースターズ・混沌の終末・ミッシング）がそろいました'],
  ['2026/09/27 00:26', '公開（P5 混沌の終末のエクサ練習から）'],
].sort((a, b) => b[0].localeCompare(a[0])) as [string, string][];

const latest = NEWS[0][0];
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const unread = () => (store.get('newsSeen', '') as string) < latest;
function syncDot(){ $('bNews').classList.toggle('dot', unread()); }

function openNews(){
  const seen = store.get('newsSeen', '') as string;
  // 初めて開く人は、いちばん新しい日だけ NEW
  const isNew = (at: string) => seen ? at > seen : at.slice(0, 10) === latest.slice(0, 10);
  $('newsList').innerHTML = NEWS.map(([at, text]) =>
    `<li><div class="at">${at}${isNew(at) ? ' <b>NEW</b>' : ''}</div><div>${esc(text)}</div></li>`).join('');
  store.set('newsSeen', latest); syncDot();
  $('news').hidden = false; ($('newsList').parentElement as HTMLElement).scrollTop = 0; sfx.unlock(); sfx.ok();
}
function closeNews(){ $('news').hidden = true; sfx.back(); }

$('bNews').addEventListener('click', openNews);
$('newsClose').addEventListener('click', closeNews);
$('news').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'news') closeNews(); });
syncDot();

export { closeNews, latest as NEWS_LATEST };
