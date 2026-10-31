// @ts-nocheck
// =====================================================================
// P1 のタンクのバフ回し（4通り。docs/dmu/research-p1.md 10章。2026-10-20 ユーザー）
// P1 のタンク強攻撃は4回：ばりばりルインガ1 → ハイパードライブ1 → ルインガ2 → ハイパードライブ2
//   ルインガ：1発目は詠唱が始まった時のヘイト1位（頭上に赤いマーカー。詠唱中に挑発しても変わらない）、2発目はその時のヘイト2位（2026-10-31 ユーザー）
//   2発とも同じ人が受ける（両方バフは焚かない）ので、詠唱中に相方が挑発して、受ける人をヘイト2位にする
//   ハイパードライブ：ヘイト1位に3発
// 時刻は P1 通しの時刻（第一楽章の 0）。第二楽章だけで遊ぶときは、第二楽章の時刻 + 51 で同じ表を使う
// ヘイト：はじめは MT が1位。スイッチは挑発とシャークのセット（2026-10-31 ユーザー）：
//   挑発した人が1位になり、抜かれた人がシャークする。シャークしないと SHIRK_GRACE 秒でヘイトを取り返す
//   1位の人がシャークすると相方が1位になる
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
const other = k => k === 'MT' ? 'ST' : 'MT';
// スイッチ [時刻, 挑発する人]：挑発のすぐあとに相方がシャーク
// [時刻, 挑発する人, 'keep']：シャークがまだ戻っていないので挑発だけ（抜かれた人はスタンスを外す扱い。取り返さない。2026-10-31 ユーザー）
const sw = (...a) => a.flatMap(([t, to, keep]) => keep ? [{ t, k:to, a:'prov', keep:true }] : [{ t, k:to, a:'prov' }, { t:t + .6, k:other(to), a:'shirk' }]);
// ルインガの詠唱：1回目 -13.4〜-8.4（2発目 -5.3）、2回目 68.1〜73.1（2発目 76.2）。受ける人は詠唱の前に1位、詠唱中に相方が挑発（受ける人が2位で2発目）
// 次のハイパードライブも同じ人なら、2発目のあとに挑発で1位に戻る。シャーク（120 秒）が戻っていないところは挑発だけ（keep）
const PLANS = [
  { id:'a', name:'前2回バフ・後2回無敵（ST 無敵が先）', src:'Yama Sea（ST ナイト）の基本順',
    take:{ r1:['MT', 'buff'], h1:['ST', 'buff'], r2:['ST', 'inv'], h2:['MT', 'inv'] },
    ev:sw([-11, 'ST'], [70, 'MT']) },
  { id:'b', name:'前2回バフ・後2回無敵（MT 無敵が先）', src:'Taisa（MT ナイト）',
    take:{ r1:['MT', 'buff'], h1:['ST', 'buff'], r2:['MT', 'inv'], h2:['ST', 'inv'] },
    ev:sw([-11, 'ST'], [62, 'MT'], [70, 'ST', 'keep']) }, // MT のシャークは -10 から 120 秒戻らない
  { id:'c', name:'ルインガ2 だけ無敵（MT）', src:'Yuki（MT ナイト・ST 暗黒）',
    take:{ r1:['MT', 'buff'], h1:['ST', 'buff'], r2:['MT', 'inv'], h2:['MT', 'buff'] },
    ev:sw([-11, 'ST'], [62, 'MT'], [70, 'ST', 'keep'], [100, 'MT', 'keep']) },
  { id:'d', name:'MT が前2回・ST が後2回', src:'いおべる',
    take:{ r1:['MT', 'inv'], h1:['MT', 'buff'], r2:['ST', 'buff'], h2:['ST', 'inv'] },
    ev:sw([-11, 'ST', 'keep'], [-3, 'MT'], [62, 'ST'], [70, 'MT', 'keep'], [100, 'ST', 'keep']) },
];
const plan = () => PLANS.find(p => p.id === opt.tplan) || PLANS[0];
const HOW = { buff:'バフ', inv:'無敵' };

const SHIRK_GRACE = 4; // 挑発されてからシャークするまでの猶予（秒）
// ヘイトの流れ（t：P1 通しの時刻、me：自分の担当、toRun：S.t を P1 通しの時刻に直す関数、from：自分が操作を始めた時刻）
// 味方のタンクは表のとおりに挑発し、自分が挑発したらすぐシャークする。自分の分は、from より前は表、あとは自分が押した挑発・シャーク（A.hateLog）
// 返り値：top（t の時のヘイト1位）、miss（自分が挑発されたのにシャークせず、ヘイトを取り返した時刻）
function hateRun(t, me, toRun, from = -Infinity){
  const tank = me === 'MT' || me === 'ST';
  const q = tank
    ? [...plan().ev.filter(e => e.k !== me ? e.a === 'prov' : e.t < from), ...(A.hateLog || []).map(h => ({ t:toRun(h.t), k:me, a:h.a })).filter(e => e.t >= from)]
    : [...plan().ev];
  let top = 'MT', owe = null;
  const miss = [];
  for (;;){
    q.sort((a, b) => a.t - b.t);
    const e = q.shift();
    if (!e || e.t > t) break;
    if (e.a === 'prov' && top !== e.k){
      // 挑発だけのスイッチ（keep）の近くなら、抜かれた人はシャークしなくてよい
      const keep = plan().ev.some(s => s.keep && s.k === e.k && Math.abs(s.t - e.t) < 5);
      if (!keep){
        owe = { k:top, at:e.t + SHIRK_GRACE }; q.push({ t:owe.at, k:top, a:'back' });
        if (tank && top !== me) q.push({ t:e.t + .6, k:top, a:'shirk' }); // 味方は自分の挑発のあとにシャーク
      }
      top = e.k;
    } else if (e.a === 'shirk'){
      if (top === e.k) top = other(e.k);
      if (owe?.k === e.k) owe = null;
    } else if (e.a === 'back' && owe?.k === e.k && owe.at === e.t){ top = e.k; owe = null; if (e.k === me) miss.push(e.t); }
  }
  return { top, miss };
}
const hateTop = (t, me, toRun, from) => hateRun(t, me, toRun, from).top;
const SHIRK_MISS = '相方の挑発のあとシャークしなかった（ヘイトを取り返した。スイッチは挑発とシャークのセット）';
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
export { PLANS, BUSTERS, R2_AT, HOW, NOGUARD, SHIRK_MISS, plan, hateRun, hateTop, taker, guarded, nextHate, tankHint, mitWindow, invWindow, p1TankRole };
