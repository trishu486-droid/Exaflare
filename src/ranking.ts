import { FB_BASE, FB_KEY, FB_PROJECT, RANK_ON } from './ranking_config.js';
import { $, opt, store } from './store.js';
import { S } from './state.js';
import { MECHS } from './mechs.js';
import { RUN } from './mech_run.js';
import { JOBS, JOB_ORDER } from './jobs.js';
import { sfx } from './audio.js';
import { jobIconSvg } from './gfx.js';

// ===== みんなのランキング =====
// リザルトで「被弾0・補助なし・速度100%」なら登録できる。表示は FF Logs にならって DPS 順、Perf（パーセンタイル）つき
// Perf：同じギミック・同じジョブの記録の中での位置。1位が100、それ以外は floor(100 ×（総数 − 順位）÷ 総数)
//   色も FF Logs と同じ区切り（灰 <25・緑 25〜49・青 50〜74・紫 75〜94・橙 95〜98・桃 99・金 100）
// 通信先は Firestore の REST API（SDKは使わない）。名前はニックネームだけ（12文字まで）
// コレクションは rank_<ギミック>（全ジョブ）と rank_<ギミック>_<ジョブ> の2つに同じ記録を書く。
// 並び順は rankKey（スコア×100万＋DPS）の降順1本なので、Firestore の複合インデックスを作らなくても動く
const TOP = 20;
const DB = `projects/${FB_PROJECT || 'demo'}/databases/(default)/documents`;
const api = (path: string, body: any) => fetch(`${FB_BASE}/v1/${DB}${path}${FB_KEY ? `?key=${encodeURIComponent(FB_KEY)}` : ''}`,
  { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) }).then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const col = (mech: string, job = '') => `rank_${mech}${job ? '_' + job : ''}`;
const rankKey = e => e.score * 1e6 + e.dps;
const str = (v: string | null) => v == null ? { nullValue:null } : { stringValue:v };
const int = (v: number) => ({ integerValue:String(v) });
const val = f => f == null ? null : 'stringValue' in f ? f.stringValue : 'integerValue' in f ? Number(f.integerValue) : null;

// 登録できない理由（なければ null）。buildResult から呼ぶ
function rankBlock(){
  if (!RANK_ON) return 'off';
  if (S.hits) return '被弾0でクリアしたときだけ登録できます';
  if (opt.speed !== 1) return 'ゲーム速度100%のときだけ登録できます';
  if (opt.safe || opt.path || opt.spots) return '安地表示・補助表示・立ち位置ガイドがすべてOFFのときだけ登録できます';
  return null;
}
// リザルトの内容を、登録用の1件にしておく
function rankPrepare(entry){ S.rankEntry = entry; S.rankSent = false; }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
// P5 通しは隠しステージ。解放前は「？？？」として並べ、中身は見せない
const unlockedRun = () => store.get('p5', false);
const mechs = () => [...MECHS, RUN];
const mechLabel = m => m.id === RUN.id && !unlockedRun() ? '？？？' : m.name;

