// @ts-nocheck
import { S, pick, shuffle } from './state.js';
import { sfx } from './audio.js';
import { A, HP, popup, switchTarget } from './action.js';
import { opt } from './store.js';
import { BUFFS, JOBS, mySlot } from './jobs.js';
import { FXC, FXK, fxAdd, fxFlash, fxParts, fxShake } from './fx.js';
import { P, PPY, alpha, ctx, disc, hurt, line, px, rect, ring, targetLast } from './gfx.js';
import { drawFace } from './kefka_intro.js';
import { makeP3Fx } from './p3fx.js';
import { inBusterAoe, BUSTER_R, at, norm, segDist, CHAOS_SIDE, BOSS_TC, BOSS_COL, drawBossArt, numGlyph } from './mech_p3.js';

// =====================================================================
// P3 後半：じしん＆ブラックホール（ヤーン：頭上マーカー式。docs/research-p3.md §5・§9.3）
// 時刻は cactbot のタイムライン 768 秒（マキシマムの直前）を 0 とする
// じしん：全員 HP1 ＋ 混沌の土（ファースト3・セカンド3・サード2）、ヒーラーと DPS 各1人に混沌の泥土
// マーカー：ファースト＝攻撃、セカンド＝バインド、サード＝禁止（灰色ボタン 2〜4。押すとその段の空いている番号からランダム）
// ブラックホール：外周の玉（東西南北のうち3つ）が線を張り、線を持つ人へレーザー（無の波動）10本。3回受けた人の土が解除される
// 線は出たときの巨大ケフカから時計回りに、マーカーの番号順で取る。ビームは時計回りに向ける（1本目だけ反時計）
// 割り込み：びんびんビンタ3回、ありのままのボクチン2回、ダミングイーディクト2回、サンダガ2連×2、ホワイトホール＋インプロージョン
// 味方7人は画面に出さない（決まった動きをする見えない味方）。線の先や判定にはその位置を使う
// =====================================================================
const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
const JOB_OF = { MT:'pld', ST:'drk', H1:'ast', H2:'sch', D1:'mnk', D2:'rpr', D3:'mch', D4:'blm' };
const T = {
  max:.9, quake:4.0, mudAuto:[9.1, 13.2], mudEnd:19.0, markEnd:21.0, battleEnd:21.0,
  slap:[{ tp:13.3, cast:15.5, end:19.5, hits:[20.3, 21.1, 21.8], last:22.8 },
        { tp:43.7, cast:45.9, end:49.9, hits:[50.8, 51.4, 52.2], last:53.2 },
        { tp:111.7, cast:113.9, end:117.9, hits:[118.7, 119.2, 119.9], last:121.2 }],
  bh:19.1, bhSpawn:23.1,
  // 無の波動 10本（n＝1〜10）。set＝線が新しく出る時刻
  noth:[30.2, 37.3, 60.7, 65.8, 70.9, 95.0, 100.1, 105.2, 128.6, 135.8],
  sets:[{ at:23.3, n:[1] }, { at:30.3, n:[2] }, { at:53.8, n:[3, 4, 5] }, { at:88.3, n:[6, 7, 8] }, { at:121.6, n:[9] }, { at:134.7, n:[10], direct:true }],
  // 線は、その出現の最後の1本を撃つと消え、次の出現で新しく張られる（2本目・10本目の線は、1本目・9本目を撃った直後に出る。cactbot：Black Hole actors are reused）
  thunder:[[40.5, 43.5], [81.8, 84.8]],
  damning:[{ cast:44.6, hit:48.6 }, { cast:71.9, hit:75.9 }],
  bok:[{ tp:70.1, cast:72.3, end:76.3, hit:77.4 }, { tp:128.1, cast:130.3, end:134.3, hit:135.4 }],
  white:{ cast:112.4, hit:116.4 }, impl:{ cast:112.4, hits:[117.2, 119.2] },
  end:137.5,
};
const ARENA_R = 20, OUTER_R = 17, HOLD_R = 7.5, BEAM_HW = 2.2, TAKE_D = 1.2, MINE_HIT = 2.0, MINE_R = 1.6;
// ビンタの立ち位置：ボスのターゲットサークルのすぐ外（動画では殴りながら処理している）。中央の小円はその内側
const SLAP_R = 6.5, STACK_OK = 3, MID_R = 4.5, BOK_HW = 7, IMPL_R = 6.5;
const BOT_SPEED = 24, BOSS_SPEED = 7; // 見えない味方はプレイヤーの4倍の速さ（P5 のオーケストラと同じ。ギリギリで駆け込む）
const MUD = .8; // 混沌の泥土：受ける回復が減る
const DMG = { earth:10, noth:30, stack:10, role:15, buster:50, mine:30 }; // HP の % 。ヒーラーの HP 管理用の目安
// ブラックホールの地雷（内周・中周）。cactbot の例（西が抜けた回）の位置。中周は左右反転の並びもある（コの字式の図）。外周の玉は東西南北
const TAKE_ALONG = 2.5; // 線を取るには、持ち主から玉の側へこれだけ出る
const FIRST_GO = 4.0;   // 自分のガイド：各セットの最初の線を取りに動き出す、無の波動の何秒前か
const BOT_MARGIN = .9; // 見えない味方が駆け込みを始める余裕（秒）。線を取ってから持ち場へ行く2段の動きにも間に合うように
const BOT_GO = 1.6;     // 見えない味方：線を取りに動き出す、無の波動の何秒前か（セットの最初も受け渡しも。答えが見えないように直前で）
const WARP_OUT = .45, WARP_IN = .6; // ケフカのワープ（消える・現れる）の長さ
const VANISH_DELAY = 1.6, VANISH_DUR = .8; // ブラックホールが消えるまで（最後の無の波動から）
const EARTH_DOWN = 1.96; // じしんで付く土属性耐性低下［強］の長さ（cactbot）。これが残っているうちに次のじしんを受けると全滅
const MINE_GRACE = 2.0;  // 出た瞬間は当たらない（少しずつ現れて、この秒数のあとから当たる）
const INNER_R = 9, MID_R13 = 13.5; // 地雷：内周（東西南北 or 斜め）、中周（斜めから 22.5° ずれた位置）。cactbot の例・コの字式の図から
const MARK = { a:{ name:'攻撃', col:'#e8283a', n:3 }, b:{ name:'バインド', col:'#f0a020', n:3 }, s:{ name:'禁止', col:'#6a8aff', n:2 } };
const LINE_GROUP = { 1:'a', 2:'b', 3:'s' };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const add = (a, b, k = 1) => ({ x:a.x + b.x * k, z:a.z + b.z * k });
const bearingOf = q => (Math.atan2(q.x, -q.z) * 180 / Math.PI + 360) % 360;
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const unit = (a, b) => { const d = dist(a, b) || 1; return { x:(b.x - a.x) / d, z:(b.z - a.z) / d }; };

