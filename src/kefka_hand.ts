// @ts-nocheck
// =====================================================================
// ケフカ（P1・P4）・ゴッドケフカ（P2）・カオスケフカ（P5）の手描きのドット絵（2026-10-17。ユーザーが ケフカ C・ゴッドケフカ G・カオスケフカ C を選んだ）
// P3・P4 のボス（p4boss.ts のカオス・エクスデス・ネオエクスデス）と同じ絵柄：正面向き、材質ごとに 2〜3 段の色、濃い輪郭、約 50 ドット
// 元にした姿：ケフカ＝FF6 の道化、ゴッドケフカ＝FF6 の最終形態（白い翼・紫の肌・金の髪・赤い布）、カオスケフカ＝黄金のレガシーのイラスト（紫の魔人・コウモリの翼・白いたてがみと角・赤い腰布・杖）
// =====================================================================
import { mk } from './p4boss.js';

// ---- 色 ----
const K = { hair:'#f0c850', hairD:'#c08a20', face:'#fff6ee', faceD:'#d8ccc4', red:'#d8283a', redD:'#8a1426', yel:'#f0c030', yelD:'#b8801a',
  pur:'#7a3a9a', purD:'#4a1a6a', purL:'#b07ad8', dot:'#ff5a7a', grn:'#3a9a5a', blu:'#c8d8ff', bluD:'#7a9ae0', lip:'#6a2a7a', eye:'#120a14', glove:'#f0d860' };
const G = { skin:'#8a7aa8', skinD:'#5a4a7a', skinL:'#b8a8d0', wing:'#f4f0fa', wingM:'#d0c8e8', wingD:'#9a8ab8', dk:'#4a3a6a', dkD:'#2a1a40', hair:'#f0c850', hairD:'#b8862a',
  cloth:'#c83a6a', clothD:'#7a1a3a', clothL:'#f07a9a', halo:'#ff8ac8' };
const C = { skin:'#7a4aa0', skinD:'#4a2a6a', skinL:'#a87ad0', wing:'#3a3a7a', wingD:'#22224a', wingL:'#6a6ab0', mane:'#e8f0ff', maneD:'#9ab0d8', horn:'#f0e8d8', hornD:'#b0a090',
  cloth:'#b82a3a', clothD:'#6a1420', gold:'#e8c04a', goldD:'#a87a2a', feath:'#7ab8ff', feathD:'#3a6ad0', mask:'#d8d0e0', staff:'#c87a8a', star:'#ffe070', heart:'#ff7ab0' };
const mirror = (pts, w) => pts.map(([x, y]) => [w - x, y]);

// 赤と黄の縞のひだえり
function ruff(P, cx, y){ for (let i = 0; i < 9; i++){ const x = cx - 8 + i * 2; P.poly([[cx, y + 1], [x, y - 1 + (i % 2)], [x + 2, y + 2]], i % 2 ? K.yel : K.red); } }
// そで：左（向かって左）は紫に赤い水玉、右は赤
function sleeveL(P, x, y){ P.ell(x, y, 3, 4, K.pur); P.px(x - 1, y - 2, K.dot); P.px(x + 1, y, K.dot); P.px(x - 1, y + 2, K.dot); P.px(x - 2, y + 1, K.purD); }
const KEFKA = {
  // C：頭が大きめのちび。片手を口に当てて笑う
  C:{ w:40, h:46, draw(P){
    P.poly([[10, 22], [30, 22], [36, 44], [4, 44]], K.yel); P.poly([[4, 44], [9, 32], [12, 44]], K.yelD); P.poly([[36, 44], [31, 32], [28, 44]], K.yelD);
    P.rect(15, 36, 4, 7, K.red); P.rect(21, 36, 4, 7, K.red); P.rect(13, 42, 6, 3, K.yel); P.rect(21, 42, 6, 3, K.yel);
    P.rect(13, 24, 14, 13, K.pur); [[15, 27], [21, 29], [17, 32], [23, 33]].forEach(([x, y]) => P.rect(x, y, 2, 2, K.dot)); P.rect(13, 33, 14, 2, K.yel);
    sleeveL(P, 10, 27); P.disc(8, 33, 2, K.glove);
    P.poly([[27, 25], [31, 22], [29, 18], [26, 19]], K.red); P.disc(27, 17, 2, K.glove); // 口元へ上げた手
    ruff(P, 20, 22);
    // 大きな頭
    P.poly([[20, 4], [7, 0], [3, 5], [15, 6]], K.blu); P.line(19, 4, 6, 2, K.bluD); P.poly([[21, 4], [32, 1], [37, 6], [25, 7]], K.red); P.line(23, 5, 34, 3, K.grn);
    P.poly([[12, 12], [11, 5], [15, 7], [20, 2], [25, 7], [29, 5], [28, 12]], K.hair); P.line(13, 6, 16, 10, K.hairD); P.line(27, 6, 24, 10, K.hairD);
    P.ell(20, 14, 6, 6, K.face); P.line(14, 16, 15, 19, K.faceD);
    P.rect(16, 11, 1, 2, K.red); P.rect(23, 11, 1, 2, K.red); P.px(17, 13, K.eye); P.px(23, 13, K.eye);
    P.rect(17, 17, 6, 2, K.lip); P.rect(18, 17, 4, 1, '#ffffff');
    P.outline('#0a0a18');
  } },
};

