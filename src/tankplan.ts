// @ts-nocheck
// =====================================================================
// P1 のタンクのバフ回し（4通り。docs/dmu/research-p1.md 10章。2026-10-20 ユーザー）
// P1 のタンク強攻撃は4回：ばりばりルインガ1（MT が2発とも）→ ハイパードライブ1 → ルインガ2 → ハイパードライブ2
//   ルインガ：1発目はヘイト1位、2発目はヘイト2位へ（受ける人は、1発目の前に1位で、1発目のあと相方の挑発で2位に）
//   ハイパードライブ：ヘイト1位に3発
// 時刻は P1 通しの時刻（第一楽章の 0）。第二楽章だけで遊ぶときは、第二楽章の時刻 + 51 で同じ表を使う
// ヘイト：はじめは MT が1位。挑発した人が1位になり、1位の人がシャークすると相方が1位になる
// =====================================================================
import { A } from './action.js';
import { opt } from './store.js';

const BUSTERS = [
  { key:'r1', name:'ルインガ1', at:-8.4, n:2 },  // 2発（-8.4・-5.3）
  { key:'h1', name:'ハイドラ1', at:41.8, n:3 },
  { key:'r2', name:'ルインガ2', at:73.1, n:2 },  // 第二楽章の 22.1・25.2
  { key:'h2', name:'ハイドラ2', at:111.6, n:3 },
];
const R2_AT = 51; // 第二楽章の 0（P1 通しの時刻）
// どの案も、ルインガ1 は MT が2発とも受ける（ST が1発目のあとに挑発）
const BASE = [{ t:-7.8, k:'ST', a:'prov' }];
const PLANS = [
  { id:'a', name:'前2回バフ・後2回無敵（ST 無敵が先）', src:'Yama Sea（ST ナイト）の基本順',
    take:{ r1:['MT', 'buff'], h1:['ST', 'buff'], r2:['ST', 'inv'], h2:['MT', 'inv'] },
    ev:[...BASE, { t:69.1, k:'ST', a:'prov' }, { t:73.7, k:'MT', a:'prov' }] },
  { id:'b', name:'前2回バフ・後2回無敵（MT 無敵が先）', src:'Taisa（MT ナイト）',
    take:{ r1:['MT', 'buff'], h1:['ST', 'buff'], r2:['MT', 'inv'], h2:['ST', 'inv'] },
    ev:[...BASE, { t:69.1, k:'MT', a:'prov' }, { t:73.7, k:'ST', a:'prov' }] },
  { id:'c', name:'ルインガ2 だけ無敵（MT）', src:'Yuki（MT ナイト・ST 暗黒）',
    take:{ r1:['MT', 'buff'], h1:['ST', 'buff'], r2:['MT', 'inv'], h2:['MT', 'buff'] },
    ev:[...BASE, { t:69.1, k:'MT', a:'prov' }, { t:73.7, k:'ST', a:'prov' }, { t:106, k:'ST', a:'shirk' }] },
  { id:'d', name:'MT が前2回・ST が後2回', src:'いおべる',
    take:{ r1:['MT', 'inv'], h1:['MT', 'buff'], r2:['ST', 'buff'], h2:['ST', 'inv'] },
    ev:[...BASE, { t:35, k:'ST', a:'shirk' }, { t:69.1, k:'ST', a:'prov' }, { t:73.7, k:'MT', a:'prov' }, { t:106, k:'MT', a:'shirk' }] },
];
const plan = () => PLANS.find(p => p.id === opt.tplan) || PLANS[0];
const HOW = { buff:'バフ', inv:'無敵' };

// ヘイト1位（t：P1 通しの時刻、me：自分の担当、toRun：S.t を P1 通しの時刻に直す関数）
// 味方のタンクは表のとおりに動く。自分の分は表を使わず、自分が押した挑発・シャーク（A.hateLog）を使う
function hateTop(t, me, toRun){
  const ev = [...plan().ev.filter(e => e.k !== me), ...(A.hateLog || []).map(h => ({ t:toRun(h.t), k:me, a:h.a }))].filter(e => e.t <= t).sort((a, b) => a.t - b.t);
  let top = 'MT';
  ev.forEach(e => { if (e.a === 'prov') top = e.k; else if (e.a === 'shirk' && top === e.k) top = e.k === 'MT' ? 'ST' : 'MT'; });
  return top;
}
// 受ける人と受け方（key：r1・h1・r2・h2）
const taker = key => plan().take[key];
// 受けた人がちゃんと守れているか（inv：無敵が要る、buff：無敵かフルバフ＝X ランパートと Y 重いバフの両方。2026-10-31 ユーザー）
const guarded = (how, hasInvuln, hasFull) => how === 'inv' ? hasInvuln() : hasInvuln() || hasFull();
const NOGUARD = { buff:'フルバフ（ランパート＋重いバフ）', inv:'無敵' }; // ミスの文
// 自分の次の挑発・シャーク（B ボタンの中身を決める）。なければ挑発
function nextHate(t, me){ const e = plan().ev.find(e => e.k === me && e.t > t - 3); return e?.a === 'shirk' ? 'shirk' : 'prov'; }
// B をシャークにする時間を決めるのに使う（2026-10-29 ユーザー：B は挑発かシャークだけ。切り替えのカットインは action.ts の kitSwap）
// 自分が受けるタンク強攻撃の 8 秒前〜最後の1発の 1 秒後と、自分の挑発・シャークの 8 秒前〜1 秒後
function mitWindow(t, me){
  if (plan().ev.some(e => e.k === me && t >= e.t - 8 && t < e.t + 1)) return true;
  return BUSTERS.some(b => taker(b.key)[0] === me && t >= b.at - 8 && t < b.at + (b.n - 1) * 3 + 1);
}
// 案内（補助表示）：次のタンク強攻撃と受け方、自分が次にすること
function tankHint(t, me){
  const b = BUSTERS.find(b => b.at + (b.n - 1) * 3 > t);
  const mine = plan().ev.find(e => e.k === me && e.t > t - .5 && e.t < t + 8);
  // 下の帯は狭いので1つだけ：自分の挑発・シャークが近ければそれ（例：シャークまで5）、ほかは次のタンク強攻撃（例：ハイドラ1 MTバフ）
  if (mine) return `${mine.a === 'shirk' ? 'シャーク' : '挑発'}まで${Math.max(0, Math.ceil(mine.t - t))}`;
  if (b){ const [who, how] = taker(b.key); return `${b.name} ${who}${HOW[how]}`; }
  return '';
}
// Y を無敵にする時間：自分が無敵で受けるタンク強攻撃の 8 秒前〜最後の1発の 1 秒後（ほかの間は Y が重いバフ。2026-10-30 ユーザー）
const invWindow = (t, me) => BUSTERS.some(b => taker(b.key)[0] === me && taker(b.key)[1] === 'inv' && t >= b.at - 8 && t < b.at + (b.n - 1) * 3 + 1);
// P1 のタンクのボタン（jobs.ts の tankRole）：B は挑発（シャークの少し前だけシャーク）、Y は無敵の回の前だけ無敵
const p1TankRole = (t, me) => (me !== 'MT' && me !== 'ST') ? 'P' : (mitWindow(t, me) && nextHate(t, me) === 'shirk' ? 'S' : 'P') + (invWindow(t, me) ? 'i' : '');
export { PLANS, BUSTERS, R2_AT, HOW, NOGUARD, plan, hateTop, taker, guarded, nextHate, tankHint, mitWindow, invWindow, p1TankRole };
