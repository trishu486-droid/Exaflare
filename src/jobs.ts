import { opt } from './store.js';
import { mech } from './mechs.js';
import { S } from './state.js';
import { A, hasBuff } from './action.js';

// ===== ジョブ（pot は見た目のダメージ用。slots は練習できる担当） =====
// A：GCD（3段コンボ or 詠唱魔法） B/X/Y：アビリティ・バフ・一部はGCD技（gcd:true）
const BUFFS = {
  invuln:  { name:'インビンシブル', dur:10, mit:true, invuln:true, color:'#ffd84a' },
  rampart: { name:'ランパート', dur:20, mit:true, color:'#5ab0ff' },
  sheltron:{ name:'シェルトロン', dur:8, mit:true, color:'#8ad0ff' },
  guardian:{ name:'エクストリームガード', dur:15, mit:true, heavy:true, color:'#8ad0ff' },
  living:  { name:'リビングデッド', dur:10, mit:true, invuln:true, color:'#c05aff' },
  vigil:   { name:'シャドウヴィジル', dur:15, mit:true, heavy:true, color:'#b08aff' },
  riddle:  { name:'紅蓮の極意', dur:20, dmg:1.15, color:'#ff8a3a' },
  bh:      { name:'桃園結義', dur:20, dmg:1.05, color:'#ffb84a' },
  wf:      { name:'ワイルドファイア', dur:10, dmg:1.1, color:'#ff6a3a' },
  soil:    { name:'野戦治療の陣', dur:15, mit:true, regen:1.5, color:'#58e07a' },
  cu:      { name:'運命の輪', dur:15, mit:true, regen:2, color:'#5ad8ff' },
  helios:  { name:'コンジャンクション・ヘリオス', dur:15, heal:25, regen:2, color:'#ffd84a' },
  ns:      { name:'ニュートラルセクト', dur:20, color:'#ffe070' },
  sun:     { name:'サンサイン', dur:15, mit:true, color:'#ffb84a' },
  galv:    { name:'鼓舞', dur:30, heal:20, shield:25, color:'#8ae05a' },
  div:     { name:'ディヴィネーション', dur:20, dmg:1.06, color:'#ffd84a' },
  exped:   { name:'疾風怒濤の計', dur:20, mit:true, color:'#9ae07a' },
};
// step：コンボの段（1→2→3の順に押すとフル威力、順番を外すと low の威力）
const JOBS = {
  // タンク：A は1〜3段目のコンボ（押すたびに次の段へ自動で切り替わる）。どのギミックでも共通
  //   B・X・Y はオーケストラでは役割で変わる（ホーリー役＝挑発・ランパート・無敵／フレア役＝シャーク・ランパート・重いバフ）、ほかは攻撃アビリティ
  pld: { name:'ナイト', role:'tank', melee:true, slots:['MT'],
         a:{ name:'ファストブレード', chain:[{ name:'ファストブレード', pot:220 }, { name:'ライオットソード', pot:330 }, { name:'ロイヤルアソリティ', pot:460 }] },
         atk:{ b:{ name:'インペレーター', cd:60, pot:580 }, x:{ name:'エクスピアシオン', cd:30, pot:450 }, y:{ name:'サークル・オブ・ドゥーム', cd:30, pot:290 } },
         x:{ name:'ランパート', cd:90, buff:'rampart' },
         invuln:{ name:'インビンシブル', cd:420, buff:'invuln' },
         heavy:{ name:'エクストリームガード', cd:120, buff:'guardian' } },
  drk: { name:'暗黒騎士', role:'tank', melee:true, slots:['ST'],
         a:{ name:'ハードスラッシュ', chain:[{ name:'ハードスラッシュ', pot:300 }, { name:'サイフォンストライク', pot:380 }, { name:'ソウルイーター', pot:480 }] },
         atk:{ b:{ name:'シャドウブリンガー', cd:60, pot:600 }, x:{ name:'エッジ・オブ・シャドウ', cd:15, pot:460 }, y:{ name:'カーヴ・アンド・スピット', cd:60, pot:540 } },
         x:{ name:'ランパート', cd:90, buff:'rampart' },
         invuln:{ name:'リビングデッド', cd:300, buff:'living' },
         heavy:{ name:'シャドウヴィジル', cd:120, buff:'vigil' } },
  mnk: { name:'モンク', role:'melee', melee:true, slots:['D1'],
         a:{ name:'猿舞連撃', pot:220, step:1 },
         b:{ name:'竜頷正拳撃', pot:320, step:2, low:150 },
         y:{ name:'虎襲崩拳', pot:420, step:3, low:180 },
         x:{ name:'陰陽闘気斬', cd:10, pot:340 } },
  rpr: { name:'リーパー', role:'melee', melee:true, slots:['D2'],
         a:{ name:'スライス', pot:320, step:1 },
         b:{ name:'ワクシングスライス', pot:400, step:2, low:160 },
         y:{ name:'インファナルスライス', pot:500, step:3, low:180 },
         x:{ name:'ブラッドストーカー', cd:10, pot:440 } },
  mch: { name:'機工士', role:'ranged', melee:false, slots:['D3'],
         a:{ name:'ヒートスプリットショット', pot:220, step:1 },
         b:{ name:'ヒートスラッグショット', pot:320, step:2, low:160 },
         y:{ name:'ヒートクリーンショット', pot:440, step:3, low:180 },
         x:{ name:'チェックメイト', cd:10, pot:170 } },
  blm: { name:'黒魔道士', role:'caster', melee:false, slots:['D4'],
         a:{ name:'ファイジャ', pot:320, cast:2.0 },
         b:{ name:'迅速魔', cd:40, instant:1 },
         x:{ name:'ゼノグロシー', cd:30, gcd:true, pot:880 },
         y:{ name:'三連魔', cd:60, instant:3 } },
  ast: { name:'占星術師', role:'healer', melee:false, slots:['H1'],
         a:{ name:'フォールマレフィク', pot:270, cast:1.5 },
         b:{ name:'コンジャンクション・ヘリオス', gcd:true, cd:0, cast:1.5, buff:'helios' },
         x:{ name:'運命の輪', cd:60, buff:'cu' },
         y:{ name:'ニュートラルセクト', cd:120, buff:'ns' } },
  sch: { name:'学者', role:'healer', melee:false, slots:['H2'],
         a:{ name:'極炎法', pot:310, cast:1.5 },
         b:{ name:'士気高揚の策', gcd:true, cd:0, cast:2.0, buff:'galv' },
         x:{ name:'野戦治療の陣', cd:30, buff:'soil' },
         y:{ name:'疾風怒濤の計', cd:120, buff:'exped' } },
};
const JOB_ORDER = ['pld', 'drk', 'mnk', 'rpr', 'mch', 'blm', 'ast', 'sch'];
// 目標DPS（絶の実戦での目安）。理想どおり回すとこの値に届くよう、威力1あたりのダメージをジョブごとに決める
const TARGET_DPS = { pld:19000, drk:20000, mnk:31000, rpr:31000, mch:27000, blm:32000, ast:15000, sch:14500 };
const CRIT_AVG = 1.125; // クリ率25%・1.5倍の期待値
// 理想の毎秒威力：GCD（コンボは平均）＋ダメージのあるアビリティ／リキャスト付きGCD技の上乗せ
function idealPps(j){
  const steps = KEYS.filter(k => j[k].step), chain = j.a.chain;
  const aPot = chain ? chain.reduce((s, c) => s + c.pot, 0) / chain.length : steps.length ? steps.reduce((s, k) => s + j[k].pot, 0) / steps.length : j.a.pot;
  let pps = aPot / GCD;
  KEYS.forEach(k => { const ab = j[k]; if (!ab.pot || ab.step || k === 'a') return; pps += ab.gcd ? (ab.pot - aPot) / ab.cd : ab.pot / ab.cd; });
  return pps;
}
// タンクは攻撃アビリティ込みの構成で計算する（オーケストラ中にボタンが変わっても、1あたりのダメージは変えない）
const dmgPerPot = () => { const j = JOBS[opt.job]; return TARGET_DPS[opt.job] / (idealPps(j.role === 'tank' ? { ...j, ...j.atk } : j) * CRIT_AVG); };
const PROVOKE = { name:'挑発', cd:30, enmity:'provoke' }, SHIRK = { name:'シャーク', cd:120, enmity:'shirk' };
const SUNSIGN = { name:'サンサイン', cd:0, buff:'sun', sunsign:true }; // ニュートラルセクト中に1回だけ
const KEYS = ['a', 'b', 'x', 'y'];
// GCD を使うボタン（A・コンボの段・GCD技）か
const isGcd = (j, k) => k === 'a' || !!j[k].step || !!j[k].gcd;
const GCD = 2.5, QUEUE = 0.5, MELEE = 3, SLIDECAST = 0.5;