const GOD = {
  // G：F を直したもの。白い翼の先が外へ反る（角のように）、コウモリの翼を大きく、顔と髪を大きめに
  G:{ w:60, h:74, draw(P){ godDmu(P, { cx:30, wingUp:1, batSpan:1, chubby:0, pose:'down' }); } },
};


// 絶妖星乱舞のゴッドケフカ（G〜J の共通の描き方）
//   o.cx：真ん中、wingUp：白い翼の高さの倍率、batSpan：コウモリの翼の広がりの倍率、chubby：1 で太め、pose：'down'（腕を下ろす）| 'claw'（片手を上げる）| 'open'（両腕を広げる）
function godDmu(P0, o){
  // 白い翼の先まで入るように、全体を下へ dy ずらして描く
  const dy = 9, P = { ...P0, px:(x, y, c) => P0.px(x, y + dy, c), rect:(x, y, w, h, c) => P0.rect(x, y + dy, w, h, c), disc:(x, y, r, c) => P0.disc(x, y + dy, r, c),
    ell:(x, y, rx, ry, c) => P0.ell(x, y + dy, rx, ry, c), line:(a, b, c2, d, c) => P0.line(a, b + dy, c2, d + dy, c), poly:(pts, c) => P0.poly(pts.map(([x, y]) => [x, y + dy]), c), outline:c => P0.outline(c) };
  const cx = o.cx, S = '#9a826c', Sd = '#665240', Sl = '#c4ac92', W = '#f6f2f6', Wm = '#dcd4e0', Wd = '#a89cb0', B = '#3a2a3a', Bd = '#1e141e', Bl = '#5e4a5c';
  const R = '#7a1a2a', Rd = '#4a0e18', Rl = '#b04050', ch = o.chubby, top = 4, wu = o.wingUp, bs = o.batSpan;
  const mx = pts => pts.map(([x, y]) => [2 * cx - x, y]);
  // 上の白い翼：付け根から上へ伸び、先は外へ反って角のようにとがる。内側に羽根の重なり
  const wy = y => Math.round(top + (y - top) * 1) , H = Math.round(26 * wu);
  const up = [[cx - 5, 20], [cx - 9, 20 - H * .45], [cx - 14, 20 - H * .8], [cx - 21, 20 - H], [cx - 24, 20 - H + 2], [cx - 19, 20 - H * .7], [cx - 17, 20 - H * .35], [cx - 18, 22], [cx - 22, 30], [cx - 26, 38], [cx - 19, 34], [cx - 14, 28], [cx - 8, 25]];
  const upY = up;
  P.poly(upY, W); P.poly(mx(upY), W);
  for (let i = 0; i < 6; i++){ const k = i / 6, x = cx - 9 - k * 13, y = Math.max(1, Math.round(20 - H * (.35 + k * .55))); P.line(x, y, x + 3, y + 3, Wm); P.line(2 * cx - x, y, 2 * cx - x - 3, y + 3, Wm); }
  [[cx - 6, 21, cx - 20, 20 - H + 3], [cx - 7, 23, cx - 22, 31], [cx - 7, 24, cx - 24, 36]].forEach(([a, b, c, d]) => { P.line(a, b, c, d, Wd); P.line(2 * cx - a, b, 2 * cx - c, d, Wd); });
  // 下の暗いコウモリの翼：左右へ、先がとがって垂れる
  const s2 = v => Math.round(v * bs);
  const bat = [[cx - 4, 28], [cx - s2(12), 27], [cx - s2(20), 29], [cx - s2(26), 33], [cx - s2(24), 37], [cx - s2(22), 44], [cx - s2(18), 38], [cx - s2(15), 46], [cx - s2(12), 39], [cx - s2(8), 43], [cx - 6, 35]];
  P.poly(bat, B); P.poly(mx(bat), B);
  [[cx - 5, 29, cx - s2(25), 34], [cx - 5, 29, cx - s2(16), 45], [cx - 5, 30, cx - s2(9), 42]].forEach(([a, b, c, d]) => { P.line(a, b, c, d, Bl); P.line(2 * cx - a, b, 2 * cx - c, d, Bl); });
  // 腕
  const arm = (s, kind) => {
    const x0 = cx + s * (6 + ch), y0 = 22;
    if (kind === 'down'){ P.line(x0, y0, x0 + s * 5, y0 + 9, S); P.line(x0, y0 + 1, x0 + s * 5, y0 + 10, Sd); P.disc(x0 + s * 6, y0 + 11, 1, Sl); }
    if (kind === 'open'){ P.line(x0, y0, x0 + s * 11, y0 + 4, S); P.line(x0, y0 + 1, x0 + s * 11, y0 + 5, Sd); [[0, -2], [2, -1], [2, 1]].forEach(([dx, dy]) => P.line(x0 + s * 11, y0 + 4, x0 + s * (13 + dx), y0 + 4 + dy, Sl)); }
    if (kind === 'claw'){ P.line(x0, y0, x0 + s * 7, y0 - 8, S); P.line(x0 + s, y0, x0 + s * 8, y0 - 7, Sd); [[-1, -4], [1, -4], [3, -3], [4, -1]].forEach(([dx, dy]) => P.line(x0 + s * 7, y0 - 8, x0 + s * (7 + dx), y0 - 8 + dy, Sl)); }
  };
  arm(-1, o.pose === 'open' ? 'open' : 'down'); arm(1, o.pose === 'down' ? 'down' : o.pose === 'open' ? 'open' : 'claw');
  // 胴：やせた筋肉（太めはおなかが丸い）
  if (ch){ P.ell(cx, 27, 8, 7, S); P.ell(cx - 3, 24, 3, 2, Sl); P.line(cx, 21, cx, 33, Sd); P.line(cx - 5, 28, cx + 5, 28, Sd); }
  else { P.poly([[cx - 6, 19], [cx + 6, 19], [cx + 5, 32], [cx - 5, 32]], S); P.line(cx, 20, cx, 31, Sd); [23, 26].forEach(y => { P.line(cx - 4, y, cx - 1, y + 1, Sd); P.line(cx + 4, y, cx + 1, y + 1, Sd); }); P.px(cx - 3, 21, Sl); P.px(cx + 3, 21, Sl); P.px(cx - 2, 29, Sl); P.px(cx + 2, 29, Sl); }
  // 脚：はだしの長めの脚が2本。少し開いて、向かって左はまっすぐ、右はひざを曲げて足先を後ろへ（ユーザーの画像 2026-10-17）
  const lw = 2 + ch, bot = ch ? 60 : 64;
  // 左脚（まっすぐ下へ。足先はとがる）
  { const x = cx - 3 - ch; P.poly([[x - lw, 38], [x + lw, 38], [x + lw - 1, 52], [x + 1, bot - 3], [x - 1, bot], [x - lw, 52]], S); P.line(x - lw + 1, 40, x - lw + 1, 51, Sd); P.px(x, 50, Sl); P.px(x - 1, bot - 1, Sd); }
  // 右脚（ひざを少し前へ出し、すねは後ろへ。足先は左より上）
  { const x = cx + 3 + ch; P.poly([[x - lw, 38], [x + lw, 38], [x + lw + 1, 47], [x + lw, 50], [x + 1, bot - 7], [x - 1, bot - 5], [x - lw + 1, 49], [x - lw, 46]], S); P.line(x + lw, 40, x + lw + 1, 47, Sd); P.px(x + 1, 47, Sl); P.px(x, bot - 6, Sd); }
  // 腰に巻いた暗い赤の布：腰から太ももの上まで巻き付き、端が向かって左へ大きく垂れて流れる（I は右へなびく）
  const fl = o.pose === 'claw' ? -1 : 1;
  P.poly([[cx - 7 - ch, 30], [cx + 7 + ch, 30], [cx + 8 + ch, 36], [cx + 6 + ch, 41], [cx - 6 - ch, 41], [cx - 8 - ch, 36]], R);
  P.line(cx - 7 - ch, 34, cx + 7 + ch, 32, Rd); P.line(cx - 7 - ch, 38, cx + 7 + ch, 37, Rd); P.line(cx - 5, 31, cx + 5, 31, Rl); P.line(cx - 5, 36, cx + 3, 35, Rl);
  const fx = x => fl > 0 ? x : 2 * cx - x;
  const drape = [[cx - 5, 36], [cx - 10 - ch, 38], [cx - 16 - ch, 41], [cx - 20 - ch, 45], [cx - 18 - ch, 47], [cx - 14 - ch, 45], [cx - 9 - ch, 44], [cx - 5, 41]].map(([x, y]) => [fx(x), y]);
  P.poly(drape, R); P.line(fx(cx - 6), 38, fx(cx - 18 - ch), 45, Rd); P.line(fx(cx - 6), 37, fx(cx - 15 - ch), 41, Rl); P.px(fx(cx - 19 - ch), 46, '#e8d8c8');
  // 頭（ユーザーの画像 2026-10-17）：長い金髪。前髪と横の髪が顔の向かって右側にかかり、肩まで垂れる。
  //   頭の上で髪をまとめた所から、大きな桃色の房が上へ反って後ろ（向かって左）へ流れる。顔は左側だけ見え、赤い隈取り
  const hy = 9, hr = ch ? 5 : 4, HA = G.hair, HD = G.hairD, PK = '#d8507a', PKD = '#a02a50', PKL = '#ff9ab8';
  P.poly([[cx - 2, hy - 3], [cx - 7, hy - 9], [cx - 12, hy - 11], [cx - 14, hy - 8], [cx - 10, hy - 7], [cx - 6, hy - 4], [cx - 3, hy - 1]], PK); // 桃色の房（上へ反って後ろへ）
  P.line(cx - 3, hy - 2, cx - 12, hy - 9, PKD); P.line(cx - 4, hy - 4, cx - 10, hy - 9, PKL); P.px(cx - 13, hy - 9, PKL);
  P.disc(cx, hy - 2, 2, HA); P.px(cx + 1, hy - 3, HD); // まとめた髪
  P.ell(cx, hy + 5, hr - 1, hr, '#f0e8e0'); if (ch){ P.px(cx - 3, hy + 7, '#e8a8b0'); }
  P.px(cx - 2, hy + 3, '#c8203a'); P.px(cx - 2, hy + 4, '#120a14'); P.px(cx - 3, hy + 4, '#c8203a'); // 見えている左目と隈取り
  P.line(cx - 2, hy + 7, cx + 1, hy + 7, '#6a2a3a'); P.px(cx - 1, hy + 8, '#f0f0f0');
  P.poly([[cx - 5, hy + 3], [cx - 4, hy - 1], [cx, hy - 1], [cx + 4, hy], [cx + 6, hy + 4], [cx + 6, hy + 12], [cx + 8, hy + 18], [cx + 5, hy + 16], [cx + 3, hy + 10], [cx + 1, hy + 5], [cx - 2, hy + 2]], HA); // 前髪と右に垂れる髪
  P.line(cx, hy, cx + 4, hy + 8, HD); P.line(cx + 3, hy + 1, cx + 6, hy + 14, HD); P.line(cx - 3, hy, cx - 1, hy + 2, HD);
  P.poly([[cx - 5, hy + 1], [cx - 6, hy + 8], [cx - 7, hy + 13], [cx - 5, hy + 10], [cx - 4, hy + 5]], HA); P.line(cx - 6, hy + 4, cx - 6, hy + 11, HD); // 左の横の髪
  P.outline('#0a0a18');
}

