import { RANK_KEY, RANK_ON, RANK_URL } from './ranking_config.js';
import { $, opt, store } from './store.js';
import { S } from './state.js';
import { MECHS } from './mechs.js';
import { RUN } from './mech_run.js';
import { JOBS, JOB_ORDER } from './jobs.js';
import { sfx } from './audio.js';

// ===== みんなのランキング =====
// リザルトで「被弾0・補助なし・速度100%」なら登録できる。ギミックごとに、スコア（目標DPSに対する%）→ DPS の順で並べる
// 通信先は Supabase の REST API（scores テーブル）。名前はニックネームだけ（12文字まで）
const TOP = 20;
const headers = (extra = {}) => ({ apikey:RANK_KEY, ...(RANK_KEY.startsWith('sb_') ? {} : { Authorization:`Bearer ${RANK_KEY}` }), ...extra });
const api = (q: string, init: RequestInit = {}) => fetch(`${RANK_URL}/rest/v1/scores${q}`, { ...init, headers:headers(init.headers as any) });

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
const mechs = () => [...MECHS, ...(store.get('p5', false) ? [RUN] : [])];

let view = { mech:'', job:'' };
async function load(){
  const list = $('rankList'), q = `?select=name,job,slot,score,dps,created_at&mech=eq.${view.mech}${view.job ? `&job=eq.${view.job}` : ''}&order=score.desc,dps.desc,created_at.asc&limit=${TOP}`;
  list.innerHTML = '<li class="dim">読み込み中…</li>';
  try {
    const r = await api(q); if (!r.ok) throw new Error(String(r.status));
    const rows = await r.json();
    list.innerHTML = rows.length ? rows.map((x, i) =>
      `<li><b>${i + 1}</b><span class="nm">${esc(x.name)}</span><span class="jb">${esc(JOBS[x.job]?.name || x.job)}${x.slot ? ' ' + esc(x.slot) : ''}</span><span class="sc">${x.score}%</span><span class="dp">${Number(x.dps).toLocaleString('en-US')}</span></li>`).join('')
      : '<li class="dim">まだ記録がありません</li>';
  } catch { list.innerHTML = '<li class="dim">読み込めませんでした（通信を確認してください）</li>'; }
}
// 自分の順位：同じギミックで自分より上（スコアが高い、同点ならDPSが高い）の件数 + 1
async function myRank(e){
  const r = await api(`?select=id&mech=eq.${e.mech}&or=(score.gt.${e.score},and(score.eq.${e.score},dps.gt.${e.dps}))`, { method:'HEAD', headers:{ Prefer:'count=exact' } });
  const n = Number((r.headers.get('content-range') || '').split('/')[1]);
  return Number.isFinite(n) ? n + 1 : null;
}
function renderForm(){
  const f = $('rankForm'), e = S.rankEntry, block = rankBlock();
  const mine = e && e.mech === view.mech;
  if (!mine){ f.innerHTML = '<p class="note">練習を被弾0でクリアすると、リザルトからここで登録できます（速度100%・補助表示なし）。</p>'; return; }
  if (S.rankSent){ f.innerHTML = `<p class="note ok">${esc(S.rankSent === true ? '登録しました' : S.rankSent)}</p>`; return; }
  if (block){ f.innerHTML = `<p class="note">今回の記録（スコア ${e.score}%）は登録できません：${esc(block)}</p>`; return; }
  f.innerHTML = `<p class="note">今回の記録：<b>${e.score}%</b>（DPS ${e.dps.toLocaleString('en-US')}・${esc(JOBS[e.job].name)}）</p>` +
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
    const r = await api('', { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'return=minimal' }, body:JSON.stringify({ ...e, name }) });
    if (!r.ok) throw new Error(String(r.status));
    const pos = await myRank(e).catch(() => null);
    S.rankSent = pos ? `登録しました！ ${pos}位` : true; sfx.clear();
  } catch { ($('rankSend') as HTMLButtonElement).disabled = false; $('rankForm').insertAdjacentHTML('beforeend', '<p class="note ng">送れませんでした。通信を確認してもう一度。</p>'); return; }
  renderForm(); load();
}
function openRank(){
  if (!RANK_ON) return;
  view.mech = S.rankEntry?.mech || (mechs().some(m => m.id === opt.mech) ? opt.mech : mechs()[0].id);
  ($('rankMech') as HTMLSelectElement).innerHTML = mechs().map(m => `<option value="${m.id}"${m.id === view.mech ? ' selected' : ''}>${m.name}</option>`).join('');
  ($('rankJob') as HTMLSelectElement).value = view.job;
  $('rank').hidden = false; renderForm(); load(); sfx.unlock(); sfx.ok();
}
function closeRank(){ $('rank').hidden = true; sfx.back(); }

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