let view = { mech:'', job:'' };
const fields = doc => Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, val(v)])) as any;
// 件数を数える（where は dps の範囲。なしなら総数）
async function count(c: string, gt?: number){
  const q: any = { from:[{ collectionId:c }] };
  if (gt != null) q.where = { fieldFilter:{ field:{ fieldPath:'dps' }, op:'GREATER_THAN', value:int(gt) } };
  const res = await api(':runAggregationQuery', { structuredAggregationQuery:{ structuredQuery:q, aggregations:[{ alias:'n', count:{} }] } });
  return Number(res?.[0]?.result?.aggregateFields?.n?.integerValue) || 0;
}
const totals: Record<string, Promise<number>> = {};
async function perfOf(mech: string, job: string, dps: number){
  const c = col(mech, job);
  const [n, above] = await Promise.all([totals[c] ||= count(c), count(c, dps)]);
  const rank = above + 1;
  return rank <= 1 ? 100 : Math.max(0, Math.floor(100 * (n - rank) / Math.max(1, n)));
}
const perfCol = (v: number) => v >= 100 ? 'gold' : v >= 99 ? 'pink' : v >= 95 ? 'orange' : v >= 75 ? 'purple' : v >= 50 ? 'blue' : v >= 25 ? 'green' : 'grey';
async function load(){
  const list = $('rankList'), my = JSON.stringify(view);
  if (view.mech === RUN.id && !unlockedRun()){ list.innerHTML = '<li class="dim secret">？？？<br>どこかに隠されたステージを見つけると、ここが開きます。</li>'; return; }
  list.innerHTML = '<li class="dim">読み込み中…</li>';
  for (const k in totals) delete totals[k]; // 開くたびに数え直す
  try {
    const res = await api(':runQuery', { structuredQuery:{ from:[{ collectionId:col(view.mech, view.job) }],
      orderBy:[{ field:{ fieldPath:'dps' }, direction:'DESCENDING' }], limit:TOP * 2 } });
    // FF Logs と同じく、1人（名前＋ジョブ）につき一番いい記録だけ
    const seen = new Set<string>(), rows = res.filter(x => x.document).map(x => fields(x.document))
      .filter(x => { const k = x.name + '/' + x.job; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, TOP);
    if (JSON.stringify(view) !== my) return; // 読み込み中に切り替えた
    if (!rows.length){ list.innerHTML = '<li class="dim">まだ記録がありません</li>'; return; }
    list.innerHTML = '<li class="hd"><b>#</b><span>名前</span><span></span><span class="dp">DPS</span><span class="pf">Perf</span></li>' + rows.map((x, i) =>
      `<li><b>${i + 1}</b><span class="nm">${esc(x.name)}</span><span class="jb" title="${esc(JOBS[x.job]?.name || x.job)}">${JOBS[x.job] ? jobIconSvg(x.job) : ''}</span>` +
      `<span class="dp">${Number(x.dps).toLocaleString('en-US')}</span><span class="pf" data-i="${i}">…</span></li>`).join('');
    // Perf は後から埋める（ジョブごとの件数を数えるので少し遅れる）
    rows.forEach((x, i) => perfOf(view.mech, x.job, x.dps).then(v => {
      if (JSON.stringify(view) !== my) return;
      const el = list.querySelector(`.pf[data-i="${i}"]`); if (el){ el.textContent = String(v); el.className = 'pf ' + perfCol(v); }
    }).catch(() => {}));
  } catch { list.innerHTML = '<li class="dim">読み込めませんでした（通信を確認してください）</li>'; }
}
// 登録フォーム：今回の記録のギミックを見ているときだけ出す。登録後の「登録しました」は、とじるまでの一度きり
function renderForm(){
  const f = $('rankForm'), e = S.rankEntry, block = rankBlock();
  if (!e || e.mech !== view.mech || S.rankSent === 'done'){ f.innerHTML = ''; return; }
  if (S.rankSent){ f.innerHTML = `<p class="note ok">${esc(S.rankSent as string)}</p>`; return; }
  if (block){ f.innerHTML = `<p class="note">今回の記録は登録できません：${esc(block)}</p>`; return; }
  f.innerHTML = `<p class="note">今回の記録：<b>DPS ${e.dps.toLocaleString('en-US')}</b>（${esc(JOBS[e.job].name)}）</p>` +
    `<div class="row"><input id="rankName" maxlength="12" placeholder="ニックネーム（12文字まで）" autocomplete="nickname" value="${esc(store.get('rankName', ''))}"><button class="close" id="rankSend" type="button">登録</button></div>` +
    `<p class="note">名前は全員に公開されます。本名や連絡先は入れないでください。</p>`;
}
async function send(){
  const e = S.rankEntry, name = cleanName(($('rankName') as HTMLInputElement).value);
  if (!e || S.rankSent || rankBlock()) return;
  if (!name){ ($('rankName') as HTMLInputElement).focus(); return; }
  store.set('rankName', name);
  ($('rankSend') as HTMLButtonElement).disabled = true;
  try {
    // 同じ記録を「全ジョブ」と「ジョブ別」に1回の commit で書く。登録時刻はサーバーの時刻（ルールで確認している）
    const id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 20);
    const fields = { name:str(name), mech:str(e.mech), job:str(e.job), slot:str(e.slot), score:int(e.score), dps:int(e.dps), rankKey:int(rankKey(e)) };
    await api(':commit', { writes:[col(e.mech), col(e.mech, e.job)].map(c => ({
      update:{ name:`${DB}/${c}/${id}`, fields }, currentDocument:{ exists:false },
      updateTransforms:[{ fieldPath:'created_at', setToServerValue:'REQUEST_TIME' }] })) });
    const perf = await perfOf(e.mech, e.job, e.dps).catch(() => null);
    S.rankSent = `登録しました！ DPS ${e.dps.toLocaleString('en-US')}` + (perf != null ? `（Perf ${perf}）` : ''); sfx.clear();
    view.job = ''; ($('rankJob') as HTMLSelectElement).value = ''; // 登録したら全ジョブの表で確認
  } catch { ($('rankSend') as HTMLButtonElement).disabled = false; $('rankForm').insertAdjacentHTML('beforeend', '<p class="note ng">送れませんでした。通信を確認してもう一度。</p>'); return; }
  renderForm(); load();
}
function openRank(){
  if (!RANK_ON) return;
  view.mech = S.rankEntry?.mech || (mechs().some(m => m.id === opt.mech) && (opt.mech !== RUN.id || unlockedRun()) ? opt.mech : mechs()[0].id);
  ($('rankMech') as HTMLSelectElement).innerHTML = mechs().map(m => `<option value="${m.id}"${m.id === view.mech ? ' selected' : ''}>${mechLabel(m)}</option>`).join('');
  ($('rankJob') as HTMLSelectElement).value = view.job;
  $('rank').hidden = false; renderForm(); load(); sfx.unlock(); sfx.ok();
}
function closeRank(){ $('rank').hidden = true; if (S.rankSent) S.rankSent = 'done'; sfx.back(); }

if (RANK_ON){
  $('bRank').hidden = false;
  ($('rankJob') as HTMLSelectElement).innerHTML = '<option value="">全ジョブ</option>' + JOB_ORDER.map(k => `<option value="${k}">${JOBS[k].name}</option>`).join('');
  $('bRank').addEventListener('click', openRank);
  $('rankClose').addEventListener('click', closeRank);
  $('rank').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'rank') closeRank(); });
  $('rankMech').addEventListener('change', e => { view.mech = (e.target as HTMLSelectElement).value; renderForm(); load(); });
  $('rankJob').addEventListener('change', e => { view.job = (e.target as HTMLSelectElement).value; load(); });
  $('rankForm').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'rankSend') send(); });
  $('rankForm').addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter' && (e.target as HTMLElement).id === 'rankName') send(); });
}

export { rankBlock, rankPrepare, openRank, closeRank };