if (!JOBS[opt.job]) opt.job = 'pld';
// オーケストラのタンクの役割：1回目は MT がフレア（ヘイト1位）・ST がホーリー、2回目はその逆
const tankRole = () => mech().id === 'p5' ? (S.inst?.tankRole?.(S.t) ?? 'atk') : mech().id !== 'orch' ? 'atk' : (mySlot() === 'MT') === (opt.orch === 1) ? 'flare' : 'holy';
const jobCache: Record<string, any> = {};
const job = () => {
  const j = JOBS[opt.job];
  // 占星：ニュートラルセクト中は Y がサンサインに変わる（1回だけ）
  if (opt.job === 'ast'){ let sun = false; try { sun = hasBuff('ns') && !A.sunUsed; } catch {} return sun ? (jobCache.astSun ||= { ...j, y:SUNSIGN }) : j; }
  if (j.role !== 'tank') return j;
  const key = opt.job + tankRole();
  // オーケストラ以外はバフ・ヘイト管理なし：B・X・Y は攻撃アビリティ
  return jobCache[key] ||= tankRole() === 'atk' ? { ...j, ...j.atk } : tankRole() === 'flare' ? { ...j, b:SHIRK, y:j.heavy } : { ...j, b:PROVOKE, y:j.invuln };
};
// 担当（MT/ST・D1/D2・H1/H2 は切り替え式、他は固定）
const mySlot = () => { const sl = JOBS[opt.job].slots; return sl.includes(opt.slot[opt.job]) ? opt.slot[opt.job] : sl[0]; };

export { BUFFS, JOBS, JOB_ORDER, TARGET_DPS, CRIT_AVG, idealPps, dmgPerPot, PROVOKE, SHIRK, SUNSIGN, KEYS, isGcd, GCD, QUEUE, MELEE, SLIDECAST, tankRole, jobCache, job, mySlot };
