import { S, pick, logLine } from './state.js';
import { sfx } from './audio.js';
import { A, hasInvuln, healerHit, popup, switchTarget } from './action.js';
import { opt } from './store.js';
import { mySlot } from './jobs.js';
import { bossSprite } from './p4boss.js';
import { fxFlash, fxShake } from './fx.js';
import { GLYPH, P, PPY, alpha, ctx, disc, drawBossFace, hurt, line, px, rect, ring, targetLast } from './gfx.js';
import { BLASTER_MACRO } from './p3macro.js';
import { makeP3Fx, drawCrystal, drawVoid } from './p3fx.js';

// =====================================================================
// P3「エクスデス＆カオス」（docs/research-p3.md）
// 処理法はヤーン速報（絶妖星乱舞 攻略特設）に合わせる。味方7人は画面に出さない（決まった位置に立っている扱い）
// 座標：x＝東、z＝南（北は -z）。方位（bearing）は北から時計回りの度
// ボス・ケフカの絵はまだ仮の形（イメージ画像で OK をもらってから差し替える）
// =====================================================================
const dirOf = b => ({ x:Math.sin(b * Math.PI / 180), z:-Math.cos(b * Math.PI / 180) });
const at = (b, r) => { const d = dirOf(b); return { x:d.x * r, z:d.z * r }; };
const norm = b => ((b % 360) + 360) % 360;
// フィールドマーカー（1＝北西・2＝北東・3＝南東・4＝南西 の並び。ヤーンのマクロと同じ）
const MARK_AT = { 0:'A', 45:'2', 90:'B', 135:'3', 180:'C', 225:'4', 270:'D', 315:'1' };
// 点 q から、a を通って向き d へ伸びる直線（長さ len）までの距離
const segDist = (q, a, d, len) => { const t = Math.max(0, Math.min(len, (q.x - a.x) * d.x + (q.z - a.z) * d.z)); return Math.hypot(q.x - a.x - d.x * t, q.z - a.z - d.z * t); };

// 決戦の組（ヤーン）：カオス側＝ST・H2・D1・D2、エクスデス側＝MT・H1・D3・D4。最初のターゲットはこの組のボス
const CHAOS_SIDE = ['ST', 'H2', 'D1', 'D2'];
const BOSS_TC = 5; // カオス・エクスデスのターゲットサークルの半径（ヤーンの図から）
const BOSS_COL = { chaos:'#e8783a', exdeath:'#9a5aff' };
// ボスの絵。カオスは P4 の絵、エクスデス（ネオではない方）は P3 用に描いた絵
const drawBossArt = b => {
  const X = px(b.x), Z = px(b.z);
  const sp = bossSprite(b.id === 'chaos' ? 'chaos' : 'exdeath'); ctx.drawImage(sp, Math.round(X - sp.width / 2), Math.round(Z - sp.height / 2));
  drawBossFace(b);
};

// 頭上の数字（サイコロ）用。gfx の GLYPH は 1〜5 だけなので 6〜8 をここで足す
const NUM_GLYPH = { ...GLYPH, 6:'011100110101010', 7:'111001010010010', 8:'010101010101010' };
// k：1ドットの大きさ（頭上マーカーは2倍で描く）
const numGlyph = (ch, cx, cy, c, k = 1) => { const g = NUM_GLYPH[ch]; if (!g) return; for (let i = 0; i < 15; i++) if (g[i] === '1') rect(cx - Math.floor(1.5 * k) + (i % 3) * k, cy - Math.floor(2.5 * k) + (i / 3 | 0) * k, k, k, c); };

