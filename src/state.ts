import { COUNTDOWN } from './config.js';

// ===== 状態 =====
// ゲーム全体の状態（メニュー・進行・結果）
interface State {
  phase:'menu' | 'count' | 'run' | 'done'; menu?:string; cursor:number;
  t:number; t0:number; endT?:number; failAt?:number | null; killed?:boolean;
  player:{ x:number; z:number }; face?:{ x:number; z:number }; hits:number; hurtT:number; inst:any; problem:any;
  score?:number; resultHtml?:string; rankEntry?:any; rankSent?:boolean | string; stickRepeat:number; omakePending:boolean;
}
const S: State = { stickRepeat:0, omakePending:false, phase:'menu', t:-COUNTDOWN, t0:0, player:{ x:0, z:5 }, hits:0, hurtT:-9, inst:null, problem:null, cursor:0 };
const keys = new Set<string>();
const stickVec = { x:0, z:0 };

function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pick = a => a[Math.random() * a.length | 0];

export { S, keys, stickVec, shuffle, pick };