const P3C = {
  id:'p3c', name:'じしん＆ブラックホール', sub:'頭上マーカー式（ヤーン）', view:24, start:{ x:-3, z:3 }, slots:true,
  gen(){
    // 土の順番：泥土はヒーラー1人と DPS 1人（片方ファースト、片方セカンド）。残り6人にファースト2・セカンド2・サード2
    const hm = pick(['H1', 'H2']), dm = pick(['D1', 'D2', 'D3', 'D4']), hmFirst = Math.random() < .5;
    const rest = shuffle(SLOTS.filter(k => k !== hm && k !== dm));
    const line = { [hm]:hmFirst ? 1 : 2, [dm]:hmFirst ? 2 : 1 };
    rest.forEach((k, i) => line[k] = [1, 1, 2, 2, 3, 3][i]);
    const k8 = () => pick([0, 45, 90, 135, 180, 225, 270, 315]);
    const missing = Math.random() * 4 | 0;
    return {
      me:mySlot(), line, mud:[hm, dm],
      kefka:{ max:k8(), slap:[k8(), k8(), k8()], bok:[k8(), k8()] },
      slapRight:[Math.random() < .5, Math.random() < .5, Math.random() < .5], // true＝ケフカの右手（頭割り）
      missing, set5:shuffle([0, 1, 2, 3]).slice(0, 2), set6:Math.random() < .5 ? 0 : 1, vertical:Math.random() < .5,
      // ブラックホールの出現4回ぶん：外周の抜ける方角（1回目は missing）、地雷の並び（内周は東西南北か斜めか、中周は斜めからずれる向き）
      // 地雷は出現（セット）ごとに並び直す。同じセットのあいだは同じ並びのまま
      apps:[0, 1, 2, 3].map(i => ({ miss:i === 0 ? missing : Math.random() * 4 | 0, arr:[{ innerCard:Math.random() < .5, midSign:Math.random() < .5 ? 1 : -1 }] })),
    };
  },
  create(p){
    const now = () => S.t - (p.off || 0); // P3 通しでつないだときの、このギミックの中の時刻
    // P3 通しでは、じしんの前（決戦2回目の直後）から始まる（p.pre）。そのときは直前のサンダガ2連（-1.1・1.9）もここで扱う
    const TH = p.pre ? [[-1.1, 1.9], ...T.thunder] : T.thunder;
    const me = p.me, isHealer = JOBS[opt.job].role === 'healer', isTank = JOBS[opt.job].role === 'tank';
    const side = k => CHAOS_SIDE.includes(k) ? 'chaos' : 'exdeath';
    // ---- 巨大ケフカの位置（外周8方向）。ワープの時刻ごと ----
    const kefkaTimes = [[T.max, p.kefka.max], [T.slap[0].tp, p.kefka.slap[0]], [T.slap[1].tp, p.kefka.slap[1]], [T.bok[0].tp, p.kefka.bok[0]], [T.slap[2].tp, p.kefka.slap[2]], [T.bok[1].tp, p.kefka.bok[1]]];
    const kefkaAt = t => { let b = null; kefkaTimes.forEach(([tt, bb]) => { if (t >= tt) b = bb; }); return b; };
    // ---- ブラックホール：外周の玉（方角 0〜3＝北東南西） ----
    const M = p.missing, X1 = (M + 3) % 4;          // 1本目は抜けた所の反時計となり（次の2本が「反対」と「その時計となり」に出るので、これで決まる）
    const orbPos = d => at(d * 90, OUTER_R);
    // ケフカから時計回りの順（cactbot と同じ：斜めのケフカは時計回りの次の方角から数える）
    const cwFromKefka = (t, dirs) => { const k8 = kefkaAt(t) / 45, st = Math.round(k8 / 2) % 4; return [...dirs].sort((a, b) => ((a - st + 4) % 4) - ((b - st + 4) % 4)); };
    // 線の担当：n 本目のときに、どの玉をどのマーカーの人が持つか
    const PLAN = {};
    PLAN[1] = { [X1]:'a1' };
    PLAN[2] = { [(X1 + 3) % 4]:'a1', [(X1 + 2) % 4]:'a2' }; // ヤーン：2本目は攻撃1と攻撃2（攻撃2は1本目の反対の線）
    // ---- ブラックホールの出現（4回）。出るたびに外周の玉と地雷が新しく並び、その出現の最後の1本を撃つと消える ----
    const APPS = p.apps.map((a, i) => {
      const outer = i === 3 ? [...p.set5] : [0, 1, 2, 3].filter(d => d !== a.miss);
      const ns = [[1, 2], [3, 4, 5], [6, 7, 8], [9, 10]][i];
      const at0 = [T.bhSpawn, T.sets[2].at, T.sets[3].at, T.sets[4].at][i];
      // 内周・中周の地雷：そのセットのあいだは同じ並び。セットの最後の1本で外周の玉といっしょに消える
      const arrs = a.arr.map((r, j) => ({
        innerCard:r.innerCard,
        mines:[...[0, 1, 2, 3].map(k => at(k * 90 + (r.innerCard ? 0 : 45), INNER_R)), ...[0, 1, 2, 3].map(k => at(45 + k * 90 + 22.5 * r.midSign, MID_R13))],
        from:at0, to:T.noth[ns[ns.length - 1] - 1],
      }));
      return { ...a, outer, arrs, ns, at:at0, end:T.noth[ns[ns.length - 1] - 1] };
    });
    // セットの最後の1本のあとも VANISH_DELAY 秒残り、そのあと VANISH_DUR 秒でエクスデスへ吸い込まれて消える（動画で確認）
    const appAt = t => APPS.find(a => t >= a.at && t <= a.end + VANISH_DELAY + VANISH_DUR) || null;
    const appOfN = n => APPS.find(a => a.ns.includes(n));
    const arrOfN = n => appOfN(n).arrs[0];
    const arrAt = t => { const a = appAt(t); return a ? a.arrs.find(r => t >= r.from && t <= r.to + VANISH_DELAY + VANISH_DUR) || null : null; };
    const set3 = cwFromKefka(T.sets[2].at, APPS[1].outer);
    PLAN[3] = { [set3[0]]:'a1', [set3[1]]:'a2', [set3[2]]:'a3' };
    PLAN[4] = { ...PLAN[3], [set3[0]]:'b1' }; PLAN[5] = { ...PLAN[4], [set3[1]]:'b2' };
    const set4 = cwFromKefka(T.sets[3].at, APPS[2].outer);
    PLAN[6] = { [set4[0]]:'b1', [set4[1]]:'b2', [set4[2]]:'b3' };
    PLAN[7] = { ...PLAN[6], [set4[0]]:'s1' }; PLAN[8] = { ...PLAN[7], [set4[1]]:'s2' };
    const set5 = cwFromKefka(T.sets[4].at, APPS[3].outer);
    PLAN[9] = { [set5[0]]:'s1', [set5[1]]:'s2' };
    PLAN[10] = { [set5[p.set6]]:'s2' };             // 10本目：9本目の2つの玉のどちらかに新しい線（禁止2が取る）
    const nTime = n => T.noth[n - 1];
    const setOf = n => T.sets.find(s => s.n.includes(n));
    const ccw = n => n === 1;                       // 1本目だけ反時計で待つ
    // コの字式：線を持つ人は、玉から時計回りに90°の方角（1本目だけ反時計回り）で、ボスのすぐ外に立つ
    // 内周の地雷が東西南北に出た回は、その外側（中心から 12.5）に立つ
    const holdSpot0 = (d, n) => at(d * 90 + (ccw(n) ? -90 : 90), arrOfN(n).innerCard ? 6.5 : HOLD_R); // 内周の地雷が東西南北の回は、その内側
    const holdSpot = (d, n) => n === 10 ? s2Spot() : holdSpot0(d, n);
    // ---- 頭上マーカー（ラベル a1〜s2）。味方は じしん のあと少しずつ押す ----
    const label = {};                               // k → 'a1' など
    const taken = { a:[], b:[], s:[] };
    const markRand = g => { const free = [1, 2, 3].slice(0, MARK[g].n).filter(n => !taken[g].includes(n)); return free.length ? pick(free) : null; };
    const giveMark = (k, g) => { const n = markRand(g); if (n == null) return null; taken[g].push(n); label[k] = g + n; return label[k]; };
    const botPress = Object.fromEntries(SLOTS.filter(k => k !== me).map(k => [k, T.quake + .8 + Math.random() * 4.2]));
    const myGroup = LINE_GROUP[p.line[me]];
    // ---- ボス（P3 前半と同じ：ヘイトのタンクを追いかけて、その方を向く。詠唱中は止まる） ----
    // カオスとエクスデスは中央でほぼ重ねる。タンクはケフカ側に立つので、ボスはケフカの方を向く
    const CENTER_OFF = .6;
    const centerPos = sd => at(sd === 'chaos' ? 270 : 90, CENTER_OFF);
    const kefkaDir = () => kefkaAt(now()) ?? p.kefka.max;
    const mkBoss = (q, tank) => ({ ...q, face:{ x:-q.x / 3, z:-q.z / 3 }, tank });
    const CH = mkBoss(centerPos('chaos'), 'ST'), EX = mkBoss(centerPos('exdeath'), 'MT');
    const CAST_CH = [[T.damning[0].cast, T.damning[0].hit], [T.damning[1].cast, T.damning[1].hit], [T.impl.cast, T.impl.hits[1]]];
    const CAST_EX = [[T.bh, T.bhSpawn], ...TH.map(([a, b]) => [a - 5, b]), [T.white.cast, T.white.hit]];
    const casting = (b, t) => (b === CH ? CAST_CH : CAST_EX).some(([a, z]) => t >= a && t < z);
    const battleOn = t => t < T.battleEnd;
    const bosses = t => [
      { id:'chaos', name:'カオス', x:CH.x, z:CH.z, face:CH.face, r:BOSS_TC, color:BOSS_COL.chaos, attackable: tt => !battleOn(tt) || side(me) === 'chaos' },
      { id:'exdeath', name:'エクスデス', x:EX.x, z:EX.z, face:EX.face, r:BOSS_TC, color:BOSS_COL.exdeath, attackable: tt => !battleOn(tt) || side(me) === 'exdeath' },
    ];
    // 詠唱開始の瞬間のカオスの位置・向き（ダミングイーディクト・インプロージョン）
    const frames = { damning:[null, null], impl:null };
    const chaosB = () => bearingOf(CH.face);
    // ---- 安全な場所を探す（地雷・外周・条件） ----
    // 今出ている地雷（立ち位置は、出た瞬間からよける）。当たるのは出てから MINE_GRACE 秒あと
    const curMines = () => { const r = arrAt(now()); return r ? r.mines : []; };
    const nearMine = (q, r = 3) => curMines().some(m => dist(m, q) < r);
    const findSafe = (pref, ok) => {
      for (let r = 0; r <= 16; r += .75) for (let a = 0; a < 360; a += r ? 15 : 360){
        const q = add(pref, at(a, r));
        if (Math.hypot(q.x, q.z) > 18.5 || nearMine(q) || !ok(q)) continue;
        return q;
      }
      return pref;
    };
    // ---- 立ち位置 ----
    const idle = k => {
      const sd = side(k), c = sd === 'chaos' ? CH : EX, out = sd === 'chaos' ? 270 : 90;
      if (k === 'ST' || k === 'MT'){
        // ボスは中央に固定。タンクはケフカ側に立つ（ボスがケフカの方を向く）
        const cp = centerPos(sd);
        return add(cp, at(kefkaDir(), 1.5));
      }
      // ほかの6人はボスの背面（ケフカの反対側）にまとまる
      const others = SLOTS.filter(x => x !== 'ST' && x !== 'MT'), i = others.indexOf(k);
      return at(kefkaDir() + 180 + (i - 2.5) * 22, 3);
    };
    // ビンタ：頭割り（ケフカの右手）＝3時に集合、ロール散開（左手）＝10.5時タンク・9時ヒーラー・7.5時 DPS（ケフカ＝12時）
    const slapSpot = (k, i) => {
      const kb = p.kefka.slap[i];
      if (p.slapRight[i]) return findSafe(at(kb + 90, SLAP_R), () => true);
      const off = k[0] === 'M' || k[0] === 'S' ? -45 : k[0] === 'H' ? -90 : -135;
      return findSafe(at(kb + off, SLAP_R), () => true);
    };
    const slapHalfHit = (q, i) => { const kb = p.kefka.slap[i], d = at(p.slapRight[i] ? kb - 90 : kb + 90, 1); return q.x * d.x + q.z * d.z > 0; };
    // 3連の円：ケフカ側から順に半面の手前・中ほど・奥。半径 SLAP_CR で、3つ合わせると半面全体（安地側へははみ出さない）
    const SLAP_CR = 13;
    const slapCircle = (i, n) => { const kb = p.kefka.slap[i], sd = p.slapRight[i] ? kb - 90 : kb + 90; return add(at(kb, 12 - n * 12), at(sd, 8)); };
    const slapHit = (q, i, n) => slapHalfHit(q, i) && dist(q, slapCircle(i, n)) <= SLAP_CR;
    // ボクチン：ケフカから中心を抜けて反対まで（幅 BOK_HW×2）
    const bokHit = (q, i) => { const kb = p.kefka.bok[i], d = at(kb + 180, 1), o = at(kb, ARENA_R + 2); return segDist(q, o, d, 2 * ARENA_R + 4) <= BOK_HW; };
    const behindChaos = (q, fr) => { const f = at(fr.b, 1); return (q.x - fr.x) * f.x + (q.z - fr.z) * f.z < -1; };
    // インプロージョン：カオスの前後／左右の扇 90°。1発目はヴァーティカルなら前後
    const implHit = (q, n) => {
      const c = frames.impl || { x:CH.x, z:CH.z, b:chaosB() }, rel = norm(bearingOf({ x:q.x - c.x, z:q.z - c.z }) - c.b);
      const fb = Math.min(Math.abs(angDiff(rel, 0)), Math.abs(angDiff(rel, 180))) < 45;
      return (n === 0) === p.vertical ? fb : !fb;
    };
    // 線を持つ人の担当（n 本目）。label → 玉の方角
    const dutyOf = (lab, n) => { const pl = PLAN[n]; if (!pl || !lab) return null; const d = Object.keys(pl).find(d => pl[d] === lab); return d == null ? null : +d; };
    // 今の時刻で、その人が線を持って立つべき n（なければ null）
    const nextDuty = (k, t) => {
      const lab = label[k]; if (!lab) return null;
      for (let n = 1; n <= 10; n++){
        if (t > nTime(n) + .15) continue;
        const d = dutyOf(lab, n); if (d == null) continue;
        // 各セットの最初の線は、直前（FIRST_GO 秒前）まで中央で待ってから取りに行く（早く動くと答えが分かってしまう）
        const st = setOf(n), from = k !== me ? Math.max(st.n[0] === n ? st.at + .6 : nTime(n - 1) + .4, nTime(n) - BOT_GO)
          : st.n[0] === n ? Math.max(st.at + .6, nTime(n) - FIRST_GO) : nTime(n - 1) + .4;
        if (t >= from) return { n, d };
        return null;
      }
      return null;
    };
    // ST がカオスを方位 b へ向ける立ち位置（地雷を避けて、向きのずれは 15° まで）
    const faceSpot = b => findSafe(add(CH, at(b, 1.5)), q => Math.abs(angDiff(bearingOf({ x:q.x - CH.x, z:q.z - CH.z }), b)) <= 15 && dist(q, CH) >= .8 && dist(q, CH) <= BOSS_TC - .3);
    const spot0 = (k, t) => {
      // サンダガ2連：1発目は MT、2発目は ST がエクスデスの一番近く（距離スイッチ）
      for (const [h1, h2] of TH){
        if (t >= h1 - 3 && t < h2 + .3){
          // エクスデスのまわりで地雷のない、中央寄りの場所
          // サンダガは扇（タンク強攻撃）なので、タンクはケフカ側（味方のいない側）で受けて、扇を味方から外へ向ける
          const kd = kefkaDir();
          const near = r0 => { for (let r = r0; r <= r0 + 3; r += .5){ for (let da = 0; da <= 180; da += 15) for (const sg of [1, -1]){ const q = add(EX, at(kd + da * sg, r)); if (!nearMine(q)) return q; } } return add(EX, at(kd, r0)); };
          // 受けるタンクのまわり（円範囲）から離れる。タンクはケフカ側
          const aim = near(1), far = q => dist(q, aim) > BUSTER_R + .8 && dist(q, near(.5)) > BUSTER_R + .8;
          if (k === 'MT') return t < h1 + .3 ? near(1) : findSafe(idle(k), q => dist(q, EX) >= 4 && dist(q, near(.5)) > BUSTER_R + .8);
          if (k === 'ST' && t >= h1 + .3) return near(.5);
          if (k !== 'ST' || t < h1 + .3) return findSafe(idle(k), q => dist(q, EX) >= 3.5 && far(q)); // ST も1発目までは離れておく
        }
      }
      // ダミングイーディクト：全員カオスの背面へ（2回目はボクチンの直線もよける）
      for (let i = 0; i < 2; i++){
        const dm = T.damning[i];
        if (k === 'ST' && i === 1 && t >= Math.max(T.bok[0].tp + .3, nTime(5) + .2) && t < dm.cast) return faceSpot(p.kefka.bok[0]); // カオスをケフカへ向ける（5本目のあと）
        if (t >= dm.cast + .5 && t < dm.hit + .2){
          const fr = frames.damning[i] || { x:CH.x, z:CH.z, b:chaosB() };
          const pref = add(fr, at(fr.b + 180 + (SLOTS.indexOf(k) - 3.5) * 12, 5));
          return findSafe(pref, q => behindChaos(q, fr) && (i === 0 || !bokHit(q, 0)));
        }
      }
      // ボクチン1（ダミングの直後）：直線の横
      if (t >= T.damning[1].hit + .2 && t < T.bok[0].hit + .3) return findSafe(idle(k), q => !bokHit(q, 0));
      // インプロージョン（＋ビンタ3）：カオスはケフカに対して45度。安地は2つともビンタの安地側
      if (k === 'ST' && t >= T.slap[2].tp + .2 && t < T.impl.cast) return faceSpot(p.kefka.slap[2] + 45);
      if (t >= T.impl.cast + .3 && t < T.impl.hits[1] + .2){
        const c = frames.impl || { x:CH.x, z:CH.z, b:chaosB() }, kb = p.kefka.slap[2], right = !p.slapRight[2];
        // 右が安地（頭割り）＝ケフカから時計回り側。1発目の安地 → 2発目の安地
        const first = t < T.impl.hits[0] + .1;
        const fbFirst = !p.vertical;                 // 1発目が左右（ホリゾンタル）なら、1発目の安地は前後
        const useFB = first ? fbFirst : !fbFirst;
        const safeHalf = p.slapRight[2] ? kb + 90 : kb - 90;
        const cands = (useFB ? [c.b, c.b + 180] : [c.b + 90, c.b - 90]).map(norm);
        const b = cands.sort((x, y) => Math.abs(angDiff(x, safeHalf)) - Math.abs(angDiff(y, safeHalf)))[0];
        void right;
        return findSafe(add(c, at(b + (SLOTS.indexOf(k) - 3.5) * 3, IMPL_R)), q => !implHit(q, first ? 0 : 1) && !slapHalfHit(q, 2));
      }
      // びんびんビンタ
      for (let i = 0; i < 3; i++){
        const s = T.slap[i];
        if (t >= s.cast + .3 && t < s.last + .3) return add(slapSpot(k, i), at(SLOTS.indexOf(k) * 45, .6));
      }
      // ボクチン2＋10本目：禁止2は最外周、ほかは直線の横
      if (t >= T.bok[1].cast + .3 && t < T.noth[9] + .3){
        const lab = label[k];
        if (lab === 's2'){ const d10 = +Object.keys(PLAN[10])[0], h = tether[d10]; if (h && h !== k){ const o = orbPos(d10), hq = pos(h); return add(hq, unit(hq, o), Math.min(dist(o, hq) * .5, TAKE_ALONG + 1)); } return s2Spot(); }
        return findSafe(idle(k), q => !bokHit(q, 1) && !inBeam(q, 10, k));
      }
      // 自分の担当ではない線を持っている人は、取られるまでその場で待つ（取りに来る味方は直前に駆け込むので、0.3 秒前まで待つ）
      //   同じセットの中の受け渡し（番が終わった人）と、セットの最初に一番近い人へ付いた線（1人に2本付くこともある）の両方
      const nd = T.noth.findIndex(nt => nt > t) + 1;
      if (nd > 0 && t < nTime(nd) - .3){
        const foreign = Object.keys(tether).find(d => tether[d] === k && PLAN[nd] && PLAN[nd][d] && PLAN[nd][d] !== label[k]);
        const myD = dutyOf(label[k], nd), du0 = nextDuty(k, t), mustTake = du0 && myD != null && tether[myD] && tether[myD] !== k; // 自分の担当の線を、ほかの人が持っている → 待たずに取りに行く
        if (foreign != null && !mustTake){
          const prev = nd > 1 && setOf(nd).n[0] !== nd && dutyOf(label[k], nd - 1) === +foreign;
          return prev && k === me ? holdSpot(+foreign, nd - 1) : { x:pos(k).x, z:pos(k).z };
        }
      }
      // 線を持つ担当
      const du = nextDuty(k, t);
      if (du){
        // 線をまだ持っていなければ、まず玉と今の持ち主の間（線の上）へ入って取る
        const h = tether[du.d];
        if (h && h !== k){ const o = orbPos(du.d), hq = pos(h); return add(hq, unit(hq, o), Math.min(dist(o, hq) * .5, TAKE_ALONG + 1)); } // 持ち主から玉の側へ少し出た所（玉の側は地雷が近い）
        return holdSpot(du.d, du.n);
      }
      return idle(k);
    };
    // 地雷のすぐそばにならないよう、最後に地雷から押し出す
    const spot = (k, t) => {
      let q = spot0(k, t);
      const pushMines = () => { curMines().forEach(m => { const d = dist(q, m), need = MINE_HIT + .7; if (d < need){ const u = d > .01 ? unit(m, q) : unit(m, { x:0, z:0 }); q = add(m, u, need); } }); };
      pushMines();
      // 自分の担当でない線の上に立たない（ほかの人の線を取ってしまう）
      const du = nextDuty(k, t);
      const taking = du && tether[du.d] && tether[du.d] !== k; // 線を取りに行く途中は、ほかの線をよけない（同じ人に2本付いていることがある）
      Object.keys(tether).forEach(d => {
        if (taking || tether[d] === k || (du && du.d === +d)) return;
        const o = orbPos(+d), h = pos(tether[d]), L = dist(o, h), u = unit(o, h), need = TAKE_D + 1;
        if (segDist(q, o, u, L) >= need) return;
        const tt = Math.max(0, Math.min(L, (q.x - o.x) * u.x + (q.z - o.z) * u.z)), c = add(o, u, tt), n = { x:-u.z, z:u.x };
        const sg = (q.x - c.x) * n.x + (q.z - c.z) * n.z >= 0 ? 1 : -1;
        q = add(c, n, sg * need);
      });
      pushMines(); // 線をよけて地雷に寄ったら、もう一度地雷から離す
      return q;
    };
    // 10本目（ボクチン2回目と同時）：禁止2は直線の外の外周で、ビームが中央を通らない所
    let s2Cache = null;
    const s2Spot = () => {
      if (s2Cache) return s2Cache;
      const d = +Object.keys(PLAN[10])[0], o = orbPos(d), cands = [];
      // 10本目の線は出た瞬間に玉に一番近い人へ付くので、禁止2は玉のすぐそば（外周寄り）で待つ
      for (let a = 15; a <= 120; a += 5) for (const sg of [1, -1]) for (const r of [16, 13.5, 11, HOLD_R]){
        const q = at(d * 90 + sg * a, r);
        if (bokHit(q, 1) || arrOfN(10).mines.some(m => dist(m, q) < 3) || dist(q, o) < 4) continue;
        if (segDist({ x:0, z:0 }, o, unit(o, q), 2 * ARENA_R + 4) < 6.5) continue;
        cands.push(q);
      }
      return (s2Cache = cands[0] || holdSpot0(d, 10));
    };
    // n 本目のビーム（玉 → 持っている人の向き）に q が入るか（持ち主 k は除く）
    const inBeam = (q, n, k) => {
      const pl = PLAN[n]; if (!pl) return false;
      return Object.keys(pl).some(d => {
        const o = orbPos(+d), h = n === 10 ? s2Spot() : holdSpot(+d, n);
        return pl[d] !== label[k] && segDist(q, o, unit(o, h), 2 * ARENA_R + 4) <= BEAM_HW + .8;
      });
    };
    // ---- 味方（見えない）と自分 ----
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...idle(k) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);
    // ---- HP（%）とデバフ。自分がヒーラーなら自分の HP は上のバー（HP.hp）と同じ ----
    const mem = Object.fromEntries(SLOTS.map(k => [k, { k, hp:100, shield:0, shUntil:0, dirt:false, mud:false, hits:0, dead:false, petri:false }]));
    const getHp = k => k === me && HP.on ? HP.hp : mem[k].hp;
    const setHp = k => v => { if (k === me && HP.on) HP.hp = v; else mem[k].hp = v; };
    const healTo = (k, v) => setHp(k)(Math.min(100, Math.max(getHp(k), v)));
    const addHp = (k, v) => { if (mem[k].dead) return 0; const b = getHp(k), a = Math.min(100, b + v * (mem[k].mud ? MUD : 1)); setHp(k)(a); return a - b; };
    let earthSrc = null;
    let wiped = false, lastEarth = -99, earthQueue = [];
    const miss = msg => { if (!wiped) hurt(msg); };
    const releaseDirt = (k, why) => { // 混沌の土の解除：1.6秒後に中央の土クリスタルから、本人以外へ全体攻撃
      if (!mem[k].dirt) return;
      mem[k].dirt = false;
      if (why) miss(why);
      earthQueue.push({ t:now() + 1.6, src:k });
    };
    const damage = (k, v, name) => {
      const m = mem[k]; if (m.dead) return;
      const ab = Math.min(m.shield, v); m.shield -= ab; v -= ab;
      const after = getHp(k) - v;
      if (k === me && v > 0) popup(Math.round(v * 2050).toLocaleString('en-US'), 'hurtnum self', name, S.player);
      if (after <= 0){
        if (m.dirt){ setHp(k)(1); releaseDirt(k, `${k === me ? '自分' : k}の混沌の土が${name}で解除された（HP が足りない）`); return; }
        setHp(k)(0); m.dead = true;
        miss(k === me ? `${name}で HP が0になった` : `${k}（味方）が${name}で倒れた`);
        return;
      }
      setHp(k)(after);
    };
    const earthAoe = src => {
      if (now() - lastEarth < EARTH_DOWN){ miss('土属性耐性低下［強］が残っているうちに、次のじしん（土の解除）を受けた（解除の間隔が短すぎる）'); wiped = true; }
      lastEarth = now(); earthSrc = src;
      SLOTS.filter(k => k !== src).forEach(k => damage(k, DMG.earth, 'じしん'));
      efx.push({ k:'earth', t:now() }); sfx.boom(); fxShake(3, .25);
      fxAdd('ring', 0, 0, { r:20, cols:FXC.rock, dur:.6 }); fxAdd('burst', 0, 0, { r:3.5, cols:FXC.rock, dur:.5 });
      fxParts(26, 0, 0, { cols:FXC.rock, speed:16, up:9, life:.8, size:3, spread:3 });
      const sq = pos(src); if (sq) fxAdd('pillar', sq.x, sq.z, { r:1.6, cols:FXC.rock, dur:.6, h:60 });
    };
    // ---- 線（tether）：玉の方角 → 持っている人 ----
    const tether = {};
    const extraLog = [];
    let curSet = -1;
    const nearestTo = (q, list = SLOTS) => [...list].sort((a, b) => dist(pos(a), q) - dist(pos(b), q))[0];
    const spawnSet = si => {
      curSet = si;
      // 前の線は消えている。新しい線は、その玉に一番近い人に張られる（担当の人が取りに行く）
      const n0 = T.sets[si].n[0];
      Object.keys(tether).forEach(d => delete tether[d]);
      // 担当が見えない味方ならその味方に、自分なら一番近い味方に付く（自分は取りに行く。その味方は取られるまで待つ）
      Object.keys(PLAN[n0]).forEach(d => { const owner = Object.keys(label).find(k => label[k] === PLAN[n0][d]);
        if (T.sets[si].direct){ tether[d] = nearestTo(orbPos(+d), SLOTS.filter(k => !mem[k].dead)); efx.push({ k:'tetherOn', t:now(), d:+d }); return; } // 10本目：出た瞬間にその玉に一番近い人へ（タイムライン 902.7）
        tether[d] = owner && owner !== me && !mem[owner].dead ? owner : nearestTo(orbPos(+d), SLOTS.filter(k => k !== me && !mem[k].dead && !Object.values(tether).includes(k))); if (!tether[d]){ delete tether[d]; return; } efx.push({ k:'tetherOn', t:now(), d:+d }); const q = orbPos(+d); fxAdd('swirl', q.x, q.z, { r:3.5, cols:FXC.void, dur:.6, inward:true }); });
      sfx.ok();
    };
    // ---- エフェクト（このギミック専用・仮の形） ----
    const efx = [];
    const fx3 = makeP3Fx(); // P3 共通のエフェクト（サンダガの雷）
    let quakeT = -9;
    const holdOf = d => tether[d] ? pos(tether[d]) : null;
    const fireLaser = n => {
      const pl = PLAN[n], hitBy = {};
      Object.keys(pl).forEach(d => {
        const h = tether[d]; if (!h) return;
        const o = orbPos(+d), hp = pos(h), u = unit(o, hp);
        SLOTS.forEach(k => { if (k === h || segDist(pos(k), o, u, 2 * ARENA_R + 4) <= BEAM_HW) (hitBy[k] ||= []).push(+d); });
        efx.push({ k:'beam', t:now(), o, u });
        fxAdd('burst', hp.x, hp.z, { r:2.2, cols:FXC.thunder, dur:.45 }); fxAdd('star', hp.x, hp.z, { cols:FXC.thunder, L:16, dur:.3 });
        fxParts(10, hp.x, hp.z, { cols:FXC.void, speed:7, up:7, life:.6, size:2 }); fxAdd('implode', o.x, o.z, { r:3, cols:FXC.void, dur:.35 });
      });
      // 自分の判定
      const myD = dutyOf(label[me], n), mine = hitBy[me] || [];
      if (myD != null && !mine.length) miss(`${n}本目の線を取れていない（無の波動を受けなかった）`);
      else if (myD != null && !mine.includes(myD)) miss(`${n}本目：違う玉の線を持っていた（ケフカから時計回りの順）`);
      else if (myD == null && mine.length) miss(`${n}本目の無の波動に当たった`);
      if (myD != null && mine.length && Object.keys(hitBy).some(k => k !== me && dutyOf(label[k], n) == null && hitBy[k].includes(myD))) miss(`${n}本目：無の波動に味方を巻き込んだ（ビームの向き）`);
      Object.keys(hitBy).forEach(k => {
        if (dutyOf(label[k], n) == null || hitBy[k].length > 1) extraLog.push({ n, k, lab:label[k], d:hitBy[k], at:{ x:+pos(k).x.toFixed(1), z:+pos(k).z.toFixed(1) }, teth:{ ...tether }, hp:Object.fromEntries(Object.keys(tether).map(d => [d, [+pos(tether[d]).x.toFixed(1), +pos(tether[d]).z.toFixed(1)]])), t:+now().toFixed(2) }); // テスト用：担当でない人が当たった
        const m = mem[k]; m.hits += hitBy[k].length;
        if (m.hits >= 4){ if (k === me) miss('無の波動を4回受けた'); m.dead = true; setHp(k)(0); return; }
        if (m.hits === 3){ setHp(k)(1); releaseDirt(k, null); const q = pos(k); fxAdd('burst', q.x, q.z, { r:2.6, cols:FXC.rock, dur:.6 }); return; } // 3回目：即死級 → 土で耐えて解除
        damage(k, DMG.noth * hitBy[k].length, '無の波動');
      });
      sfx.big(); fxShake(2, .2);
      // その出現の最後の1本を撃ったら線は消える（9本目のあとは、10本目の禁止2の線だけ残る）
      const st = setOf(n);
      if (st.n[st.n.length - 1] === n) Object.keys(tether).forEach(d => { efx.push({ k:'tetherOff', t:now(), o:orbPos(+d), h:{ ...pos(tether[d]) } }); delete tether[d]; });
    };
    // ---- イベント ----
    const events: [number, () => void][] = [
      ...kefkaTimes.slice(1).map(([tt, bb], i) => [tt, () => { const o = at(kefkaTimes[i][1], ARENA_R + 1.5), q = at(bb, ARENA_R + 1.5);
        fxAdd('burst', o.x, o.z, { r:7, cols:['#ffffff', '#ffe8f8', '#d8a0ff', '#7a4aa8'], dur:.45 }); fxParts(16, o.x, o.z, { cols:['#ffffff', '#ffd0f0', '#c08aff'], speed:9, up:8, life:.6, size:2, spread:6 });
        efx.push({ k:'warpIn', t:tt + WARP_OUT, q }); }] as [number, () => void]),
      [T.max, () => { sfx.big(); fxShake(4, .4); fxFlash('#fff0c0', .45, .3); const q = at(p.kefka.max, ARENA_R + 2); fxAdd('burst', q.x, q.z, { r:8, cols:FXC.flare, dur:.8 }); fxAdd('ring', q.x, q.z, { r:16, cols:FXC.orange, dur:.7 }); fxParts(30, q.x, q.z, { cols:FXC.flare, speed:12, up:10, life:.9, size:3, spread:6 }); }],
      [T.quake, () => {
        quakeT = now(); sfx.big(); fxShake(6, .8); fxFlash('#c8a060', .45, .35);
        // 中央に土のクリスタルが落ちて、床が割れて岩が飛ぶ
        fxAdd('pillar', 0, 0, { r:3, cols:FXC.rock, dur:.7, h:120 }); fxAdd('ring', 0, 0, { r:22, cols:FXC.rock, dur:.8 }); fxAdd('ring', 0, 0, { r:12, cols:FXC.rock, dur:.5 });
        for (let i = 0; i < 8; i++){ const q = at(i * 45 + 22.5, 9 + (i % 2) * 5); fxAdd('burst', q.x, q.z, { r:2.2, cols:FXC.rock, dur:.6 }); fxParts(6, q.x, q.z, { cols:FXC.rock, speed:6, up:12, life:.9, size:3 }); }
        efx.push({ k:'quake', t:now() });
        SLOTS.forEach(k => { setHp(k)(1); mem[k].shield = 0; mem[k].dirt = true; mem[k].mud = p.mud.includes(k); });
      }],
      [T.mudEnd, () => { SLOTS.forEach(k => { if (mem[k].mud){ mem[k].mud = false; miss(`${k === me ? '自分' : k}の混沌の泥土を時間内に解除できなかった`); } }); }],
      [T.markEnd, () => { if (!label[me]){ miss(`頭上マーカー（${MARK[myGroup].name}）を付けなかった`); giveMark(me, myGroup); } }],
      // ブラックホールの出現：紫の光、玉と地雷の場所に渦。セットの終わり：はじけて消える
      ...APPS.map(a => [a.at, () => { sfx.big(); fxFlash('#8a4aff', .3, .25); a.outer.forEach(d => { const q = orbPos(d); fxAdd('swirl', q.x, q.z, { r:4, cols:FXC.void, dur:.9, inward:true }); }); a.arrs[0].mines.forEach(m => fxAdd('swirl', m.x, m.z, { r:2.5, cols:FXC.void, dur:.9, inward:true })); }] as [number, () => void]),
      ...APPS.map(a => [a.end + VANISH_DELAY + VANISH_DUR - .05, () => { [...a.outer.map(orbPos), ...a.arrs[0].mines].forEach(q => { fxAdd('burst', q.x, q.z, { r:2, cols:['#ffffff', '#8ab0ff', '#5a2aa8', '#1a0a2a'], dur:.4 }); fxParts(4, q.x, q.z, { cols:['#c8e0ff', '#8ab0ff', '#5a6aff'], speed:5, up:5, life:.5 }); }); }] as [number, () => void]),
      ...T.sets.map((s, i) => [s.at, () => spawnSet(i)] as [number, () => void]),
      ...T.noth.map((nt, i) => [nt, () => fireLaser(i + 1)] as [number, () => void]),
      // びんびんビンタ：手を上げた側の半面に3連 → 中央の小円＋頭割り扇 or ロール扇
      ...T.slap.flatMap((s, i) => [
        ...s.hits.map((h, hn) => [h, () => {
          if (slapHit(S.player, i, hn)) miss('びんびんビンタ（半面）に当たった');
          efx.push({ k:'slap', t:now(), i, n:hn }); sfx.boom(); fxShake(3, .2);
          { const c = slapCircle(i, hn); fxAdd('ring', c.x, c.z, { r:13, cols:['#ffffff', '#ffb0c0', '#ff4a6a', '#a81a3a'], dur:.45 }); fxParts(14, c.x, c.z, { cols:FXC.rock, speed:10, up:8, life:.7, size:3, spread:6 }); }
        }] as [number, () => void]),
        [s.last, () => {
          if (Math.hypot(S.player.x, S.player.z) < MID_R) miss('びんびんビンタ（中央の円）に当たった');
          const sp = slapSpot(me, i);
          if (dist(S.player, sp) > STACK_OK) miss(p.slapRight[i] ? '頭割り（重衝撃）に入らなかった' : 'ロールの扇（衝撃波）の位置にいなかった');
          SLOTS.forEach(k => damage(k, p.slapRight[i] ? DMG.stack : DMG.role, p.slapRight[i] ? '重衝撃' : '衝撃波'));
          efx.push({ k:'slapEnd', t:now(), i }); sfx.big(); fxShake(3, .25);
          fxAdd('burst', 0, 0, { r:MID_R, cols:['#ffffff', '#ffb0c0', '#ff4a6a', '#a81a3a'], dur:.5 });
          if (p.slapRight[i]){ const q = slapSpot(me, i); FXK.stack(q.x, q.z, 3, FXC.magenta); }
          else SLOTS.forEach(k => { if (k === 'MT' || k === 'H1' || k === 'D1'){ const q = slapSpot(k, i); fxAdd('burst', q.x, q.z, { r:2.4, cols:FXC.orange, dur:.45 }); } });
        }] as [number, () => void],
      ]),
      ...TH.flatMap(hs => hs.map((h, j) => [h, () => {
        const tgt = nearestTo(EX), want = j === 0 ? 'MT' : 'ST';
        if (tgt === me && me !== want) miss(me === 'MT' || me === 'ST' ? `サンダガ${j + 1}発目は${want}が受ける（距離スイッチ）` : 'サンダガ（強攻撃）を受けた（エクスデスに近すぎた）');
        if (me === want && tgt !== me) miss(`サンダガ${j + 1}発目を受けなかった（エクスデスの一番近くにいない）`);
        if (tgt !== me && inBusterAoe(S.player, pos(tgt))) miss('サンダガ（タンク強攻撃の範囲）に巻き込まれた');
        fx3.add('cleave', { q:{ ...pos(tgt) }, r:BUSTER_R });
        damage(tgt, DMG.buster, 'サンダガ');
        fx3.add('bolt', { ...pos(tgt) }); efx.push({ k:'boltRing', t:now(), q:{ ...pos(tgt) } }); sfx.big(); fxShake(2, .2); // 真上から雷（P3 前半と同じエフェクト）
      }] as [number, () => void])),
      ...T.damning.flatMap((d, i) => [
        [d.cast, () => { frames.damning[i] = { x:CH.x, z:CH.z, b:chaosB() }; }] as [number, () => void],
        [d.hit, () => {
          if (!behindChaos(S.player, frames.damning[i])) miss('ダミングイーディクト（カオスの正面）に当たった');
          efx.push({ k:'damning', t:now(), fr:frames.damning[i] }); sfx.boom(); fxShake(4, .3); fxFlash('#ffb060', .3, .2);
          { const fr = frames.damning[i]; for (let j = -2; j <= 2; j++){ const q = add(fr, at(fr.b + j * 35, 10)); fxParts(8, q.x, q.z, { cols:FXC.fire, speed:8, up:8, life:.7, size:3, spread:4 }); } }
        }] as [number, () => void],
      ]),
      ...T.bok.map((b, i) => [b.hit, () => {
        if (bokHit(S.player, i)) miss('ありのままのボクチン（直線）に当たった');
        efx.push({ k:'bok', t:now(), i }); sfx.big(); fxShake(7, .6); fxFlash('#ffe8a0', .35, .25);
        { const kb = p.kefka.bok[i]; for (let j = 0; j < 9; j++){ const q = add(at(kb, 16), at(kb + 180, 1), j * 4); fxParts(5, q.x, q.z, { cols:FXC.rock, speed:9, up:10, life:.9, size:3, spread:BOK_HW * 2 }); } }
      }] as [number, () => void]),
      [T.impl.cast, () => { frames.impl = { x:CH.x, z:CH.z, b:chaosB() }; }],
      ...T.impl.hits.map((h, n) => [h, () => {
        if (n === 0 && me === 'ST' && Math.abs(angDiff(frames.impl.b, p.kefka.slap[2] + 45)) > 25) miss('カオスをケフカに対して45度に向けられていない');
        if (implHit(S.player, n)) miss(`${p.vertical ? 'ヴァーティカル' : 'ホリゾンタル'}インプロージョンに当たった`);
        { const c = frames.impl, fb = (n === 0) === p.vertical; fx3.add('fan', { x:c.x, z:c.z, centers:fb ? [c.b, c.b + 180] : [c.b + 90, c.b - 90] }); } sfx.boom(); fxShake(3, .25);
      }] as [number, () => void]),
      [T.white.hit, () => {
        SLOTS.forEach(k => { if (!mem[k].dead && getHp(k) < 99){ mem[k].petri = true; if (isHealer || k === me) miss(`ホワイトホール：${k === me ? '自分' : k}の HP が満タンでなかった（石化）`); } });
        efx.push({ k:'white', t:now() }); sfx.big(); fxFlash('#ffffff', .6, .35); fxShake(3, .3);
        fxAdd('swirl', EX.x, EX.z, { r:12, cols:['#ffffff', '#e8f0ff', '#c8d8ff'], dur:.9 }); fxAdd('ring', EX.x, EX.z, { r:22, cols:['#ffffff', '#e8f0ff', '#a8b8d8'], dur:.8 });
        SLOTS.forEach(k => { if (mem[k].petri){ const q = pos(k); fxAdd('burst', q.x, q.z, { r:1.8, cols:['#ffffff', '#c8c8c8', '#888888', '#585858'], dur:.8 }); } });
      }],
    ];
    events.sort((a, b) => a[0] - b[0]); // 1フレームで2つ以上の時刻を越えても、早い順に起こす（線が出る前に前の線が消える順番を守る）
    const DEADLINES = [...T.noth, ...T.sets.filter(x => x.direct).map(x => x.at), ...T.slap.flatMap(x => [...x.hits, x.last]), ...T.damning.flatMap(x => [x.cast, x.hit]), ...T.bok.map(x => x.hit),
      T.impl.cast, ...T.impl.hits, ...TH.flat(), T.white.hit, T.quake, T.markEnd].sort((a, b) => a - b);
    const fired: boolean[] = [];
    // ---- 回復（ヒーラーのボタン。action.ts の onBuff・hpTick から呼ばれる） ----
    let sel = me;
    const party = {
      get sel(){ return sel; },
      select(k){ if (SLOTS.includes(k)){ sel = k; sfx.ok?.(); } },
      heal(id, ns){
        const b = BUFFS[id], mult = ns ? 1.2 : 1;
        const targets = b.single ? [sel] : SLOTS;
        targets.forEach(k => {
          if (b.heal){ const got = addHp(k, b.heal * mult); if (k === me && got > 0) popup(Math.round(got * 2050).toLocaleString('en-US'), 'healnum self', b.name, S.player); }
          if (b.shield){ mem[k].shield = Math.max(mem[k].shield, b.shield); mem[k].shUntil = now() + 15; }
          if (id === 'helios' && ns){ mem[k].shield = Math.max(mem[k].shield, 25); mem[k].shUntil = now() + 15; }
        });
        if (b.single && sel !== me) popup(`${b.name} → ${sel}`, 'crit');
      },
      regen(v){ SLOTS.forEach(k => addHp(k, v)); },
      members: t => SLOTS.map(k => {
        const m = mem[k], tags = [];
        if (label[k]) tags.push({ c:'k', t:MARK[label[k][0]].name.slice(0, 1) + label[k][1] });
        if (m.dirt) tags.push({ c:'d', t:'土' + ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][p.line[k]] });
        if (m.mud) tags.push({ c:'m', t:'泥' });
        if (t - lastEarth < EARTH_DOWN && earthSrc !== k) tags.push({ c:'e', t:'耐' });
        if (m.hits && m.hits < 3) tags.push({ c:'v', t:'無' + m.hits });
        if (m.petri) tags.push({ c:'x', t:'石' });
        return { k, name:JOBS[JOB_OF[k]].name, hp:getHp(k), shield:m.shield, me:k === me, dead:m.dead, tags };
      }),
    };
    // 泥土の解除（HP 満タン）。ヒーラー → DPS の順。自分がヒーラーでないときは、見えないヒーラーが決まった時刻に全快させる
    let mudDone = [];
    const mudCheck = t => {
      if (t < T.quake || t >= T.mudEnd) return;
      p.mud.forEach((k, i) => {
        if (!mem[k].mud) return;
        if (!isHealer && t >= T.mudAuto[i]) healTo(k, 100);
        if (getHp(k) >= 99.5){
          mem[k].mud = false;
          if (isHealer && k[0] === 'D' && !mudDone.length) miss('泥土：ヒーラーより先に DPS を全快にした');
          mudDone.push(k); earthAoe(k);
        }
      });
    };
    const sec = u => Math.max(0, Math.ceil(u - now()));
    const tm = u => { const s = sec(u); return s >= 60 ? '1m' : String(s); };
    // ---- 描画の部品 ----
    const kefkaImg = drawFace();
    // 頭上マーカー：攻撃＝金の六角形、バインド＝ピンクの鎖、禁止＝赤い ⊘（数字つき）
    function drawMark(lab, X, Y, k){
      // 攻撃＝金の六角形、バインド＝ピンクの鎖、禁止＝赤い ⊘。数字は2倍の大きさで中に白く（黒いふち）
      const g = lab[0], n = lab[1], r = Math.round(9 * k), gk = k >= 1 ? 2 : 1;
      const num = (x, y) => { [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => numGlyph(n, x + dx, y + dy, '#101018', gk)); numGlyph(n, x, y, '#ffffff', gk); };
      if (g === 'a'){
        const hex = rr => { ctx.beginPath(); for (let i = 0; i < 6; i++){ const an = Math.PI / 6 + i * Math.PI / 3; const x = X + .5 + Math.cos(an) * rr, y = Y + .5 + Math.sin(an) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
        ctx.fillStyle = '#101018'; hex(r + 2); ctx.fill(); ctx.fillStyle = '#ffe070'; hex(r + 1); ctx.fill(); ctx.fillStyle = '#c8901a'; hex(r - 1); ctx.fill(); ctx.fillStyle = '#4a3010'; hex(r - 2.5); ctx.fill();
        num(X + 1, Y + 1);
      } else if (g === 'b'){
        const o = Math.round(r * .45), rr = Math.round(r * .62);
        disc(X - o, Y, rr + 2, '#101018'); disc(X + o, Y, rr + 2, '#101018');
        for (let w = 0; w < 2; w++){ ring(X - o, Y, rr - w, '#ff7ab8'); ring(X + o, Y, rr - w, '#ffb0d8'); }
        disc(X, Y + 1, Math.round(r * .55), '#101018'); num(X + 1, Y + 1);
      } else {
        disc(X, Y, r + 2, '#101018'); disc(X, Y, r - 1, '#3a0a10');
        for (let w = 0; w < 2; w++) ring(X, Y, r - w, '#ff4a5a');
        for (let w = -1; w <= 1; w++) line(X - r + 3 + w, Y + r - 3, X + r - 3 + w, Y - r + 3, '#ff4a5a');
        rect(X + r - 2, Y + r - 5, 9, 12, '#101018'); num(X + r + 3, Y + r + 1);
      }
    }
    // ブラックホール：黒い球、青い渦のふち（回る）、紫のにじみ。線を出している外周の玉は強く光る
    function drawHole(q, rad, on, ph){
      const X = px(q.x), Z = px(q.z), R = Math.max(3, Math.round(rad * PPY));
      alpha(on ? .45 : .22, () => disc(X, Z, R + 3, on ? '#b06aff' : '#5a3a9a'));
      disc(X, Z, R + 1, '#1a2a6a'); disc(X, Z, R, '#03030a');
      for (let i = 0; i < 3; i++){
        const a0 = ph * 2.2 + i * 2.1;
        for (let j = 0; j < 7; j++){ const an = a0 + j * .16; ctx.fillStyle = j < 3 ? '#6a8aff' : '#2a4ac8'; ctx.fillRect(Math.round(X + Math.cos(an) * (R - .5)), Math.round(Z + Math.sin(an) * (R - .5)), 1, 1); }
      }
      rect(X - Math.round(R / 3), Z - Math.round(R / 2), 1, 1, '#4a5a9a');
    }
    // 無の波動：玉から持ち主を抜けて外まで、青紫の稲妻のビーム
    function drawLaser(e, a){
      const f = Math.max(0, 1 - a / .6), L = 2 * ARENA_R + 4, n = { x:-e.u.z, z:e.u.x };
      alpha(.35 * f, () => { ctx.fillStyle = '#7a4aff'; ctx.beginPath(); [[1, 1], [1, -1], [0, -1], [0, 1]].forEach(([s1, s2], j) => { const x = e.o.x + e.u.x * L * s1 + n.x * BEAM_HW * s2, z = e.o.z + e.u.z * L * s1 + n.z * BEAM_HW * s2; j ? ctx.lineTo(px(x), px(z)) : ctx.moveTo(px(x), px(z)); }); ctx.fill(); });
      alpha(f, () => {
        for (let k = 0; k < 3; k++){
          let lx = px(e.o.x), lz = px(e.o.z);
          for (let i = 1; i <= 16; i++){
            const d = L * i / 16, j = Math.sin(i * 7.3 + k * 2.1 + a * 40) * BEAM_HW * .8 * PPY;
            const x = px(e.o.x + e.u.x * d) + n.x * j, z = px(e.o.z + e.u.z * d) + n.z * j;
            line(lx, lz, x, z, k ? '#8ab0ff' : '#ffffff'); lx = x; lz = z;
          }
        }
      });
    }
    // ケフカを、外周の位置を中心に k 倍・a の濃さで描く（ワープの出入り）
    function withScale(kb, k, a, fn){
      const q = at(kb, ARENA_R + 1.5), X = px(q.x), Z = px(q.z);
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.translate(X, Z); ctx.scale(Math.max(.05, k), Math.max(.05, k)); ctx.translate(-X, -Z); fn(); ctx.restore();
    }
    // 巨大ケフカ
    function drawKefka(t, kb){
      // 案B：顔（OP の絵を1.5倍）＋羽飾り（左に青白い羽、右に赤・緑・黄の羽）＋首のひだえり＋両肩のそで（左は紫に赤い水玉、右は赤）
      // 絵はどの方角でも上向き。座標は顔の中心からのドット
      const head = at(kb, ARENA_R + 1.5), HX = px(head.x), HZ = px(head.z); // 画面の端で切れすぎないよう、少しフィールド寄り（外周の玉や地雷はケフカより手前に描く）
      const W = kefkaImg.width * 1.5, H = kefkaImg.height * 1.5;
      const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(HX + x, HZ + y) : ctx.moveTo(HX + x, HZ + y)); ctx.closePath(); ctx.fill(); };
      const feather = (x0, y0, ang, len, w, col, spine) => {
        const fw = [], bk = [];
        for (let i = 0; i <= 8; i++){ const u = i / 8, a = ang + u * .35, x = x0 + Math.cos(a) * len * u, y = y0 + Math.sin(a) * len * u, ww = w * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * .5); fw.push([x + Math.sin(a) * ww, y - Math.cos(a) * ww]); bk.unshift([x - Math.sin(a) * ww, y + Math.cos(a) * ww]); }
        poly([...fw, ...bk], col);
        ctx.strokeStyle = spine; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(HX + x0, HZ + y0);
        for (let i = 1; i <= 8; i++){ const u = i / 8, a = ang + u * .35; ctx.lineTo(HX + x0 + Math.cos(a) * len * u, HZ + y0 + Math.sin(a) * len * u); }
        ctx.stroke();
      };
      const sleeve = (cx, cy, base, dots) => {
        ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.ellipse(HX + cx, HZ + cy, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(HX + cx, HZ + cy, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
        if (dots) [[-5, -2], [0, -4], [4, 0], [-2, 3], [6, -3]].forEach(([dx, dy]) => rect(HX + cx + dx, HZ + cy + dy, 2, 2, '#ff4a6a'));
        else rect(HX + cx - 6, HZ + cy - 4, 8, 2, '#e85a4a');
      };
      [[-2.2, 30, '#6a8ae0'], [-2.0, 34, '#c8d8ff'], [-1.8, 32, '#9ab8f8'], [-1.6, 28, '#e8f0ff'], [-1.4, 24, '#7a9ae8']].forEach(([a, l, c]) => feather(-5, -26, a, l, 4, c, '#4a5ab0'));
      [[-1.0, 26, '#d8283a'], [-.8, 28, '#f0c030'], [-.6, 26, '#3a9a5a'], [-.4, 22, '#d8283a']].forEach(([a, l, c]) => feather(7, -24, a, l, 3.5, c, '#101018'));
      sleeve(-25, 30, '#5a3aa8', true); sleeve(25, 30, '#c8283a', false);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(kefkaImg, Math.round(HX - W / 2), Math.round(HZ - H / 2), W, H);
      // ひだえり
      for (let i = 0; i <= 14; i++){ const a = Math.PI * (i / 14), x = -Math.cos(a) * 22, y = 26 + Math.sin(a) * 7; poly([[0, 23], [x - 2.5, y], [x + 2.5, y + 1]], ['#d8283a', '#f0c030', '#3a9a5a'][i % 3]); }
      ctx.strokeStyle = '#101018'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(HX, HZ + 27, 23, 8, 0, 0, Math.PI); ctx.stroke();
      // 手：ふだんは両わき。ビンタの詠唱中は叩く側の手だけを、フィールドの縁の内側に大きく振りかぶる（赤く光って揺れる）
      // 反対の手は体の後ろに隠す。叩くたびに、その半面へケフカ側から順に振り下ろす
      let slap = null;
      T.slap.forEach((s, i) => { if (t >= s.cast && t < s.last + .3) slap = { s, i }; });
      [-90, 90].forEach(sd => {
        if (!slap){ const q = add(at(kb, ARENA_R + .5), at(kb + sd, 9)); drawGlove(px(q.x), px(q.z), 1.4); return; }
        const hitSide = p.slapRight[slap.i] ? -90 : 90;
        if (sd !== hitSide) return;
        const hs = slap.s.hits, hit = hs.findIndex(h => t >= h - .15 && t < h + .25);
        if (hit >= 0){ const q = slapCircle(slap.i, hit); drawGlove(px(q.x), px(q.z), 2.2, true); return; }
        if (t < hs[0]){
          const bob = Math.sin(t * 9) * .6, q = add(at(kb, ARENA_R - 2.5 + bob), at(kb + sd, 9));
          alpha(.35 + .25 * Math.sin(t * 9), () => disc(px(q.x), px(q.z), Math.round(4 * PPY), '#ff3a5a'));
          drawGlove(px(q.x), px(q.z), 2.0, true);
        }
      });
    }
    function drawGlove(X, Z, k, hot = false){
      const r = Math.round(6 * k), edge = hot ? '#c8102a' : '#101018';
      disc(X, Z, r + 1, edge); disc(X, Z, r, '#fffaf2');
      for (let i = -1; i <= 1; i++){ const fx = X + i * Math.round(4 * k), fz = Z - r; disc(fx, fz, Math.round(2 * k) + 1, edge); disc(fx, fz, Math.round(2 * k), '#fffaf2'); }
      rect(X - r + 2, Z + r - 2, 2 * r - 3, 2, '#c8c0d8');
    }
    // ありのままのボクチン：ケフカの体が直線に沿って倒れ込む（しま模様の帯が伸びる → 土ぼこり）
    function drawBodyPress(kb, a){
      const o = at(kb, ARENA_R + 3), d = at(kb + 180, 1), n = { x:-d.z, z:d.x }, L = Math.min(1, a / .25) * (2 * ARENA_R + 4);
      const f = a < .8 ? 1 : Math.max(0, 1 - (a - .8) / .4);
      alpha(.85 * f, () => {
        for (let s = 0; s < L; s += .5){
          const c = add(o, d, s), stripe = ((s / 1.5) | 0) % 2;
          for (let w = -BOK_HW; w <= BOK_HW; w += .5){ const q = add(c, n, w); ctx.fillStyle = Math.abs(w) > BOK_HW - .6 ? '#101018' : stripe ? '#d8283a' : '#f0c030'; ctx.fillRect(px(q.x), px(q.z), Math.ceil(PPY / 2) + 1, Math.ceil(PPY / 2) + 1); }
        }
      });
      if (a > .25) alpha(.5 * f, () => { for (let i = 0; i < 14; i++){ const s = (i / 14) * (2 * ARENA_R + 4), sg = i % 2 ? 1 : -1; const q = add(add(o, d, s), n, sg * (BOK_HW + 1 + (a - .25) * 6)); disc(px(q.x), px(q.z), 2, '#c8b8a0'); } });
    }
    return {
      macroBox:true, // 左下に PT チャット（縦長・細め）
      end:T.end, t0:0,
      intro:`あなたは ${me}（${side(me) === 'chaos' ? 'カオス' : 'エクスデス'}側）`,
      casts:[
        { name:'じしん', start:0, len:T.quake },
        { name:'びんびんビンタ', start:T.slap[0].cast, len:T.slap[0].end - T.slap[0].cast },
        { name:'ブラックホール', start:T.slap[0].end, len:T.bhSpawn - T.slap[0].end },
        ...TH.filter(h => h[0] < T.damning[0].cast).map(h => ({ name:'サンダガ', start:h[0] - 5, len:5 })),
        { name:'ダミングイーディクト', start:T.damning[0].cast, len:T.damning[0].hit - T.damning[0].cast },
        { name:'びんびんビンタ', start:T.damning[0].hit, len:T.slap[1].end - T.damning[0].hit },
        { name:'ダミングイーディクト', start:T.damning[1].cast, len:T.damning[1].hit - T.damning[1].cast },
        { name:'ありのままのボクチン', start:T.damning[1].hit, len:T.bok[0].hit - T.damning[1].hit },
        { name:'サンダガ', start:T.thunder[1][0] - 5, len:5 },
        { name:p.vertical ? 'ヴァーティカルインプロージョン' : 'ホリゾンタルインプロージョン', start:T.impl.cast, len:T.white.hit - T.impl.cast },
        { name:'びんびんビンタ', start:T.white.hit, len:T.slap[2].end - T.white.hit },
        { name:'ありのままのボクチン', start:T.bok[1].cast, len:T.bok[1].end - T.bok[1].cast },
      ],
      progress: t => t < T.quake ? 'じしん' : t < T.mudEnd ? '泥土' : t < T.noth[1] + 1 ? 'ブラホ1' : t < T.noth[4] + 1 ? 'ブラホ2' : t < T.noth[7] + 1 ? 'ブラホ3' : 'ブラホ4',
      bosses,
      target0: side(me),
      buttons:{ early:'ターゲット切替', late:'攻撃', stop:'バインド', move:'禁止' },
      say(kind){
        if (kind === 'early'){ switchTarget(); return; }
        const g = { late:'a', stop:'b', move:'s' }[kind];
        if (!g || S.phase !== 'run' || now() < T.quake || label[me]) return;
        if (g !== myGroup){ miss(`マーカーが違う（${['', 'ファースト', 'セカンド', 'サード'][p.line[me]]}ターゲットは「${MARK[myGroup].name}」）`); return; }
        const lab = giveMark(me, g);
        if (lab){ A.actAt = S.t; sfx.buff(); popup(`${MARK[g].name}${lab[1]}`, 'crit'); }
      },
      fieldMarker:'nw',
      party,
      mySpot: t => spot(me, t),
      debug:{ p, T, PLAN, label, tether, mem, extraLog, pos, spot, s2Spot, inBeam, CH, EX, bots, kefkaAt, holdSpot, orbPos, frames, implHit, slapSpot, bokHit, behindChaos, dutyOf, nextDuty },
      status(t){
        const s = [];
        if (battleOn(t)) s.push({ at:0, icon:side(me) === 'chaos' ? 'heroA' : 'heroB', glyph:side(me) === 'chaos' ? 'α' : 'β', color:side(me) === 'chaos' ? '#e8283a' : '#d8a82a', name:side(me) === 'chaos' ? '決戦α［被］' : '決戦β［被］', sec:tm(T.battleEnd) });
        const m = mem[me];
        if (t >= T.quake){
          if (m.dirt) s.push({ at:T.quake, icon:'tgt' + p.line[me], glyph:['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][p.line[me]], color:'#5a7ae0', name:`${['', 'ファースト', 'セカンド', 'サード'][p.line[me]]}ターゲット`, sec:'' });
          if (m.dirt) s.push({ at:T.quake, icon:'earth', glyph:['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][p.line[me]], color:'#a87a3a', name:`混沌の土（${['', 'ファースト', 'セカンド', 'サード'][p.line[me]]}ターゲット）`, sec:'' });
          if (m.mud) s.push({ at:T.quake, icon:'mud', glyph:'泥', color:'#7a4a1a', name:'混沌の泥土（HP が全回復すると解除）', sec:tm(T.mudEnd) });
          if (m.hits && m.hits < 3) s.push({ at:T.quake, icon:m.hits === 1 ? 'void1' : 'void2', glyph:'無', color:'#5a3a9a', name:m.hits === 1 ? '無の侵食' : '無の蝕み', sec:'' });
          if (t - lastEarth < EARTH_DOWN && earthSrc !== me) s.push({ at:lastEarth, icon:'earthDown', glyph:'耐', color:'#8a6a3a', name:'土属性耐性低下［強］', sec:tm(lastEarth + EARTH_DOWN) });
        }
        return s;
      },
      tick(t){
        const lt = this._lt ?? t, dt = Math.min(.1, Math.max(0, t - lt)); this._lt = t;
        // 味方のマーカー
        Object.entries(botPress).forEach(([k, tp]) => { if (!label[k] && t >= tp) giveMark(k, LINE_GROUP[p.line[k]]); });
        // 見えない味方：次に位置が大事になる瞬間（DEADLINES）の直前まで動かず、ギリギリで駆け込む（P5 のオーケストラと同じ。答えが見えないように）
        // このコマで締め切りをまたいだときは、まだその締め切りを使う（攻撃の判定はこの移動のあとに来るので、先に持ち場を離れない）
        const D = DEADLINES.find(x => x > lt + .02) ?? T.end;
        bots.forEach(b => {
          if (mem[b.k].dead) return;
          const g = spot(b.k, D > t ? Math.max(t, D - .1) : D - .1), d = dist(b, g), step = BOT_SPEED * dt;
          if (t < D - d / BOT_SPEED - BOT_MARGIN) return;
          if (d > .05){ const k = Math.min(1, step / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; }
        });
        // P3 通し：決戦2回目の位置（離れている）から、じしんまでに中央へ歩いてくる（エクスデスはサンダガの詠唱が終わってから）
        if (p.bossFrom && !this._from){ this._from = true; const fb = p.bossFrom(); [[CH, 'chaos'], [EX, 'exdeath']].forEach(([b, id]) => { const q = fb.find(x => x.id === id); b.x = q.x; b.z = q.z; }); }
        if (p.bossFrom) [[CH, 'chaos'], [EX, 'exdeath']].forEach(([b, sd]) => {
          if (casting(b, t) || (b === EX && t < TH[0][1] + .2)) return; const g = centerPos(sd), d = dist(b, g); if (d < .05) return; // エクスデスはサンダガ2連が終わるまで外周
          const k = Math.min(1, 7 * dt / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k;
        });
        [CH, EX].forEach(b => {
          if (casting(b, t)) return;
          // ボスは中央に固定（タンクが線を持って離れても動かない＝近接が殴れる）。向きだけヘイトのタンクの方へ
          const tk = pos(b.tank), d = dist(b, tk);
          if (d > .3) b.face = { x:(tk.x - b.x) / d, z:(tk.z - b.z) / d };
        });
        // 線の受け渡し：玉と今の持ち主の間（線の上）に入った人へ移る。味方は自分の担当の線だけ取る
        Object.keys(tether).forEach(d => {
          const o = orbPos(+d), h = pos(tether[d]), L = dist(o, h), u = unit(o, h);
          const nd = T.noth.findIndex(nt => nt > t - .05) + 1;
          const want = PLAN[nd] ? PLAN[nd][d] : null;
          for (const k of SLOTS){
            if (k === tether[d] || mem[k].dead) continue;
            if (k !== me && label[k] !== want) continue;
            // 線を取れるのは、持ち主から玉の側へ TAKE_ALONG 以上出て、線の上に入ったとき（中央に固まっているだけでは取れない）
            const q = pos(k), along = (q.x - o.x) * u.x + (q.z - o.z) * u.z;
            if (along <= L - TAKE_ALONG && segDist(q, o, u, L) <= TAKE_D){ tether[d] = k; if (k === me) sfx.ok(); break; }
          }
        });
        // 地雷（内周・中周の玉）。出た直後は当たらない（MINE_GRACE 秒）
        const ar = arrAt(t);
        if (ar && t >= ar.from + MINE_GRACE && t <= ar.to + VANISH_DELAY) ar.mines.forEach((m, i) => { if (dist(m, S.player) < MINE_HIT){ if (!this._mine || t - this._mine > 1.5){ this._mine = t; miss('ブラックホール（地雷の玉）に触れた'); damage(me, DMG.mine, 'ブラックホール'); } } });
        // HP：じしんのあと、自分がヒーラーなら見えないもう1人のヒーラーが少しずつ回復（泥土の人は除く）。ヒーラー以外は見えないヒーラーが十分に回復する
        if (t >= T.quake){
          const rate = isHealer ? 1.5 : 10;
          SLOTS.forEach(k => {
            if (mem[k].dead || (k === me && isHealer)) return;
            if (!mem[k].mud) addHp(k, rate * dt);
            else if (!isHealer && getHp(k) < 90) addHp(k, rate * dt); // 泥土の人も、全快（解除）の時刻までは満タンの手前まで
          });
          if (isHealer) addHp(me, .4 * dt);
          SLOTS.forEach(k => { if (mem[k].shield && t > mem[k].shUntil) mem[k].shield = 0; });
          // ヒーラー以外：ホワイトホールの前は見えないヒーラーが全員を満タンにする
          if (!isHealer && t >= T.white.hit - 2.5 && t < T.white.hit) SLOTS.forEach(k => healTo(k, 100));
        }
        mudCheck(t);
        earthQueue = earthQueue.filter(e => { if (t >= e.t){ earthAoe(e.src); return false; } return true; });
        events.forEach((e, i) => { if (!fired[i] && t >= e[0]){ fired[i] = true; e[1](); } });
      },
      safeActive: t => t >= .5,
      safe(x, z, t){ const g = spot(me, t); return Math.hypot(x - g.x, z - g.z) <= 2; },
      guide(t){ const g = spot(me, t); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      draw(t){
        // 中央の土クリスタル（じしんのあと）
        if (t >= T.quake){ // 中央の土クリスタル（ゆっくり上下・茶色の光）
          const X = px(0), k = PPY / 6, Z = px(0) + Math.round(Math.sin(t * 2) * k), H = Math.round(9 * k), Wd = Math.round(5 * k);
          alpha(.35 + .15 * Math.sin(t * 3), () => disc(X, Z, Math.round(8 * k), '#c8a060'));
          ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.moveTo(X, Z - H - 1); ctx.lineTo(X + Wd + 1, Z); ctx.lineTo(X, Z + H + 1); ctx.lineTo(X - Wd - 1, Z); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#a8783a'; ctx.beginPath(); ctx.moveTo(X, Z - H); ctx.lineTo(X + Wd, Z); ctx.lineTo(X, Z + H); ctx.lineTo(X - Wd, Z); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e8c890'; ctx.beginPath(); ctx.moveTo(X, Z - H); ctx.lineTo(X + Wd, Z); ctx.lineTo(X, Z); ctx.closePath(); ctx.fill();
          // じしんの直後：床のひび（数秒で消える）
          if (t < T.quake + 4) alpha(Math.max(0, 1 - (t - T.quake) / 4), () => { for (let i = 0; i < 10; i++){ let a = i * .628 + .3, r = 2, x0 = X, z0 = px(0); for (let j = 0; j < 6; j++){ r += 3; a += Math.sin(i * 7 + j * 3) * .25; const x1 = px(Math.cos(a) * r), z1 = px(Math.sin(a) * r); line(x0, z0, x1, z1, '#2a1a0a'); line(x0 + 1, z0, x1 + 1, z1, '#c8a060'); x0 = x1; z0 = z1; } } });
        }
        // 巨大ケフカ（外周の外）：OP の顔の絵を1.5倍＋羽飾り・ひだえり・両肩、白い大きな手
        // ビンタの詠唱中は叩く側（ケフカの右手＝ケフカから見て右）の手を振り上げ、叩くたびにその半面へ振り下ろす
        // ケフカのワープ：前の場所で白く光って縮みながら消え、新しい場所で紫の渦から大きくなって現れる
        const kb = kefkaAt(t), wi = kefkaTimes.findIndex(([tt], i) => t >= tt && (i === kefkaTimes.length - 1 || t < kefkaTimes[i + 1][0]));
        const wt = wi >= 0 ? t - kefkaTimes[wi][0] : 9, prevB = wi > 0 ? kefkaTimes[wi - 1][1] : null;
        if (kb != null){
          if (wt < WARP_OUT && prevB != null) withScale(prevB, 1 - wt / WARP_OUT, 1 - wt / WARP_OUT, () => drawKefka(t, prevB));
          else if (wt < WARP_OUT + WARP_IN){ const k = (wt - (prevB != null ? WARP_OUT : 0)) / WARP_IN; if (k > 0) withScale(kb, Math.min(1, k), Math.min(1, k * 1.3), () => drawKefka(t, kb)); }
          else drawKefka(t, kb);
        }
        // ブラックホール：地雷（内周・中周）と外周の玉。黒い球に青い渦のふち
        const ap = appAt(t);
        if (ap){
          const k = Math.min(1, (t - ap.at) / .8);
          // 消えるとき：エクスデスへ吸い込まれながら小さくなる
          const vt = Math.max(0, Math.min(1, (t - ap.end - VANISH_DELAY) / VANISH_DUR)), vk = 1 - vt * .85, ease = vt * vt;
          const suck = q => ({ x:q.x + (EX.x - q.x) * ease, z:q.z + (EX.z - q.z) * ease });
          // 地雷：並びごとに大きくなって現れ（当たるまでは薄い）、レーザーではじけて消える
          ap.arrs.forEach(r => {
            const g = Math.min(1, (t - r.from) / .8), live = t >= r.from + MINE_GRACE;
            r.mines.forEach((m, i) => { const q = suck(m); alpha(live ? 1 : .55, () => drawHole(q, MINE_R * (.3 + .7 * g) * vk, false, t + i * .37)); });
          });
          ap.outer.forEach(d => drawHole(suck(orbPos(d)), 2.1 * (.3 + .7 * k) * vk, !!tether[d], t + d));
        }
        {
          // 線（玉 → 持っている人）：細いオレンジの線。持ち主の位置に頭上マーカー
          Object.keys(tether).forEach(d => {
            const o = orbPos(+d), h = pos(tether[d]), mine = tether[d] === me;
            line(px(o.x) + 1, px(o.z) + 1, px(h.x) + 1, px(h.z) + 1, '#6a3a10');
            line(px(o.x), px(o.z), px(h.x), px(h.z), (t * 6 | 0) % 2 ? '#ffd060' : '#ffb040');
            if (mine){ // 自分の線：太く明るく、足元に輪
              line(px(o.x) - 1, px(o.z), px(h.x) - 1, px(h.z), '#fff4c0'); line(px(o.x), px(o.z) - 1, px(h.x), px(h.z) - 1, '#ffd060');
              alpha(.6 + .4 * Math.sin(t * 10), () => ring(px(h.x), px(h.z), Math.round(1.6 * PPY), '#ffd060'));
            } else if (label[tether[d]]) drawMark(label[tether[d]], px(h.x), px(h.z) - 12, .75);
          });
        }
        targetLast(bosses(t)).forEach(drawBossArt);
        // エフェクト
        for (let i = efx.length - 1; i >= 0; i--){
          const e = efx[i], a = t - e.t;
          if (a > (e.k === 'bok' ? 1.2 : .6) || (e.k === 'warpIn' && a > .6)){ efx.splice(i, 1); continue; }
          const f = 1 - a / .6;
          if (e.k === 'beam') drawLaser(e, a);
          if (e.k === 'warpIn' && a >= 0) alpha(Math.max(0, 1 - a / .6), () => { for (let j = 0; j < 14; j++){ const an = j / 14 * Math.PI * 2 + a * 8, r = (1 - a / .6) * 9 * PPY; rect(Math.round(px(e.q.x) + Math.cos(an) * r) - 1, Math.round(px(e.q.z) + Math.sin(an) * r) - 1, 3, 3, j % 2 ? '#c06aff' : '#ffffff'); } });
          if (e.k === 'tetherOn'){ const q = orbPos(e.d); alpha(f, () => ring(px(q.x), px(q.z), Math.round((2.4 + a * 6) * PPY), '#ffd060')); }
          if (e.k === 'tetherOff') alpha(.8 * f, () => { const n = 10; for (let i = 0; i < n; i++){ if ((i + (a * 20 | 0)) % 3 === 0) continue; const x0 = e.o.x + (e.h.x - e.o.x) * i / n, z0 = e.o.z + (e.h.z - e.o.z) * i / n, x1 = e.o.x + (e.h.x - e.o.x) * (i + 1) / n, z1 = e.o.z + (e.h.z - e.o.z) * (i + 1) / n; line(px(x0), px(z0), px(x1), px(z1), '#ffb040'); } });
          if (e.k === 'slap') alpha(.4 * f, () => {
            // 叩く側の半面だけに切り取って、その回の円を塗る
            const kb = p.kefka.slap[e.i], sd = at(p.slapRight[e.i] ? kb - 90 : kb + 90, 1), ax = at(kb, 1), L = ARENA_R + 6;
            ctx.save(); ctx.beginPath();
            [[L, 0], [L, L], [-L, L], [-L, 0]].forEach(([a, b], j) => { const x = ax.x * a + sd.x * b, z = ax.z * a + sd.z * b; j ? ctx.lineTo(px(x), px(z)) : ctx.moveTo(px(x), px(z)); });
            ctx.closePath(); ctx.clip();
            const c = slapCircle(e.i, e.n); disc(px(c.x), px(c.z), Math.round(SLAP_CR * PPY), '#ff4a6a');
            ctx.restore();
          });
          if (e.k === 'slapEnd') alpha(.55 * f, () => {
            disc(px(0), px(0), Math.round(MID_R * PPY), '#ff6a8a');
            // 頭割り＝ケフカの安地側へ扇1つ、ロール散開＝ロールの位置へ扇3つ（中央から。どちらも 50°。動画では測れず、ユーザーと決めた値）
            const fan = (b, w, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px(0), px(0)); for (let j = -w; j <= w; j += 4){ const q = at(b + j, 22); ctx.lineTo(px(q.x), px(q.z)); } ctx.fill(); };
            if (p.slapRight[e.i]) fan(bearingOf(slapSpot(me, e.i)), 25, '#ff8ad0');
            else ['MT', 'H1', 'D1'].forEach(k => fan(bearingOf(slapSpot(k, e.i)), 25, '#ffb04a'));
          });
          if (e.k === 'earth') alpha(.5 * f, () => ring(px(0), px(0), Math.round((4 + a * 30) * PPY), '#c8a060'));
          if (e.k === 'boltRing'){ const X = px(e.q.x), Z = px(e.q.z); alpha(.6 * f, () => { disc(X, Z, Math.round((1.5 + a * 4) * PPY), '#8ac8ff'); ring(X, Z, Math.round((2 + a * 6) * PPY), '#ffffff'); }); }
          if (e.k === 'damning') alpha(.55 * f, () => { const fr = e.fr; ctx.save(); ctx.beginPath(); ctx.arc(px(0), px(0), ARENA_R * PPY, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.moveTo(px(fr.x), px(fr.z)); for (let b = -90; b <= 90; b += 6){ const q = add(fr, at(fr.b + b, 40)); ctx.lineTo(px(q.x), px(q.z)); } ctx.fill();
            ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.moveTo(px(fr.x), px(fr.z)); for (let b = -90; b <= 90; b += 6){ const q = add(fr, at(fr.b + b, 4 + a * 50)); ctx.lineTo(px(q.x), px(q.z)); } ctx.fill();
            [-90, 90].forEach(b => { const q = add(fr, at(fr.b + b, 30)); line(px(fr.x), px(fr.z), px(q.x), px(q.z), '#ffffff'); }); ctx.restore(); });
          if (e.k === 'bok') drawBodyPress(p.kefka.bok[e.i], a);
          if (e.k === 'white') alpha(.6 * f, () => { disc(px(EX.x), px(EX.z), Math.round((4 + a * 40) * PPY), '#ffffff'); ring(px(EX.x), px(EX.z), Math.round((6 + a * 50) * PPY), '#c8d8ff'); });
        }
        fx3.draw();
        // 自分の頭上マーカー
        if (label[me]) drawMark(label[me], px(S.player.x), px(S.player.z) - 26, 1);
        void kefkaAt; void holdOf; void quakeT;
      },
    };
  },
};

export { P3C };