// 紫の稲妻の帯（アルテマブラスターの突進・直線）：a → b、半幅 hw。中は濃い紫、ふちは明るく、ジグザグの稲妻と黒い玉
function energyBand(a, b, hw, f, seed, mine = false){
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, d = { x:(b.x - a.x) / L, z:(b.z - a.z) / L }, n = { x:-d.z, z:d.x };
  const P4 = o => [px(a.x + n.x * o), px(a.z + n.z * o), px(b.x + n.x * o), px(b.z + n.z * o)];
  const poly = (o1, o2, col) => { const [x1, y1, x2, y2] = P4(o1), [x3, y3, x4, y4] = P4(o2); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x4, y4); ctx.lineTo(x3, y3); ctx.fill(); };
  alpha(.55 * f, () => poly(-hw, hw, mine ? '#8a5aff' : '#5a2aa8'));
  alpha(.6 * f, () => poly(-hw * .45, hw * .45, '#b07aff'));
  alpha(.8 * f, () => { const [x1, y1, x2, y2] = P4(-hw), [x3, y3, x4, y4] = P4(hw); line(x1, y1, x2, y2, '#e8c8ff'); line(x3, y3, x4, y4, '#e8c8ff'); });
  // 稲妻：帯の中を走るジグザグ 3 本（時間で形が変わる）
  const ph = Math.floor(S.t * 18);
  alpha(f, () => { for (let j = 0; j < 3; j++){ let lx = null, lz = null; for (let i = 0; i <= 14; i++){ const s2 = L * i / 14, o = Math.sin(i * 2.3 + j * 1.7 + ph * .9 + seed) * hw * .8; const x = px(a.x + d.x * s2 + n.x * o), z = px(a.z + d.z * s2 + n.z * o); if (lx != null) line(lx, lz, x, z, j ? '#c8a8ff' : '#ffffff'); lx = x; lz = z; } } });
  // 黒い玉（帯に沿って流れる）
  alpha(f, () => { for (let j = 0; j < 4; j++){ const s2 = ((j * .27 + S.t * .8 + seed * .1) % 1) * L, o = Math.sin(j * 3.1 + seed) * hw * .5, x = px(a.x + d.x * s2 + n.x * o), z = px(a.z + d.z * s2 + n.z * o); disc(x, z, Math.round(1.1 * PPY) + 1, '#b07aff'); disc(x, z, Math.round(1.1 * PPY), '#05030c'); } });
}
// 彗星（アルテマブラスターの突進）：頭は白〜薄紫に光る玉、後ろへ紫の尾が細くなりながら伸び、尾の中に稲妻
function drawComet(h, d, hw, seed){
  const n = { x:-d.z, z:d.x }, TAIL = 16;
  const pt = (s, o) => [px(h.x - d.x * s + n.x * o), px(h.z - d.z * s + n.z * o)];
  const tail = (w, col, al) => alpha(al, () => { ctx.fillStyle = col; ctx.beginPath(); const p0 = pt(0, w), p1 = pt(TAIL, 0), p2 = pt(0, -w); ctx.moveTo(p0[0], p0[1]); const c1 = pt(TAIL * .4, w * .8), c2 = pt(TAIL * .4, -w * .8); ctx.quadraticCurveTo(c1[0], c1[1], p1[0], p1[1]); ctx.quadraticCurveTo(c2[0], c2[1], p2[0], p2[1]); ctx.fill(); });
  tail(hw * 1.1, '#3a1a7a', .45); tail(hw * .75, '#8a4aff', .55); tail(hw * .35, '#e0c8ff', .7);
  const ph = Math.floor(S.t * 20);
  for (let j = 0; j < 2; j++){ let l = null; for (let i = 0; i <= 8; i++){ const s2 = TAIL * i / 8, o = Math.sin(i * 2.1 + j * 2 + ph + seed) * hw * .6 * (1 - i / 8); const q = pt(s2, o); if (l) line(l[0], l[1], q[0], q[1], j ? '#c8a8ff' : '#ffffff'); l = q; } }
  const X = px(h.x), Z = px(h.z), R = Math.round(hw * PPY);
  alpha(.4, () => disc(X, Z, R + 3, '#b07aff')); disc(X, Z, R, '#d8c0ff'); disc(X, Z, Math.round(R * .6), '#ffffff');
}
// サイコロ（アルテマブラスターの頭上の数字）：光る格子の板に、迷路模様の白い玉。奇数は青紫、偶数は赤桃。玉のまわり（板）は半透明
// 並び（実機の画像から。[列, 行]、行 .5 は2段の真ん中）：1 ○／2 ○○／3 上1・下2／4 2×2／5 左に1つ＋2×2／6 左に3（上は真ん中・下2）＋右に3（上2・下は真ん中）／7 左に3（上は真ん中・下2）＋右に2×2／8 4×2
const DICE = { 1:[1, 1, [[0, 0]]], 2:[2, 1, [[0, 0], [1, 0]]], 3:[2, 2, [[.5, 0], [0, 1], [1, 1]]], 4:[2, 2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
  5:[3, 2, [[0, .5], [1, 0], [2, 0], [1, 1], [2, 1]]], 6:[4, 2, [[.5, 0], [0, 1], [1, 1], [2, 0], [3, 0], [2.5, 1]]],
  7:[4, 2, [[.5, 0], [0, 1], [1, 1], [2, 0], [3, 0], [2, 1], [3, 1]]], 8:[4, 2, [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]] };
function drawDice(n, X, Y){
  const [C, Rw, dots] = DICE[n] || DICE[1], cell = 10, W = C * cell, H = Rw * cell, x0 = Math.round(X - W / 2), y0 = Math.round(Y - H / 2);
  const odd = n % 2 === 1, bg = odd ? '#5a4ad8' : '#e04a6a', glow = odd ? '#c8b8ff' : '#ffb0c8';
  alpha(.35, () => rect(x0 - 1, y0 - 1, W + 2, H + 2, bg));                     // 板（半透明）
  alpha(.7, () => { for (let i = 0; i <= C; i++) rect(x0 + i * cell - (i === C ? 1 : 0), y0 - 2, 1, H + 4, glow); for (let j = 0; j <= Rw; j++) rect(x0 - 2, y0 + j * cell - (j === Rw ? 1 : 0), W + 4, 1, glow); }); // 光る格子
  dots.forEach(([cx, cy]) => {
    const x = Math.round(x0 + (cx + .5) * cell), y = Math.round(y0 + (cy + .5) * cell);
    alpha(.5, () => disc(x, y, 5, glow)); disc(x, y, 4, '#ffffff');
    rect(x - 3, y - 1, 4, 1, '#6a6a80'); rect(x, y + 1, 3, 1, '#6a6a80'); rect(x - 1, y - 3, 1, 2, '#6a6a80'); rect(x + 2, y - 1, 1, 3, '#6a6a80'); rect(x - 2, y + 1, 1, 2, '#6a6a80'); // 迷路模様
  });
}

// サンダガ（タンク強攻撃）：エクスデスに一番近い人を中心にした円範囲。近くにいる人も巻き込まれる（2026-10-09 ユーザー確認：円）
// 半径は資料にないので推定（BUSTER_R）
const BUSTER_R = 5;
const inBusterAoe = (q, tgt) => Math.hypot(q.x - tgt.x, q.z - tgt.z) <= BUSTER_R;

// まだ作っていないギミック（メニューには出すが、選んでも始まらない）
const wip = (id, name, sub) => ({ id, name, sub, wip:true, view:24, start:{ x:0, z:4 }, gen(){ return {}; }, create(){ return null; } });

// ---------------------------------------------------------------------
// アルテマブラスター（時刻は cactbot のタイムライン 715 秒を 0 とする）
// 観察：ケフカが外周8方向のどこかから中心を抜けて反対へ突進。時計 or 反時計回りに8回（避けられない全体攻撃）
// 誘導：全員に数字 1〜8。1番には1回目と同じ位置から、2番には8回目、3番には7回目…の位置から直線
// 処理（逆回り散開）：1回目の到着地点から観察と逆回りに半マスずれた所が1番、そこから逆回りに 2・3…
// ---------------------------------------------------------------------
const P3B = (() => {
  const RUSH0 = 5.1, RUSH_GAP = 2.015, NUMBERS = 15.1, FIRE0 = 27.2, FIRE_GAP = .2, END = 30;
  const SPOT_R = 18, ORIGIN_R = 21, BEAM_HW = 4, BEAM_LEN = 44, RUSH_HW = 5; // BEAM_HW：8本の直線の半幅（実機の画像の見た目から。正しい位置ならほかの直線の中心から 6 離れている）
  const RUSH_DMG = 50000; // 突進1回ぶんの全体攻撃（目安。ヒーラーの HP 管理用）
  return {
    id:'p3b', name:'アルテマブラスター', sub:'逆回り散開', view:24, start:{ x:0, z:4 },
    gen(){ return { s:pick([0, 45, 90, 135, 180, 225, 270, 315]), r:pick([1, -1]), me:1 + (Math.random() * 8 | 0), wind:pick([45, 135, 225, 315]) }; },
    create(p){
      const now = () => S.t - (p.off || 0); // P3 通しでつないだときの、このギミックの中の時刻
      const rushFrom = k => norm(p.s + p.r * 45 * k);                       // k 回目（0 始まり）の突進の出発点
      const originOf = n => n === 1 ? rushFrom(0) : rushFrom(9 - n);         // n 番の直線が来る位置（1回目、8回目、7回目…）
      const spotOf = n => norm(p.s + 180 - p.r * 22.5 - p.r * 45 * (n - 1)); // n 番の立ち位置（到着地点から逆回りに半マスずつ）
      const arrive = MARK_AT[norm(p.s + 180)];
      const macro = BLASTER_MACRO[p.r > 0 ? 'cw' : 'ccw'][arrive];
      const bot = n => at(spotOf(n), SPOT_R);
      // ボス（ヤーンの TLB3 式の図）：エクスデスは風のクリスタルの上（中心から 13）、カオスはその反対側（中心から 10）。ブラスターの間は動かない
      const BOSSES = [
        { id:'chaos', name:'カオス', ...at(p.wind + 180, 10), face:at(p.wind, 1), r:BOSS_TC, color:BOSS_COL.chaos },        // 向きはタンクのいる中央側
        { id:'exdeath', name:'エクスデス', ...at(p.wind, 13), face:at(p.wind + 180, 1), r:BOSS_TC, color:BOSS_COL.exdeath },
      ];
      const fireAt = n => FIRE0 + FIRE_GAP * (n - 1);
      const fired: boolean[] = [], beams = [];
      const queue = [
        // 2回目の突進で回転の向きが分かったら、味方がマクロを流す
        { at:RUSH0 + RUSH_GAP + 1.2, run:() => macro.forEach(l => logLine(l.replace(/^\/p ?/, ''), 'rule')) },
      ].map(q => ({ ...q, done:false }));
      const rushes = Array.from({ length:8 }, (_, k) => ({ t:RUSH0 + RUSH_GAP * k, from:rushFrom(k), done:false }));
      const fire = n => {
        const o = at(originOf(n), ORIGIN_R), tgt = n === p.me ? { ...S.player } : bot(n);
        const len = Math.hypot(tgt.x - o.x, tgt.z - o.z) || 1, d = { x:(tgt.x - o.x) / len, z:(tgt.z - o.z) / len };
        beams.push({ o, d, t:now(), n });
        if (n === p.me){
          // 自分の直線：ほかの番号の人（決まった位置にいる）を巻き込まない
          if ([1, 2, 3, 4, 5, 6, 7, 8].some(m => m !== n && segDist(bot(m), o, d, BEAM_LEN) <= BEAM_HW)) hurt('アルテマブラスターに味方を巻き込んだ');
        } else if (segDist(S.player, o, d, BEAM_LEN) <= BEAM_HW) hurt(`${n}番のアルテマブラスターに当たった`);
        sfx.boom();
      };
      return {
        end:END,
        intro:'突進の最初の位置と回転を見る',
        casts:[{ name:'アルテマブラスター', start:FIRE0 - 4, len:4 }],
        // ボスは2体。ブラスターの間はどちらも殴れる。左端のボタン（PC は 5 キー）でターゲットを切り替える
        bosses: () => p.ext ? p.ext() : BOSSES, // 前半とつないだときは、前半のボス（同じもの）を使う
        target0: CHAOS_SIDE.includes(mySlot()) ? 'chaos' : 'exdeath',
        buttons:{ early:'ターゲット切替' },
        say(kind){ if (kind === 'early') switchTarget(); },
        fieldMarker:'nw',
        progress: () => '', // 左下の進み具合（観察・サイコロ・誘導）は出さない（2026-10-08 ユーザー）
        macroBox:true, // チャット欄は使わず（P5 型の画面）、フィールドの左下にマクロの左の列（「1 C4」など）だけを縦に出す。マクロは logLine で流す
        mySpot: t => t >= NUMBERS ? bot(p.me) : null,
        debug:{ p, spotOf, originOf, arrive, bot },
        tick(t){
          queue.forEach(q => { if (!q.done && t >= q.at){ q.done = true; q.run(); } });
          rushes.forEach(r => { if (!r.done && t >= r.t){ r.done = true; healerHit(RUSH_DMG, 'アルテマブラスター'); sfx.big(); fxShake(2, .2); } }); // 画面の白いフラッシュは出さない
          for (let n = 1; n <= 8; n++) if (!fired[n] && t >= fireAt(n)){ fired[n] = true; fire(n); }
        },
        safeActive: t => t >= NUMBERS && t < FIRE0 + 8 * FIRE_GAP,
        safe(x, z){ const g = bot(p.me); return Math.hypot(x - g.x, z - g.z) <= 2; },
        guide(t){ if (t < NUMBERS) return; const g = bot(p.me); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
        draw(t){
          if (!p.ext) targetLast(BOSSES).forEach(drawBossArt);
          // 観察：突進（端から中心を抜けて反対へ）。光の玉が走り抜け、その跡に紫の稲妻の帯と黒い玉が残る（動画）
          // 観察：突進は紫の彗星（光る頭と、細くなっていく尾）が端から端へ飛ぶ。通った跡にうっすら紫のもやが残る
          rushes.forEach(r => {
            const dt = t - (r.t - .35); if (dt < 0 || dt > 1.1) return;
            const a = at(r.from, ORIGIN_R + 3), b = at(r.from + 180, ORIGIN_R + 3), k = Math.min(1.25, dt / .35);
            const head = { x:a.x + (b.x - a.x) * k, z:a.z + (b.z - a.z) * k };
            if (dt > .2) energyBand(a, { x:a.x + (b.x - a.x) * Math.min(1, k), z:a.z + (b.z - a.z) * Math.min(1, k) }, RUSH_HW, .3 * Math.max(0, 1 - (dt - .35) / .75), r.t * 7);
            if (k < 1.2) drawComet(head, dirOf(r.from + 180), RUSH_HW, r.t);
          });
          // 誘導：8本の直線も同じ紫の稲妻の帯（外から自分の方へ）
          beams.forEach(bm => {
            const k = (t - bm.t) / .7; if (k < 0 || k > 1) return;
            energyBand(bm.o, { x:bm.o.x + bm.d.x * BEAM_LEN, z:bm.o.z + bm.d.z * BEAM_LEN }, BEAM_HW, 1 - k, bm.n * 3, bm.n === p.me);
          });
          // 頭上の数字：サイコロ
          if (t >= NUMBERS && t < FIRE0 + 8 * FIRE_GAP) drawDice(p.me, px(S.player.x), px(S.player.z) - 26);
        },
      };
    }
  };
})();

// ---------------------------------------------------------------------
// バウル・オブ・アゴニー（TLB3式・ヤーン）。時刻は cactbot のタイムライン 640 秒を 0 とする
// 決戦 → バウル・オブ・アゴニー（炎・水・風）→ 範囲サンダガ＋早い属性 → サンダガ2連 → インプロージョン → 遅い属性 → アンブラスマッシュ＋真空波（タンク LB3）
// 立ち位置は風と水のクリスタルを基準に固定（ヤーンの図）。炎と水のどちらが先かでは変わらない
// ---------------------------------------------------------------------
const P3A0 = (() => {
  const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
  const SUP = ['MT', 'ST', 'H1', 'H2'], DPS = ['D1', 'D2', 'D3', 'D4'];
  const T = {
    battle:3.5, unbattle:35, bowels:22.9, bossMove:[23, 29], short:42.0, shortCry:43.0, thunderAoe:42.2,
    buster:[51.3, 54.3], exToChaos:[55, 58], implCast:59.1, impl:[64.9, 66.9], long:69.0, longCry:70.0,
    umbraCast:79.2, umbra:84.2, vacuumCast:79.7, vacuum:87.4, tornado:91.3, end:93,
  };
  const CRY_R = 13;            // クリスタル・風の上のカオスの中心からの距離（ヤーンの図）
  const EX_BAIT_R = 12.6;      // 範囲サンダガを誘導するエクスデスの位置（風の対角）
  const THUNDER_R = 14;        // 範囲サンダガ（エクスデス中心・見えない）
  const THUNDER_CAST = 7;      // 範囲サンダガの詠唱（cactbot：BB12 は 7 秒）
  const FIRE_R = 5;            // 混沌の炎（デバフ）の円
  const DONUT_IN = 5, DONUT_OUT = 9; // 混沌の水（デバフ）・炎クリスタルのドーナツ
  const WATER_CRY_R = 6;       // 水クリスタルの円
  const KB = 20;               // 真空波のノックバック（正しい向きで半分、逆で倍）
  const LB_DUR = 8;            // タンク LB3 の効果時間
  const BOT_SPEED = 9, BOSS_SPEED = 7; // ボスの歩く速さ（プレイヤーは 6）
  const DMG = { bowels:150000, fire:80000, water:80000, tornado:60000 }; // 目安（ヒーラーの HP 管理用）
  const LB3_NAME = { pld:'ラストバスティオン', drk:'ダークフォース' };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const add = (a, b, k = 1) => ({ x:a.x + b.x * k, z:a.z + b.z * k });
  const lerp = (a, b, k) => ({ x:a.x + (b.x - a.x) * k, z:a.z + (b.z - a.z) * k });
  const bearingOf = q => (Math.atan2(q.x, -q.z) * 180 / Math.PI + 360) % 360;
  const angDiff = (a, b) => { const d = ((a - b) % 360 + 540) % 360 - 180; return d; };
  return {
    id:'p3a0', name:'バウル・オブ・アゴニー（真空波まで）', sub:'TLB3式（決戦〜真空波）', view:24, start:{ x:0, z:4 }, slots:true,
    gen(){
      const fireTH = pick(SUP), fireD = pick(DPS);
      return {
        me:mySlot(), wind:pick([45, 135, 225, 315]), side:pick([1, -1]), fireFirst:Math.random() < .5,
        fire:[fireTH, fireD], water:[pick(SUP.filter(k => k !== fireTH)), pick(DPS.filter(k => k !== fireD))],
        tail:Object.fromEntries(SLOTS.map(k => [k, Math.random() < .5])), // true＝混沌の逆風（正面で受ける）
        vertical:Math.random() < .5, // ヴァーティカル（前後→左右）／ホリゾンタル（左右→前後）
      };
    },
    create(p){
      const now = () => S.t - (p.off || 0); // P3 通しでつないだときの、このギミックの中の時刻
      const me = p.me;
      const w = p.wind, wa = norm(w + 90 * p.side), fi = norm(w - 90 * p.side), em = norm(w + 180);
      const CRY = { wind:at(w, CRY_R), water:at(wa, CRY_R), fire:at(fi, CRY_R) };
      const shortKind = p.fireFirst ? 'fire' : 'water', longKind = p.fireFirst ? 'water' : 'fire';
      const holders = kind => kind === 'fire' ? p.fire : p.water;
      const until = kind => kind === shortKind ? T.short : T.long;
      // ---- ボス：ヘイトを持っているタンク（カオス＝ST、エクスデス＝MT）を追いかけて、その方を向く（FF14 の仕様） ----
      // タンクがターゲットサークルの中に入るまで歩く。詠唱中は動かず、向きも変えない
      // 自分がそのタンクなら自分を追いかける（自分で誘導する）。違うなら、決まった動きをする味方のタンクを追いかける
      let umbraAt = null; // アンブラスマッシュの着地点（詠唱開始で決まる）
      const mkBoss = (q, tank) => ({ ...q, face:{ x:-q.x / 10, z:-q.z / 10 }, tank });
      const CH = mkBoss(at(270, 10), 'ST'), EX = mkBoss(at(90, 10), 'MT');
      const CAST_CH = [[17.9, T.bowels], [T.implCast, T.impl[1]], [T.umbraCast, T.umbra]];
      const CAST_EX = [[T.thunderAoe - THUNDER_CAST, T.thunderAoe], [T.buster[0] - 5, T.buster[1]], [T.vacuumCast, T.vacuum]];
      const casting = (b, t) => t < T.battle || (b === CH ? CAST_CH : CAST_EX).some(([a, z]) => t >= a && t < z);
      const battleOn = t => t >= T.battle && t < T.unbattle;
      const myBoss = k => ['ST', 'H2', 'D1', 'D2'].includes(k) ? 'chaos' : 'exdeath';
      const bosses = t => [
        { id:'chaos', name:'カオス', x:CH.x, z:CH.z, face:CH.face, r:BOSS_TC, color:BOSS_COL.chaos, attackable: tt => !battleOn(tt) || myBoss(me) === 'chaos' },
        { id:'exdeath', name:'エクスデス', x:EX.x, z:EX.z, face:EX.face, r:BOSS_TC, color:BOSS_COL.exdeath, attackable: tt => !battleOn(tt) || myBoss(me) === 'exdeath' },
      ];
      let implFrame = null; // インプロージョン：詠唱開始の瞬間のカオスの位置と向き（詠唱中は向きが変わらない）
      // ---- 立ち位置（ヤーンの図）。u＝風へ向かう向き ----
      const base = k => {
        if (k === 'D1' || k === 'D2') return add(at(w, 18), at(w + 90, 1), k === 'D1' ? 1 : -1);
        if (k === 'D3') return at(wa + 20 * p.side, 19);   // 水クリスタルを挟んで、エクスデス（風の対角）側
        if (k === 'D4') return at(wa - 25 * p.side, 16);   // 水クリスタルを挟んで、カオス（風）側
        if (k === 'ST') return at(w, CRY_R - BOSS_TC * .9); // カオスのすぐ内側（中央側）で処理。カオスは ST を向くので外周に背を向ける
        const i = ['MT', 'ST', 'H1', 'H2'].indexOf(k);     // タンク・ヒーラーはカオスの内側に固まる
        return add(at(w, 6), at(w + 90, 1), (i - 1.5) * .5);
      };
      const opening = k => add(myBoss(k) === 'chaos' ? at(270, 5) : at(90, 5), at(SLOTS.indexOf(k) * 45, 1));
      // 決戦のあと：2体を中央へ寄せる。ど真ん中ではなく、それぞれ自分たちの側へ CENTER_OFF ずらす
      // （自分中心の範囲技が、決戦で殴れない側のボスに当たらないように）。ボスはタンクの方を向くので、背面は自分たちの側
      const CENTER_OFF = 3, PULL_UNTIL = T.battle + 4;
      const centerPos = side => at(side === 'chaos' ? 270 : 90, CENTER_OFF);
      const centerSpot = (k, t) => {
        const side = myBoss(k), bp = centerPos(side), out = side === 'chaos' ? 270 : 90;
        if (k === 'ST' || k === 'MT'){
          // いったん反対側（ボスの止まりたい位置からターゲットサークルの半径ぶん先）まで歩いて引き寄せ、そのあとサークルの内側へ戻る
          if (t < PULL_UNTIL) return add(bp, at(out + 180, BOSS_TC));
          return add(bp, at(out + 180, BOSS_TC * .3));
        }
        const others = SLOTS.filter(x => myBoss(x) === side && x !== 'ST' && x !== 'MT'), i = others.indexOf(k);
        return add(bp, at(out + (i - 1) * 30, BOSS_TC * .7)); // ボスの背面側（自分たちの側）に並ぶ
      };
      const mtAtEx = () => add(EX, at(bearingOf(EX) + 180, 1.5)); // エクスデスのすぐ内側（殴りながらタンクする）
      const gather = k => add(at(w, 7), at(SLOTS.indexOf(k) * 45, .8));
      // インプロージョン：カオス（風の上・中央向き）の前後／左右の扇 90°。安全な向きへ回り込む
      const chaosFrame = () => implFrame || { x:CH.x, z:CH.z, b:bearingOf(CH.face) };
      const implHit = (q, n) => { // n=0 1発目、1 2発目。カオスの向きを基準に前後／左右
        const c = chaosFrame(), rel = norm(bearingOf({ x:q.x - c.x, z:q.z - c.z }) - c.b);
        const frontBack = Math.min(Math.abs(angDiff(rel, 0)), Math.abs(angDiff(rel, 180))) < 45;
        return (n === 0) === p.vertical ? frontBack : !frontBack;
      };
      const dodge = (q, n) => {
        if (!implHit(q, n)) return q;
        const c = chaosFrame(), d = dist(q, c), b0 = bearingOf({ x:q.x - c.x, z:q.z - c.z });
        // カオスのまわりを少しずつ回る（外周を越えるなら少し内側へ）。扇のふちから 8° 離す
        for (let k = 5; k <= 120; k += 5) for (const s of [1, -1]) for (let dd = d; dd >= 3; dd -= 1.5){
          const r = add(c, at(b0 + s * k, dd));
          if (Math.hypot(r.x, r.z) > 18.5) continue;
          if (!implHit(r, n) && !implHit(add(c, at(b0 + s * (k + 8), dd)), n) && !implHit(add(c, at(b0 + s * (k - 8), dd)), n)) return r;
          break;
        }
        return q;
      };
      const umbraBait = at(em, 19);
      // 相方のタンク（味方）：バウル・オブ・アゴニーのあと、すぐにボスを運ぶと答え（風の向き）が分かってしまうので、
      // 範囲サンダガの詠唱（ボスが止まる）に間に合うぎりぎりまで今の場所で待ってから運ぶ。運ぶ動きは TANK_GO から始める
      const TANK_GO = T.thunderAoe - THUNDER_CAST - 5.5;
      const botTime = (k, t) => (k === 'MT' || k === 'ST') && t >= T.bowels && t < TANK_GO + 7 ? (t < TANK_GO ? T.bowels - .01 : T.bowels + (t - TANK_GO)) : t;
      // タンクの誘導：ボスの向こう側（外周）まで歩いて、ボスを目的の場所まで連れてくる
      // 前半とアルテマブラスターをつないだとき：直線の直前に、味方は自分の番号の位置（外周）へ駆け込む。ボスはタンクについていく
      const BL_GO = 100;
      const spot = (k, t) => {
        if (p.blaster && t >= BL_GO) return p.blaster(k);
        if (t < T.battle) return opening(k);
        if (t < T.bowels) return centerSpot(k, t);
        if (k === 'ST' && t < T.bowels + 7) return at(w, CRY_R + BOSS_TC);                        // カオスを風クリスタルの上へ（外周まで歩いて引き寄せる）
        if (k === 'MT'){
          if (t < T.bowels + 7) return at(em, 19);                                    // エクスデスを風の対角へ
          if (t < 38) return mtAtEx();
          if (t < T.thunderAoe + .05) return at(em + 75 * p.side, 18.5);              // 範囲サンダガの外で待つ（炎クリスタル側）
          if (t < T.buster[1] + .2) return add(EX, at(bearingOf(EX), 1.5));            // 戻って強攻撃2連を無敵で。外周側で受けて、円範囲に味方を巻き込まない
          if (t < T.implCast + 1.7) return at(w, CRY_R + BOSS_TC);                                 // エクスデスをカオス（風）に重ねる
        }
        if (t >= T.implCast + 2 && t < T.impl[0]) return dodge(base(k), 0);
        if (t >= T.impl[0] && t < T.impl[1]) return dodge(base(k), 1);
        if (k === 'D3' && t >= 74 && t < T.umbraCast + .3) return umbraBait;
        if (t >= T.vacuum){ const g = gather(k), e = CRY.wind, d = Math.hypot(g.x - e.x, g.z - e.z) || 1; return add(g, { x:(g.x - e.x) / d, z:(g.z - e.z) / d }, KB / 2); } // 真空波で飛んだ先
        if (t >= T.longCry + .5) return gather(k);
        return base(k);
      };
      const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...opening(k) }));
      const pos = k => k === me ? S.player : bots.find(b => b.k === k);
      const nearest = (q, n, list = SLOTS) => [...list].sort((a, b) => dist(pos(a), q) - dist(pos(b), q)).slice(0, n);
      // ---- 判定 ----
      let vulnUntil = -9, lbAt = -99, lbUsed = false, kb = null, windGone = false;
      const efx = makeP3Fx(); // エフェクト（p3fx.ts）
      const VOID = [T.bowels + .4, T.bowels + 2.0]; // バウル・オブ・アゴニーのあと、床が消えて星空だけになる
      const isTank = ['pld', 'drk'].includes(opt.job);
      const hitMe = (name, dmg) => { // 当たった。被魔法ダメージ増加中なら即死
        if (now() < vulnUntil) hurt(`被魔法ダメージ増加中に${name}を受けた`);
        vulnUntil = now() + 4; healerHit(dmg, name);
      };
      const elementGoesOff = kind => {
        const hs = holders(kind).map(k => ({ ...pos(k) }));
        if (kind === 'fire'){
          if (hs.some(h => dist(h, S.player) <= FIRE_R)) hitMe('混沌の炎', DMG.fire);
          efx.add('fireball', { pts:hs, r:FIRE_R });
        } else {
          if (hs.some(h => { const d = dist(h, S.player); return d > DONUT_IN && d <= DONUT_OUT; })) hitMe('混沌の水', DMG.water);
          efx.add('waterRing', { pts:hs, r0:DONUT_IN, r1:DONUT_OUT });
        }
        sfx.big();
      };
      const crystalGoesOff = kind => {
        const c = CRY[kind], tg = nearest(c, 2), tp = tg.map(k => ({ ...pos(k) }));
        const isTarget = tg.includes(me);
        const hit = kind === 'fire'
          ? tp.filter(h => { const d = dist(h, S.player); return d > DONUT_IN && d <= DONUT_OUT; }).length
          : tp.filter(h => dist(h, S.player) <= WATER_CRY_R).length;
        if (hit && !isTarget) hurt(`${kind === 'fire' ? 'ほのお（炎クリスタル）' : 'つなみ（水クリスタル）'}に当たった（風が外れてしまう）`);
        else if (hit > 1) hurt(`${kind === 'fire' ? 'ほのお' : 'つなみ'}を2発受けた`);
        else if (hit) hitMe(kind === 'fire' ? 'ほのお' : 'つなみ', DMG.fire);
        if (kind === 'fire') efx.add('fireRing', { pts:tp, r0:DONUT_IN, r1:DONUT_OUT }); else efx.add('geyser', { pts:tp, r:WATER_CRY_R });
        sfx.boom();
      };
      const events: [number, () => void][] = [
        [T.battle, () => {
          // カオスに近い4人に決戦α、遠い4人に決戦β（cactbot：4 nearest players to Chaos）
          const ch = SLOTS.map(k => [k, dist(pos(k), CH)] as [string, number]).sort((a, b) => a[1] - b[1]).slice(0, 4).map(a => a[0]);
          const mine = ch.includes(me) ? 'chaos' : 'exdeath';
          if (mine !== myBoss(me)) hurt(`決戦：${myBoss(me) === 'chaos' ? 'カオス' : 'エクスデス'}の近くにいなかった`);
          fxFlash('#ffffff', .25, .15); sfx.big();
        }],
        [T.bowels, () => { healerHit(DMG.bowels, 'バウル・オブ・アゴニー'); efx.add('bowels'); fxShake(3, .25); sfx.big(); }],
        [T.thunderAoe, () => {
          const e = { x:EX.x, z:EX.z };
          if (dist(e, S.player) <= THUNDER_R) hurt('サンダガ（範囲）に当たった');
          else if (me === 'MT' && bots.some(b => dist(b, e) <= THUNDER_R)) hurt('範囲サンダガに味方を巻き込んだ（エクスデスを風の対角へ運べていない）');
          efx.add('dome', { ...e, r:THUNDER_R });
          sfx.boom();
        }],
        [T.short, () => elementGoesOff(shortKind)], [T.shortCry, () => crystalGoesOff(shortKind)],
        ...T.buster.map((bt, i) => [bt, () => {
          const e = { x:EX.x, z:EX.z }, tgt = nearest(e, 1)[0];
          if (tgt === me){
            if (me !== 'MT') hurt('サンダガ（強攻撃）を受けた（エクスデスに近すぎた）');
            else if (!hasInvuln()) hurt('無敵なしでサンダガ（強攻撃）を受けた');
          } else if (me === 'MT') hurt('サンダガ（強攻撃）を受けなかった（エクスデスの一番近くにいない）');
          else if (inBusterAoe(S.player, pos(tgt))) hurt('サンダガ（タンク強攻撃の範囲）に巻き込まれた');
          const q = { ...pos(tgt) };
          efx.add('cleave', { q, r:BUSTER_R });
          efx.add('bolt', q);
          sfx.big(); fxShake(2, .2);
        }] as [number, () => void]),
        ...T.impl.map((it, n) => [it, () => {
          if (n === 0 && me === 'ST' && dist(CH, CRY.wind) > 4) hurt('カオスを風クリスタルの上に運べていない');
          if (implHit(S.player, n)) hurt(`${p.vertical ? 'ヴァーティカル' : 'ホリゾンタル'}インプロージョンに当たった`);
          const c = chaosFrame(), front = (n === 0) === p.vertical;
          efx.add('fan', { x:c.x, z:c.z, centers:front ? [c.b, c.b + 180] : [c.b + 90, c.b - 90] });
          sfx.boom();
        }] as [number, () => void]),
        [T.long, () => elementGoesOff(longKind)], [T.longCry, () => crystalGoesOff(longKind)],
        [T.umbraCast, () => {
          const c = { x:CH.x, z:CH.z }, far = [...SLOTS].sort((a, b) => dist(pos(b), c) - dist(pos(a), c))[0];
          umbraAt = { ...pos(far) };
          if (me === 'D3' && far !== me) hurt('アンブラスマッシュを誘導できなかった（一番遠くにいない）');
          if (me !== 'D3' && far === me) hurt('アンブラスマッシュを誘導してしまった（D3 より遠くにいた）');
        }],
        [T.umbra, () => { CH.x = umbraAt.x; CH.z = umbraAt.z; efx.add('umbra', { ...umbraAt, r:6 }); sfx.big(); fxShake(3, .3); }],
        [T.vacuum, () => {
          const e = { x:EX.x, z:EX.z }, d = { x:S.player.x - e.x, z:S.player.z - e.z }, L = Math.hypot(d.x, d.z) || 1;
          if (me === 'MT' && dist(e, CRY.wind) > 4) hurt('エクスデスを風クリスタルの上に運べていない');
          const toEx = { x:-d.x / L, z:-d.z / L }, f = S.face || { x:0, z:-1 };
          const facing = f.x * toEx.x + f.z * toEx.z > 0; // エクスデスの方を向いている（正面で受ける）
          const ok = p.tail[me] ? facing : !facing;
          kb = { from:{ ...S.player }, dir:{ x:d.x / L, z:d.z / L }, len:ok ? KB / 2 : KB * 2, t:now() };
          if (!ok) hurt(p.tail[me] ? '混沌の逆風：真空波を背面で受けた（場外へ）' : '混沌の風：真空波を正面で受けた（場外へ）');
          windGone = true;
          efx.add('wind', e); sfx.big(); fxShake(3, .3);
        }],
        [T.tornado, () => {
          const lbOk = isTank ? (lbAt <= now() && now() - lbAt <= LB_DUR) : true;
          if (!lbOk) hurt('タンク LB3 なしでたつまき（8人分）を受けた');
          else healerHit(DMG.tornado, 'たつまき');
          efx.add('tornado', { pts:[['MT', 'ST'], ['H1', 'H2'], ['D1', 'D2'], ['D3', 'D4']].map(([a, b]) => ({ x:(pos(a).x + pos(b).x) / 2, z:(pos(a).z + pos(b).z) / 2 })) });
          fxShake(4, .3); sfx.big();
        }],
      ];
      const fired: boolean[] = [];
      // ---- 表示 ----
      const sec = u => Math.max(0, Math.ceil(u - now()));
      const tm = u => { const s = sec(u); return s >= 60 ? '1m' : String(s); };
      return {
        end:T.end, t0:0,
        intro:`あなたは ${me}（${myBoss(me) === 'chaos' ? 'カオス' : 'エクスデス'}側）`,
        casts:[
          { name:'決戦', start:0, len:T.battle },
          { name:'バウル・オブ・アゴニー', start:T.bowels - 5, len:5 },
          { name:'サンダガ', start:T.thunderAoe - THUNDER_CAST, len:THUNDER_CAST },
          { name:'サンダガ', start:T.buster[0] - 5, len:5 },
          { name:p.vertical ? 'ヴァーティカルインプロージョン' : 'ホリゾンタルインプロージョン', start:T.implCast, len:T.impl[0] - T.implCast },
          { name:'アンブラスマッシュ', start:T.umbraCast, len:T.umbra - T.umbraCast },
          { name:'真空波', start:T.vacuumCast, len:T.vacuum - T.vacuumCast },
        ],
        // 上の段は短く（長いと折り返して詠唱バーと重なる）
        progress: t => t < T.bowels ? '決戦' : t < T.short ? 'デバフ' : t < T.impl[0] - 6 ? 'サンダガ' : t < T.impl[1] ? 'インプロ' : t < T.umbraCast ? '遅い属性' : '真空波',
        bosses,
        target0: myBoss(me),
        buttons: isTank ? { early:'ターゲット切替', late:'LB3' } : { early:'ターゲット切替' },
        say(kind){
          if (kind === 'early') switchTarget();
          if (kind === 'late' && isTank && !lbUsed && S.phase === 'run'){
            lbUsed = true; lbAt = now(); A.actAt = S.t; sfx.buff(); fxFlash('#ffd84a', .35, .3);
            popup('LB3 ' + LB3_NAME[opt.job], 'crit');
          }
        },
        fieldMarker:'nw',
        mySpot: t => spot(me, t),
        debug:{ p, T, pos, spot, CRY, bosses, implHit, CH, EX },
        status(t){
          const s = [];
          if (battleOn(t)) s.push({ at:T.battle, icon:myBoss(me) === 'chaos' ? 'heroA' : 'heroB', glyph:myBoss(me) === 'chaos' ? 'α' : 'β', color:myBoss(me) === 'chaos' ? '#e8283a' : '#d8a82a', name:myBoss(me) === 'chaos' ? '決戦α［被］' : '決戦β［被］', sec:tm(T.unbattle) });
          if (t >= T.bowels){
            if (p.fire.includes(me) && t < until('fire')) s.push({ at:T.bowels, icon:'fireP3', glyph:'炎', color:'#ff5a2a', name:'混沌の炎', sec:tm(until('fire')) });
            if (p.water.includes(me) && t < until('water')) s.push({ at:T.bowels, icon:'waterP3', glyph:'水', color:'#2ab8d8', name:'混沌の水', sec:tm(until('water')) });
            if (!windGone) s.push(p.tail[me] ? { at:T.bowels, icon:'windFront', glyph:'逆', color:'#2a9a6a', name:'混沌の逆風（正面で受ける）', sec:tm(T.bowels + 68) } : { at:T.bowels, icon:'windBack', glyph:'風', color:'#3ac87a', name:'混沌の風（背面で受ける）', sec:tm(T.bowels + 68) });
          }
          return s;
        },
        tick(t){
          const dt = Math.min(.05, Math.max(0, t - (this._lt ?? t))); this._lt = t;
          bots.forEach(b => {
            const g = spot(b.k, botTime(b.k, t)), d = dist(b, g), step = (p.blaster && t >= BL_GO ? 24 : BOT_SPEED) * dt;
            if (d > .05){ const k = Math.min(1, step / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; }
          });
          // ボス：ヘイトのタンクを追いかけて、その方を向く（詠唱中は止まる）
          [CH, EX].forEach(b => {
            if (casting(b, t)) return;
            const tk = pos(b.tank), d = dist(b, tk);
            // 範囲サンダガの詠唱から、2連サンダガが終わるまでは歩かない（その場で詠唱。向きだけ変える）
            if (t >= T.thunderAoe - THUNDER_CAST && t < T.buster[1]){ if (d > .3) b.face = { x:(tk.x - b.x) / d, z:(tk.z - b.z) / d }; return; }
            if (d > BOSS_TC){ const step = Math.min(BOSS_SPEED * dt, d - BOSS_TC); b.x += (tk.x - b.x) / d * step; b.z += (tk.z - b.z) / d * step; }
            if (d > .3) b.face = { x:(tk.x - b.x) / d, z:(tk.z - b.z) / d };
          });
          if (!implFrame && t >= T.implCast) implFrame = { x:CH.x, z:CH.z, b:bearingOf(CH.face) };
          if (kb){ // ノックバック（0.4秒）
            const k = Math.min(1, (t - kb.t) / .4), q = add(kb.from, kb.dir, kb.len * k), r = Math.hypot(q.x, q.z), R = 19.5;
            S.player.x = r > R ? q.x * R / r : q.x; S.player.z = r > R ? q.z * R / r : q.z;
            if (k >= 1) kb = null;
          }
          events.forEach((e, i) => { if (!fired[i] && t >= e[0]){ fired[i] = true; e[1](); } });
        },
        safeActive: t => t >= .5,
        safe(x, z, t){ const g = spot(me, t); return Math.hypot(x - g.x, z - g.z) <= 2; },
        guide(t){ const g = spot(me, t); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
        drawFloor(t){ if (t >= VOID[0] && t < VOID[1]) drawVoid(Math.min(1, (t - VOID[0]) / .2, (VOID[1] - t) / .3)); },
        draw(t){
          // 範囲サンダガの詠唱中：画面の外（北）にある「無」から、黒く太いもやの触手がうねりながらエクスデスへ伸びて力をもらう
          if (t >= T.thunderAoe - THUNDER_CAST && t < T.thunderAoe + .3){
            const k = Math.min(1, (t - (T.thunderAoe - THUNDER_CAST)) / 1.2), f = t < T.thunderAoe ? 1 : 1 - (t - T.thunderAoe) / .3, E = { x:px(EX.x), z:px(EX.z) };
            [[-30, 0], [10, 1.7], [42, 3.1]].forEach(([ox, ph]) => {
              const S0 = { x:px(0) + ox, z:-6 }, L = Math.hypot(E.x - S0.x, E.z - S0.z), ux = (E.x - S0.x) / L, uz = (E.z - S0.z) / L, len = L * k;
              for (let s2 = 0; s2 < len; s2 += 1.5){
                const q = s2 / L, w = Math.sin(q * 7 + t * 2.5 + ph) * 10 * Math.sin(q * Math.PI), x = S0.x + ux * s2 - uz * w, z = S0.z + uz * s2 + ux * w, th = 7 * (1 - q * .75);
                alpha(.35 * f, () => disc(Math.round(x), Math.round(z), Math.round(th + 2), '#2a2a6a'));
                alpha(.75 * f, () => disc(Math.round(x), Math.round(z), Math.round(th), (s2 / 6 | 0) % 2 ? '#0a0c22' : '#141a3a'));
              }
            });
          }
          targetLast(bosses(t)).forEach(drawBossArt);
          if (t >= VOID[1]){ // クリスタルは床が戻ったときに出ている。ボスより手前に描く（風の上にカオスが乗るので）
            if (t < T.vacuum + 1) drawCrystal('wind', CRY.wind);
            if (t < (shortKind === 'water' ? T.shortCry : T.longCry) + .3) drawCrystal('water', CRY.water);
            if (t < (shortKind === 'fire' ? T.shortCry : T.longCry) + .3) drawCrystal('fire', CRY.fire);
          }
          efx.draw();
          // たつまき（2人頭割り）の目印：真空波で飛んだあと、頭上に赤紫の2つの玉
          // たつまき（2人頭割り）の目印：P5 ミッシングと同じ頭割りマーカー（4方向から内向きの「く」の字）
          if (t >= T.vacuum + .4 && t < T.tornado){
            const X = px(S.player.x), Z = px(S.player.z), c = (Math.floor(performance.now() / 160) & 1) ? P.exaHi : P.exa;
            [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dz]) => { for (let i = 0; i < 6; i++){ const bx = X + dx * (10 + i), bz = Z + dz * (10 + i); rect(bx - dz * i - 1, bz - dx * i - 1, 2, 2, c); rect(bx + dz * i - 1, bz + dx * i - 1, 2, 2, c); } });
          }
          // 向き（真空波の判定に使う）：足元の黄色い三角
          const f = S.face || { x:0, z:-1 }, X = px(S.player.x), Z = px(S.player.z);
          for (let i = 0; i < 4; i++) line(X + f.x * (12 + i) - f.z * (3 - i), Z + f.z * (12 + i) + f.x * (3 - i), X + f.x * (12 + i) + f.z * (3 - i), Z + f.z * (12 + i) - f.x * (3 - i), '#ffe070');
        },
      };
    }
  };
})();


export { P3A0, P3B };
// じしん＆ブラックホール（mech_p3c.ts）が使う共通の部品
export { inBusterAoe, BUSTER_R, dirOf, at, norm, segDist, CHAOS_SIDE, BOSS_TC, BOSS_COL, drawBossArt, numGlyph, wip };
