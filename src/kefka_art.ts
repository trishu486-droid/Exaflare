// @ts-nocheck
// =====================================================================
// P1・P4 のケフカ・P2 のゴッドケフカ・P5 のカオスケフカのドット絵（ターゲットサークルの中の姿）
// P3・P4 のボス（p4boss.ts）と同じ絵柄の手描き（kefka_hand.ts。2026-10-17 ユーザーが選んだ案）。絵の真ん中を輪の中心に置く
// =====================================================================
import { handSprite } from './kefka_hand.js';
// id：'kefka' | 'god' | 'chaos'
const kefkaSprite = id => handSprite(id);
export { kefkaSprite };