// ---- カオスケフカ（黄金のレガシー） ----
function chaosBody(P, cx, y, staffSide = -1, staffUp = false){
  // 脚（紫の筋肉・金の脛当て）と赤い腰布
  P.poly([[cx - 6, y + 22], [cx - 2, y + 22], [cx - 3, y + 34], [cx - 7, y + 34]], C.skin); P.poly([[cx + 2, y + 22], [cx + 6, y + 22], [cx + 7, y + 34], [cx + 3, y + 34]], C.skin);
  P.rect(cx - 8, y + 33, 5, 3, C.gold); P.rect(cx + 3, y + 33, 5, 3, C.gold); P.px(cx - 6, y + 34, C.goldD); P.px(cx + 5, y + 34, C.goldD);
  P.poly([[cx - 7, y + 18], [cx + 7, y + 18], [cx + 10, y + 30], [cx + 3, y + 26], [cx, y + 32], [cx - 4, y + 26], [cx - 11, y + 31]], C.cloth);
  P.line(cx - 5, y + 20, cx - 9, y + 29, C.clothD); P.line(cx + 5, y + 20, cx + 8, y + 28, C.clothD);
  // 胴（紫の筋肉）・金と赤の首飾り
  P.poly([[cx - 8, y + 8], [cx + 8, y + 8], [cx + 6, y + 19], [cx - 6, y + 19]], C.skin); P.line(cx, y + 9, cx, y + 18, C.skinD); P.line(cx - 5, y + 13, cx + 5, y + 13, C.skinD);
  P.px(cx - 4, y + 10, C.skinL); P.px(cx + 4, y + 10, C.skinL); P.px(cx - 3, y + 16, C.skinL); P.px(cx + 3, y + 16, C.skinL);
  P.poly([[cx - 6, y + 7], [cx + 6, y + 7], [cx + 4, y + 10], [cx - 4, y + 10]], C.gold); P.px(cx, y + 9, C.cloth); P.px(cx - 2, y + 9, '#3a7ad8'); P.px(cx + 2, y + 9, '#3a7ad8');
  // 肩のどくろ
  P.disc(cx - 9, y + 9, 2, C.mask); P.px(cx - 10, y + 9, C.skinD); P.px(cx - 8, y + 9, C.skinD); P.disc(cx + 9, y + 9, 2, C.mask); P.px(cx + 8, y + 9, C.skinD); P.px(cx + 10, y + 9, C.skinD);
  // 腕と杖（ハートと星の先）
  const sx = cx + staffSide * 13;
  P.line(cx + staffSide * 9, y + 11, sx, y + (staffUp ? 6 : 16), C.skin); P.line(cx + staffSide * 9, y + 12, sx, y + (staffUp ? 7 : 17), C.skinD);
  P.line(cx - staffSide * 9, y + 11, cx - staffSide * 12, y + 19, C.skin); P.disc(cx - staffSide * 12, y + 20, 1, C.skinL);
  const top = staffUp ? y - 10 : y - 2, bot = y + 36;
  P.line(sx, top, sx + staffSide * 3, bot, C.staff); P.disc(sx, top - 1, 2, C.heart); P.px(sx, top - 4, C.star); P.px(sx - 1, top - 3, C.star); P.px(sx + 1, top - 3, C.star);
  chaosHead(P, cx, y);
}
// 頭：白いたてがみ・骨の角・仮面の顔
function chaosHead(P, cx, y){
  P.poly([[cx - 9, y + 6], [cx - 11, y - 2], [cx - 7, y - 1], [cx - 6, y - 8], [cx - 2, y - 4], [cx, y - 10], [cx + 2, y - 4], [cx + 6, y - 8], [cx + 7, y - 1], [cx + 11, y - 2], [cx + 9, y + 6]], C.mane);
  [[-8, 0], [-4, -4], [0, -7], [4, -4], [8, 0]].forEach(([dx, dy]) => P.line(cx + dx, y + dy, cx + dx * .6, y + 5, C.maneD));
  P.poly([[cx - 4, y - 1], [cx - 9, y - 8], [cx - 10, y - 14], [cx - 7, y - 9], [cx - 3, y - 3]], C.horn); P.poly(mirror([[cx - 4, y - 1], [cx - 9, y - 8], [cx - 10, y - 14], [cx - 7, y - 9], [cx - 3, y - 3]], cx * 2), C.horn);
  P.line(cx - 9, y - 9, cx - 10, y - 13, C.hornD); P.line(cx + 9, y - 9, cx + 10, y - 13, C.hornD);
  P.ell(cx, y + 2, 3, 4, C.mask); P.px(cx - 1, y + 1, '#ff3a3a'); P.px(cx + 1, y + 1, '#ff3a3a'); P.px(cx, y - 1, '#3ad0ff'); P.line(cx - 1, y + 4, cx + 1, y + 4, C.skinD);
}
// コウモリの翼（s：向き、y0：付け根の高さ、span：広がり）
function batWing(P, x0, y0, s, span, h){
  const pts = [[x0, y0], [x0 + s * span * .45, y0 - h], [x0 + s * span, y0 - h * .6], [x0 + s * span * .92, y0 + h * .2], [x0 + s * span * .7, y0 + h * .05], [x0 + s * span * .55, y0 + h * .35], [x0 + s * span * .35, y0 + h * .15], [x0 + s * span * .2, y0 + h * .4]];
  P.poly(pts, C.wing); P.line(x0, y0, x0 + s * span * .45, y0 - h, C.wingL); P.line(x0 + s * span * .45, y0 - h, x0 + s * span, y0 - h * .6, C.wingL);
  [[.92, .2], [.55, .35], [.2, .4]].forEach(([a, b]) => P.line(x0 + s * span * .45, y0 - h, x0 + s * span * a, y0 + h * b, C.wingD));
}
// 腰のうしろの羽根の扇（青と白のとげ）
function featherFan(P, x0, y0, s){ for (let i = 0; i < 5; i++){ const a = (-.2 + i * .25) * Math.PI, x = x0 + s * Math.cos(a) * 9, y = y0 + Math.sin(a) * 7; P.line(x0, y0, x, y, i % 2 ? C.feath : C.mane); P.line(x0, y0 + 1, x, y + 1, C.feathD); } }
const CHAOS = {
  // C：翼をたたみぎみにした縦長の姿。たてがみと角を大きく
  C:{ w:54, h:58, draw(P){
    batWing(P, 22, 22, -1, 16, 16); batWing(P, 32, 22, 1, 16, 16);
    featherFan(P, 19, 38, -1); featherFan(P, 35, 38, 1);
    chaosBody(P, 27, 18, -1, true);
    P.outline('#0a0a18');
  } },
};

const SETS = { kefka:KEFKA, god:GOD, chaos:CHAOS };
const cache = {};
// id：'kefka' | 'god' | 'chaos'。案（v）はユーザーが選んだもの
const PICK = { kefka:'C', god:'G', chaos:'C' };
function handSprite(id, v = PICK[id]){
  const key = id + v;
  if (!cache[key]){ const b = SETS[id][v]; const P = mk(b.w, b.h, 1); b.draw(P); cache[key] = P.c; }
  return cache[key];
}
export { handSprite };
