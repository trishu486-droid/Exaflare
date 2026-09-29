import { S, pick, shuffle } from './state.js';
import { opt } from './store.js';
import { sfx } from './audio.js';
import { healerHit } from './action.js';
import { FXC, FXK, fxAdd, fxFlash, fxParts, fxShake } from './fx.js';
import { P, PPY, alpha, disc, glyph, hurt, px, rect, ring } from './gfx.js';

// =====================================================================
// ギミック4：ミッシング（紫の穴が2か所ずつ × 4ラウンド + オレンジのAOE）
// 紫の穴：予兆の約5.65秒後に床が消え、以後そこに入ると即死。出方の規則（実戦ログ・raidplan・ヤーン速報の4例から）
//   1回目 中央＋斜めX → 2回目 Xの反対側＋Xから反時計回り90°の斜め → 3回目 残りの斜め＋東西南北（2択） → 4回目 残りの東西南北から2つ
// オレンジ：頭割りのたびに、パーティに一番近いマーカー位置へ置かれるAOE。穴と同時に着弾して消える
// 処理法：ヤーン速報の脳死法。2の内側 → 頭割りが見えたら時計回りに 3 → 4 → 1 の内側
//   4回目は安地の東西南北が遠いことがあるので、隣の数字マーカーの内側（隙間。穴は届かない）へ逃げる
// =====================================================================
const MISS = (() => {
  const G = 13.5, HOLE_R = 8, ORANGE_R = 8, IN = 6.75;
  const ROUND_AT = [10.0, 18.19, 26.35, 34.49], VANISH = 5.65, STACK_AT = 5.12, STACK_R = 6; // 頭割りは穴より少し早く着弾
  // ヒーラーの被ダメージ：練習では相方ヒーラーがいないので実機より軽くする。
  // 「回復と軽減を両方きちんと使って、ぎりぎり耐える」ライン（どちらかを使わないと倒れる）。学者は回復が少ないぶん軽め
  const MISS_EASE = () => opt.job === 'sch' ? .48 : .55;
  // 方角（北から時計回りの角度）→ 格子の位置
  const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
  const cell = d => d === 'MID' ? [0, 0] : [Math.round(Math.sin(DIRS.indexOf(d) * Math.PI / 4)), Math.round(-Math.cos(DIRS.indexOf(d) * Math.PI / 4))];
  const rot = (d, deg) => DIRS[(DIRS.indexOf(d) + deg / 45 + 8) % 8];
  // オレンジが置かれるマーカー位置：東西南北（13.5）と数字マーカー（内側）
  const MARKS = [[0, -G], [G, 0], [0, G], [-G, 0], [-IN, -IN], [IN, -IN], [IN, IN], [-IN, IN]];
  const INNER = { NE:[IN, -IN], SE:[IN, IN], SW:[-IN, IN], NW:[-IN, -IN] };
  const inHole = (x, z, [tx, tz]) => (x - tx * G) ** 2 + (z - tz * G) ** 2 <= HOLE_R * HOLE_R;
  return {
    id:'miss', name:'ミッシング', sub:'P5 時間切れ前', view:24, start:{ x:IN, z:-IN },
    gen(){
      const x = pick(['NE', 'SE', 'SW', 'NW']);
      const c3 = rot(x, pick([135, -135])), left = shuffle(['N', 'E', 'S', 'W'].filter(c => c !== c3));
      const rounds = [['MID', x], [rot(x, 180), rot(x, -90)], [rot(x, 90), c3], [left[0], left[1]]];
      // 4回目の逃げ先：北が残っていれば時計回りに 2 の内側、北が消えていれば 4 の内側へ戻る
      const last = c3 === 'N' ? 'SW' : 'NE';
      return { rounds:rounds.map(r => r.map(cell)), route:['NE', 'SE', 'SW', 'NW', last] };
    },
    create(d){
      const gone = [], warn = [], oranges = [];
      const rounds = ROUND_AT.map((at, r) => ({ at, tiles:d.rounds[r], baited:false, hit:false, stacked:false, stackX:0, stackZ:0, raid:[202967, 243000, 243000, 243000][r] * MISS_EASE(), bond:[243000, 300000, 243000, 243000][r] * MISS_EASE() }));
      const spots = d.route.map(k => INNER[k]);
      let inVoid = false;
      return {
        end: ROUND_AT[3] + VANISH + 2.5,
        casts: [{ name:'ミッシング', start:0, len:4.1 }, ...ROUND_AT.slice(1).map(at => ({ name:'ミッシング', start:at - 2.5, len:2.5 })), { name:'ミッシング・ゼロ', start:ROUND_AT[3] + VANISH + .5, len:26 }],
        progress: t => `ROUND ${rounds.filter(r => t >= r.at).length}/4`,
        tick(t){
          const { x, z } = S.player;
          rounds.forEach(r => {
            if (!r.stacked && t >= r.at + STACK_AT){ r.stacked = true; r.stackX = x; r.stackZ = z; sfx.big(); healerHit(r.bond, 'ミッシング・ボンド'); FXK.stack(x, z, STACK_R * .7); fxAdd('ring', x, z, { r:STACK_R * 1.3, cols:FXC.magenta, dur:.4 }); fxShake(3, .25); } // ミッシング・ボンド（頭割り）
            if (!r.baited && t >= r.at + .08){ // 頭割りマーカー：穴の予兆＋自分に一番近いマーカーにオレンジ
              r.baited = true; warn.push(...r.tiles); sfx.blip(300, .08); healerHit(r.raid, 'ミッシング'); // ミッシング（全体攻撃）
              fxFlash('#ff8af0', .35, .2); for (let i = 0; i < 4; i++) fxAdd('bolt', (i - 1.5) * 9, -4 + (i % 2) * 8, { cols:FXC.void, dur:.3, seed:i * 17 + r.at * 3, dx:(i % 2 ? 1 : -1) * 18 });
              const m = MARKS.reduce((b, q) => (q[0] - x) ** 2 + (q[1] - z) ** 2 < (b[0] - x) ** 2 + (b[1] - z) ** 2 ? q : b);
              oranges.push({ x:m[0], z:m[1], hitAt:r.at + VANISH, done:false });
            }
            if (!r.hit && t >= r.at + VANISH){
              r.hit = true; sfx.big();
              r.tiles.forEach(([tx, tz]) => { fxAdd('implode', tx * G, tz * G, { r:HOLE_R, cols:FXC.void, dur:.5 }); fxParts(14, tx * G, tz * G, { cols:FXC.void, speed:6, up:6, life:.6, spread:HOLE_R }); });
              fxShake(3, .3);
              if (r.tiles.some(tl => inHole(x, z, tl))) hurt('穴に落ちた');
              r.tiles.forEach(tl => { gone.push(tl); warn.splice(warn.indexOf(tl), 1); });
              inVoid = gone.some(tl => inHole(x, z, tl));
            }
          });
          oranges.forEach(o => {
            if (o.done || t < o.hitAt) return;
            o.done = true;
            fxAdd('burst', o.x, o.z, { r:ORANGE_R * .9, cols:FXC.orange, dur:.45 }); fxParts(10, o.x, o.z, { cols:FXC.orange, speed:6, up:8, life:.6, spread:ORANGE_R });
            if ((x - o.x) ** 2 + (z - o.z) ** 2 <= ORANGE_R * ORANGE_R) hurt('オレンジのAOE');
          });
          // 消えた床（穴）に入った瞬間に1回カウント
          const v = gone.some(tl => inHole(x, z, tl));
          if (v && !inVoid) hurt('穴に落ちた');
          inVoid = v;
        },
        safeActive: () => true,
        safe(x, z){
          if (gone.some(tl => inHole(x, z, tl)) || warn.some(tl => inHole(x, z, tl))) return false;
          return !oranges.some(o => !o.done && (x - o.x) ** 2 + (z - o.z) ** 2 <= ORANGE_R * ORANGE_R);
        },
        // ガイド：2 → 3 → 4 → 1 → 最後の逃げ先。次に行く場所は黄色
        guide(t){
          const k = rounds.filter(r => t >= r.at).length;
          spots.forEach(([x, z], i) => {
            if (i === 4 && k < 4) return;
            const next = i === k;
            ring(px(x), px(z), next ? 5 : 3, next ? P.exaHi : P.white); glyph(String(i + 1), px(x), px(z), next ? P.exaHi : P.white);
          });
        },
        drawFloor(t){
          const blink = (Math.floor(performance.now() / 180) & 1) === 0, R = Math.round(HOLE_R * PPY), OR = Math.round(ORANGE_R * PPY);
          // 穴（入ると即死）
          gone.forEach(([tx, tz]) => { const X = px(tx * G), Z = px(tz * G); disc(X, Z, R, P.void); ring(X, Z, R, P.purple); });
          // 穴の予兆：点滅する紫
          warn.forEach(([tx, tz]) => { const X = px(tx * G), Z = px(tz * G); alpha(blink ? .5 : .3, () => disc(X, Z, R, P.purple)); ring(X, Z, R, P.purple); });
          // オレンジのAOE（着弾まで）
          oranges.forEach(o => {
            const X = px(o.x), Z = px(o.z);
            if (!o.done){ alpha(blink ? .45 : .3, () => disc(X, Z, OR, P.exa)); ring(X, Z, OR, P.exa); }

          });
        },
        // 頭割りマーカー（自分に付く）：4方向から内向きの矢印＋残り秒数。着弾で光る
        draw(t){
          const X = px(S.player.x), Z = px(S.player.z), blink = (Math.floor(performance.now() / 160) & 1) === 0;
          rounds.forEach(r => {
            if (t >= r.at && t < r.at + STACK_AT){
              const c = blink ? P.exaHi : P.exa, d = 10;
              [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dz]) => {
                // 先がプレイヤーを向いた「く」の字（2px 太さ）
                for (let i = 0; i < 6; i++){
                  const bx = X + dx * (d + i), bz = Z + dz * (d + i);
                  rect(bx - dz * i - 1, bz - dx * i - 1, 2, 2, c); rect(bx + dz * i - 1, bz + dx * i - 1, 2, 2, c);
                }
              });
              glyph(String(Math.ceil(r.at + STACK_AT - t)), X, Z - 22, P.white);
            }

          });
        },
      };
    }
  };
})();

export { MISS };
