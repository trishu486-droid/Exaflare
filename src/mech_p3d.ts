// @ts-nocheck
import { S, pick } from './state.js';
import { sfx } from './audio.js';
import { A, healerHit, popup, switchTarget } from './action.js';
import { mySlot } from './jobs.js';
import { FXC, FXK, fxAdd, fxFlash, fxParts, fxShake } from './fx.js';
import { P, PPY, alpha, ctx, disc, glyph, hurt, line, px, rect, ring, targetLast } from './gfx.js';
import { drawFace } from './kefka_intro.js';
import { at, norm, CHAOS_SIDE, BOSS_TC, BOSS_COL, drawBossArt } from './mech_p3.js';

// =====================================================================
// P3 締め：どんどこ地団駄（ヤーン。docs/dmu/research-p3.md §6・§9.4）
// 時刻は cactbot のタイムライン 905 秒（2回目のボクチンの直後）を 0 とする
// ボクチンが来た方向を北とする。巨大ケフカは中央の上に浮いて、足だけが降りてくる
// ブリザガ（足元の円）2回：詠唱の始まりに足元へ置かれ、3秒後に爆発（cactbot：BB0D は詠唱つき）。1回目は全員中央、2回目は四隅（塔の外側）に置いて離れる
// 着弾（4人頭割り）：TH 組か DPS 組。来た組は中央で頭割り、来なかった組は自分たちの塔（2人ずつ）。2回目は組が入れ替わる
// どんどこ地団駄：塔はケフカの足の下の左右2か所（西・東、中心から10）を2回使う。1回目の塔組が左 → 右、2回目の塔組が左 → 右（2026-10-08 ユーザー確認）
// ブリザガ（凍結）：詠唱が終わってから少しのあいだ、動くか攻撃していないと氷結
// 突出：着弾を受けた場所（中央）に円 → 離れる
// =====================================================================
const SLOTS = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
const TH = ['MT', 'ST', 'H1', 'H2'], DPS = ['D1', 'D2', 'D3', 'D4'];
const T = {
  // ブリザガ：bliz1・bliz2 は円が置かれる時刻（爆発は PUDDLE_DELAY 秒後＝cactbot の 915.8・918.8）
  bliz1Cast:7.7, bliz1:7.8, bliz2:10.8, stompCast:11.7, kd1:13.3, stomps:[13.3, 14.6, 15.9, 17.2], kd2:18.8,
  freezeCast:18.9, freeze:22.0, freezeEnd:24.0, bigBang:23.3, end:26.0,
};
const PUDDLE_R = 3.5, PUDDLE_DELAY = 3.0, TOWER_R = 2.5, TOWER_SPOT = 7, TOWER_FOOT = 10, SCATTER_R = 7, // SCATTER_R：ブリザガ2を置く四隅（ボスのターゲットサークルのすぐ外。殴りながら置く）
  STACK_R = 3, BIGBANG_R = 5, BOT_SPEED = 9;
const DMG = { stack:40000, tower:30000, bigBang:0, freeze:0 }; // ヒーラーの HP 管理用の目安
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const add = (a, b, k = 1) => ({ x:a.x + b.x * k, z:a.z + b.z * k });
const unit = (a, b) => { const d = dist(a, b) || 1; return { x:(b.x - a.x) / d, z:(b.z - a.z) / d }; };

const P3D = {
  id:'p3d', name:'どんどこ地団駄', sub:'塔と着弾（ヤーン）', view:24, start:{ x:0, z:2 }, slots:true,
  gen(){ return { me:mySlot(), north:pick([0, 45, 90, 135, 180, 225, 270, 315]), thFirst:Math.random() < .5 }; },
  create(p){
    const now = () => S.t - (p.off || 0); // P3 通しでつないだときの、このギミックの中の時刻
    const me = p.me, N = p.north;
    const side = k => CHAOS_SIDE.includes(k) ? 'chaos' : 'exdeath';
    // 散開の位置（北＝ボクチンが来た方向）：北西 MT・H1、北東 ST・H2、南西 D1・D3、南東 D2・D4。塔は左（西）の組＝MT・H1／D1・D3、右（東）の組＝ST・H2／D2・D4
    const PAIR = { MT:'nw', H1:'nw', ST:'ne', H2:'ne', D1:'sw', D3:'sw', D2:'se', D4:'se' };
    const CORNER = { nw:at(N - 45, TOWER_SPOT), ne:at(N + 45, TOWER_SPOT), sw:at(N + 225, TOWER_SPOT), se:at(N + 135, TOWER_SPOT) };
    const stack1 = p.thFirst ? TH : DPS, stack2 = p.thFirst ? DPS : TH;
    // 塔：1回目の塔組（着弾が来なかった組）の左・右 → 2回目の塔組の左・右
    const towerKeys = p.thFirst ? ['sw', 'se', 'nw', 'ne'] : ['nw', 'ne', 'sw', 'se'];
    // 塔はケフカの足の下の左右2か所（ケフカを北にして西・東、中心とふちの真ん中）。1回目も2回目も同じ場所。左（ケフカの右足）から
    const FOOT = { nw:at(N - 90, TOWER_FOOT), sw:at(N - 90, TOWER_FOOT), ne:at(N + 90, TOWER_FOOT), se:at(N + 90, TOWER_FOOT) };
    const TOWERS = towerKeys.map((key, i) => ({ key, ...FOOT[key], t:T.stomps[i], who:SLOTS.filter(k => PAIR[k] === key) }));
    const myTower = TOWERS.find(tw => tw.who.includes(me));
    const inStack = (k, n) => (n === 1 ? stack1 : stack2).includes(k);
    // ---- 立ち位置 ----
    const SPOT_OFF = k => at(SLOTS.indexOf(k) * 45, .7);
    const spot = (k, t) => {
      const mine = TOWERS.find(tw => tw.who.includes(k)), c = CORNER[PAIR[k]], O = { x:0, z:0 }, far = add(O, unit(O, c), SCATTER_R);
      if (t < T.bliz1 + .1) return add(O, SPOT_OFF(k), 1.2);                                   // 全員中央でブリザガ1を置く
      if (t < T.bliz2 + .1) return add(far, SPOT_OFF(k), .5);                                  // 四隅（塔の外側）へ散開してブリザガ2を置く
      if (inStack(k, 1)){
        if (t < T.kd1 + .3) return add(O, SPOT_OFF(k));                                        // 中央で1回目の頭割り
        // 同じ場所の1回目の足が落ちるまでは、塔のすぐ外（外周側）で待つ
        const prior = TOWERS.find(w => w !== mine && dist(w, mine) < .1 && w.t < mine.t);
        if (prior && t < prior.t + .15) return add(add(mine, unit(O, mine), TOWER_R + 1.5), SPOT_OFF(k), .5);
        if (t < mine.t + .3) return add(mine, SPOT_OFF(k), .5);                                // 自分たちの塔へ
        if (t < T.kd2 + .3) return add(c, unit(O, c), 3);                                      // 2回目の頭割りに近づかない
      } else {
        if (t < mine.t + .3) return add(mine, SPOT_OFF(k), .5);                                // 塔を踏む
        if (t < T.kd2 + .3) return add(O, SPOT_OFF(k));                                        // 中央で2回目の頭割り
      }
      // 締めのあと（P3 通しで時間切れまで続くとき）：自分の組のボスのそばで殴る
      if (t >= T.freezeEnd + .5){ const b = side(k) === 'chaos' ? CH : EX; return add(b, at(N + 180 + (SLOTS.indexOf(k) - 3.5) * 20, BOSS_TC + 1)); }
      // 凍結（動き続ける）と突出（中央に円）：中央から離れた所で小さく回る
      const a = (t * 140 + SLOTS.indexOf(k) * 45) % 360;
      return add(at(N + 180 + (SLOTS.indexOf(k) - 3.5) * 20, 8.5), at(a, .8));
    };
    const bots = SLOTS.filter(k => k !== me).map(k => ({ k, ...spot(k, 0) }));
    const pos = k => k === me ? S.player : bots.find(b => b.k === k);
    // ---- ボス：中央に固定（詠唱中なので動かない。近接が殴り続けられる）。向きだけヘイトのタンクへ ----
    const mkBoss = (q, tank) => ({ ...q, face:at(N + 180, 1), tank });
    // P3 通しでは、じしん＆ブラックホールの終わりと同じ場所から（p.bossAt）。瞬間移動しないように
    const CH = mkBoss(p.bossAt?.chaos ?? at(N - 90, .6), 'ST'), EX = mkBoss(p.bossAt?.exdeath ?? at(N + 90, .6), 'MT');
    const bosses = t => [
      { id:'chaos', name:'カオス', x:CH.x, z:CH.z, face:CH.face, r:BOSS_TC, color:BOSS_COL.chaos },
      { id:'exdeath', name:'エクスデス', x:EX.x, z:EX.z, face:EX.face, r:BOSS_TC, color:BOSS_COL.exdeath },
    ];
    // ---- 判定 ----
    const puddles = []; // { x, z, t }：置いた時刻から PUDDLE_DELAY 秒後に爆発
    const efx = [];
    let lastMove = 0, lastP = { ...S.player }, frozen = false;
    const dropPuddles = () => { SLOTS.forEach(k => puddles.push({ ...pos(k), t:now() })); sfx.ok(); };
    const stackCheck = n => {
      const grp = n === 1 ? stack1 : stack2, c = { x:0, z:0 }, cnt = SLOTS.filter(k => dist(pos(k), c) <= STACK_R).length;
      if (grp.includes(me) && dist(S.player, c) > STACK_R) hurt(`着弾（${n}回目）：頭割りに入らなかった`);
      else if (!grp.includes(me) && dist(S.player, c) <= STACK_R) hurt(`着弾（${n}回目）：自分の組ではない頭割りに入った`);
      else if (grp.includes(me)) healerHit(DMG.stack * 4 / Math.max(1, cnt), '着弾');
      efx.push({ k:'stack', t:now(), q:c }); sfx.big(); fxShake(3, .25);
      FXK.stack(c.x, c.z, STACK_R, FXC.magenta); fxAdd('ring', c.x, c.z, { r:STACK_R * 2.2, cols:FXC.magenta, dur:.45 });
    };
    const towerCheck = tw => {
      const inT = SLOTS.filter(k => dist(pos(k), tw) <= TOWER_R);
      const mine = tw.who.includes(me), here = inT.includes(me);
      if (mine && !here) hurt('どんどこ地団駄：自分の塔を踏まなかった');
      else if (!mine && here) hurt('どんどこ地団駄：ほかの組の塔に入った');
      else if (here) healerHit(DMG.tower, 'どんどこ地団駄');
      efx.push({ k:'stomp', t:now(), q:{ x:tw.x, z:tw.z } }); sfx.boom(); fxShake(6, .4); fxFlash('#ffd8a0', .3, .15);
      fxAdd('burst', tw.x, tw.z, { r:TOWER_R * 1.6, cols:FXC.orange, dur:.45 }); fxAdd('ring', tw.x, tw.z, { r:TOWER_R * 4, cols:FXC.rock, dur:.55 });
      fxParts(22, tw.x, tw.z, { cols:FXC.rock, speed:12, up:12, life:.9, size:3, spread:TOWER_R });
    };
    const events: [number, () => void][] = [
      [T.bliz1, dropPuddles], [T.bliz2, dropPuddles],
      [T.kd1, () => stackCheck(1)], [T.kd2, () => stackCheck(2)],
      ...TOWERS.map(tw => [tw.t, () => towerCheck(tw)] as [number, () => void]),
      [T.bigBang, () => { if (dist(S.player, { x:0, z:0 }) <= BIGBANG_R) hurt('突出（着弾を受けた場所の円）に当たった'); efx.push({ k:'bang', t:now() }); sfx.big(); fxShake(4, .35); fxFlash('#d8b0ff', .35, .2);
        fxAdd('burst', 0, 0, { r:BIGBANG_R, cols:FXC.thunder, dur:.55 }); fxAdd('ring', 0, 0, { r:BIGBANG_R * 1.8, cols:FXC.thunder, dur:.5 }); [-14, 0, 14].forEach((dx, j) => fxAdd('bolt', (j - 1) * 2, (j % 2) * 2 - 1, { cols:FXC.thunder, dur:.4, dx, seed:j * 5 })); fxParts(16, 0, 0, { cols:FXC.thunder, speed:10, up:8, life:.6, spread:BIGBANG_R }); }],
      [T.freeze, () => { efx.push({ k:'freezeCast', t:now() }); fxFlash('#e8f8ff', .55, .3); sfx.big(); }],
    ].sort((a, b) => a[0] - b[0]);
    const fired: boolean[] = [];
    const kefkaImg = drawFace();
    // ケフカの足：画面の上から、赤と黄のしまのズボンの脚が伸びてきて、先に道化の靴（つま先がくるっと上に丸まる）
    function drawBoot(X, Z, R){
      const w = Math.round(R * .9), top = 0, foot = Math.round(Z);
      // 脚（しま模様・黒ぶち）
      rect(X - w - 1, top, w * 2 + 2, foot - top, '#101018');
      for (let y = top; y < foot - 2; y += 4) rect(X - w, y, w * 2, Math.min(4, foot - 2 - y), ((y / 4) | 0) % 2 ? '#f0c030' : '#d8283a');
      // すそのフリル
      for (let i = -w - 2; i <= w + 2; i += 3) disc(X + i, foot - 3, 2, '#fffaf2');
      // 靴：横長の楕円、つま先（右）がくるっと上へ。先に丸い飾り
      ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.ellipse(X + R * .4, foot + 2, R * 1.35 + 1, R * .55 + 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a2a9a'; ctx.beginPath(); ctx.ellipse(X + R * .4, foot + 2, R * 1.35, R * .55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a84ac8'; ctx.beginPath(); ctx.ellipse(X + R * .2, foot, R * .9, R * .25, 0, 0, Math.PI * 2); ctx.fill();
      const tx = Math.round(X + R * 1.7), ty = Math.round(foot - R * .5);
      line(Math.round(X + R * 1.5), foot + 1, tx, ty, '#101018'); line(Math.round(X + R * 1.4), foot + 1, tx - 1, ty, '#7a2a9a');
      disc(tx, ty, 3, '#101018'); disc(tx, ty, 2, '#f0c030');
    }
    const sec = u => Math.max(0, Math.ceil(u - now()));
    return {
      macroBox:true, // 左下に PT チャット（縦長・細め）
      end:T.end, t0:0,
      intro:`あなたは ${me}`, // 1回目が頭割りか塔かは、着弾の頭上マーカーが付くまで分からない（先に教えない）
      casts:[
        { name:'ブリザガ', start:T.bliz1Cast - 3, len:3 },
        { name:'どんどこ地団駄', start:T.stompCast, len:T.stomps[0] - T.stompCast },
        { name:'ブリザガ', start:T.freezeCast, len:T.freeze - T.freezeCast },
      ],
      progress: t => t < T.bliz2 + PUDDLE_DELAY ? 'ブリザガ' : t < T.kd1 + .5 ? '着弾1' : t < T.kd2 + .5 ? '着弾2' : '凍結',
      bosses,
      target0: side(me),
      buttons:{ early:'ターゲット切替' },
      say(kind){ if (kind === 'early') switchTarget(); },
      fieldMarker:'nw',
      mySpot: t => spot(me, t),
      debug:{ p, T, TOWERS, CORNER, pos, spot, stack1, stack2 },
      status(t){
        const s = [];
        // 着弾の頭上マーカー：来た組の4人に（自分の組なら自分のアイコン）
        const n = t >= T.kd1 - 3.5 && t < T.kd1 + .3 ? 1 : t >= T.kd2 - 3.5 && t < T.kd2 + .3 ? 2 : 0;
        if (n && inStack(me, n)) s.push({ at:t, glyph:'着', color:'#e8508a', name:'着弾（4人頭割り）', sec:sec(n === 1 ? T.kd1 : T.kd2) });
        if (frozen) s.push({ at:T.freeze, glyph:'氷', color:'#6ac8ff', name:'氷結', sec:'' });
        return s;
      },
      tick(t){
        const dt = Math.min(.05, Math.max(0, t - (this._lt ?? t))); this._lt = t;
        bots.forEach(b => { const g = spot(b.k, t), d = dist(b, g), step = BOT_SPEED * dt; if (d > .05){ const k = Math.min(1, step / d); b.x += (g.x - b.x) * k; b.z += (g.z - b.z) * k; } });
        [CH, EX].forEach(b => {
          const tk = pos(b.tank), d = dist(b, tk);
          if (d > .3) b.face = { x:(tk.x - b.x) / d, z:(tk.z - b.z) / d };
        });
        // ブリザガの円：置いてから PUDDLE_DELAY 秒で爆発
        puddles.forEach(pd => {
          if (pd.done || t < pd.t + PUDDLE_DELAY) return;
          pd.done = true; if (!this._iceSnd || t - this._iceSnd > .2){ this._iceSnd = t; sfx.boom(); fxShake(3, .25); }
          if (dist(S.player, pd) <= PUDDLE_R && !this._pud?.[Math.round(pd.t * 10)]){ (this._pud ||= {})[Math.round(pd.t * 10)] = 1; hurt('ブリザガ（足元の円）に当たった'); }
          efx.push({ k:'ice', t, q:{ x:pd.x, z:pd.z }, seed:Math.random() * 6 });
          fxAdd('burst', pd.x, pd.z, { r:PUDDLE_R, cols:FXC.ice, dur:.4 }); fxParts(8, pd.x, pd.z, { cols:FXC.ice, speed:7, up:9, life:.7, size:2, spread:PUDDLE_R * .6 });
        });
        // 凍結：詠唱が終わってから 2 秒のあいだ、1 秒以上止まっていたら（攻撃もしていない）氷結
        if (dist(S.player, lastP) > .02){ lastMove = t; lastP = { ...S.player }; }
        if (!frozen && t >= T.freeze + .2 && t < T.freezeEnd && t - Math.max(lastMove, (A.actAt ?? -99) - (p.off || 0)) > 1){ frozen = true; hurt('ブリザガ（凍結）：止まっていて氷結した'); }
        events.forEach((e, i) => { if (!fired[i] && t >= e[0]){ fired[i] = true; e[1](); } });
      },
      safeActive: t => t >= .5,
      safe(x, z, t){ const g = spot(me, t); return Math.hypot(x - g.x, z - g.z) <= 2; },
      guide(t){ const g = spot(me, t); ring(px(g.x), px(g.z), Math.round(2 * PPY), P.white); rect(px(g.x), px(g.z), 1, 1, P.white); },
      draw(t){
        // 巨大ケフカ：北の外に顔。足は塔の上に影 → 落ちてくる
        const h = at(N, 21.5), W = kefkaImg.width * 1.5, H = kefkaImg.height * 1.5;
        ctx.imageSmoothingEnabled = false; ctx.drawImage(kefkaImg, Math.round(px(h.x) - W / 2), Math.round(px(h.z) - H / 2), W, H);
        // 塔（地団駄の詠唱から、落ちるまで）
        TOWERS.forEach((tw, i) => {
          if (t < T.stompCast || t > tw.t + .4) return;
          const X = px(tw.x), Z = px(tw.z), R = Math.round(TOWER_R * PPY), next = TOWERS.findIndex(w => t < w.t + .05) === i;
          alpha(next ? .45 : .25, () => disc(X, Z, R, '#ffd060'));
          ring(X, Z, R, next ? '#fff4c0' : '#c8a040'); ring(X, Z, R - 1, '#c8a040');
          // 塔の人数（2人）
          rect(X - 3, Z - 1, 2, 2, '#101018'); rect(X + 1, Z - 1, 2, 2, '#101018');
          // 足の影：落ちる直前に濃くなる。空から赤い光の筋が何本か刺さる
          const k = Math.max(0, 1 - (tw.t - t) / 1.3);
          if (k > 0) alpha(.25 + .5 * k, () => { ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.ellipse(X, Z, R * (1.4 - .4 * k), R * (.9 - .2 * k), 0, 0, Math.PI * 2); ctx.fill(); });
          if (k > .2) alpha(.35 + .4 * Math.abs(Math.sin(t * 20)), () => { [-R * .6, 0, R * .5].forEach((dx, j) => { rect(Math.round(X + dx) - 1, 0, 2, Math.round(Z), j === 1 ? '#ff6a6a' : '#e8283a'); }); });
          // 靴：最後の 0.35 秒で上から落ちてくる
          const fall = tw.t - t;
          if (fall < .35 && fall > -.05) drawBoot(X, Z - Math.max(0, fall) / .35 * Z * .9, R); // 足が上から降りてくる
        });
        // ブリザガの円（置かれてから爆発まで）
        puddles.forEach(pd => { if (pd.done) return; const k = (t - pd.t) / PUDDLE_DELAY, X = px(pd.x), Z = px(pd.z), R = Math.round(PUDDLE_R * PPY);
          alpha(.3 + .2 * k, () => disc(X, Z, R, '#ff9a3a')); alpha(.5, () => disc(X, Z, Math.round(R * k), '#ffc070')); ring(X, Z, R, '#ffe0a0'); ring(X, Z, R - 1, '#ff7a1f');
          if (k > .6) alpha((k - .6) * 1.5, () => { for (let j = 0; j < 5; j++){ const an = j * 1.26 + pd.t; rect(Math.round(X + Math.cos(an) * R * .5) - 1, Math.round(Z + Math.sin(an) * R * .5) - 1, 2, 2, '#e8f8ff'); } }); });
        // 突出の予兆は出さない（着弾を受けた場所＝中央）
        targetLast(bosses(t)).forEach(drawBossArt);
        // エフェクト
        for (let i = efx.length - 1; i >= 0; i--){
          const e = efx[i], a = t - e.t;
          if (a > .7){ efx.splice(i, 1); continue; }
          const f = 1 - a / .7;
          if (e.k === 'stomp'){ // 大きな靴が落ちてくる → 衝撃
            const X = px(e.q.x), Z = px(e.q.z), R = Math.round(TOWER_R * PPY);
            if (a < .45) alpha(1 - a / .45, () => drawBoot(X, Z - Math.max(0, a - .2) / .25 * Z * .9, R)); // 踏みつけた足が少し残って、上へ戻る
            alpha(.6 * f, () => ring(X, Z, Math.round((TOWER_R + a * 10) * PPY), '#ffd060'));
          }
          if (e.k === 'stack') alpha(.6 * f, () => { disc(px(e.q.x), px(e.q.z), Math.round(STACK_R * PPY), '#ff7ab8'); ring(px(e.q.x), px(e.q.z), Math.round((STACK_R + a * 6) * PPY), '#ffffff'); });
          if (e.k === 'ice') alpha(f, () => { const X = px(e.q.x), Z = px(e.q.z), R = PUDDLE_R * PPY, g = Math.min(1, a / .12);
            alpha(.45, () => disc(X, Z, Math.round(R), '#c8f0ff'));
            for (let j = 0; j < 7; j++){ const an = e.seed + j * .9, L = R * (.6 + (j % 3) * .25) * g, bx = X + Math.cos(an) * R * .25, bz = Z + Math.sin(an) * R * .25, nx = -Math.sin(an) * 3, nz = Math.cos(an) * 3;
              ctx.fillStyle = j % 2 ? '#6ad8ff' : '#2a8ad8'; ctx.beginPath(); ctx.moveTo(bx + nx, bz + nz); ctx.lineTo(bx - nx, bz - nz); ctx.lineTo(bx + Math.cos(an) * L, bz + Math.sin(an) * L - L * .5); ctx.fill();
              line(Math.round(bx), Math.round(bz), Math.round(bx + Math.cos(an) * L), Math.round(bz + Math.sin(an) * L - L * .5), '#ffffff'); } });
          if (e.k === 'bang') alpha(.7 * f, () => { disc(px(0), px(0), Math.round(BIGBANG_R * PPY), '#b05aff'); for (let j = 0; j < 8; j++){ const an = j * .785, r = BIGBANG_R * PPY * (.5 + a); line(px(0), px(0), px(0) + Math.cos(an) * r, px(0) + Math.sin(an) * r, '#f0d8ff'); } });
          if (e.k === 'freezeCast') alpha(.35 * f, () => disc(px(0), px(0), Math.round(20 * PPY), '#e8f8ff'));
        }
        // 凍結の冷気：詠唱が終わってから判定の終わりまで、白い霧と舞う雪
        if (t >= T.freeze && t < T.freezeEnd + .6){ const k = t < T.freezeEnd ? 1 : 1 - (t - T.freezeEnd) / .6;
          alpha(.18 * k, () => disc(px(0), px(0), Math.round(20 * PPY), '#dff4ff'));
          for (let j = 0; j < 40; j++){ const x = ((j * 53 + t * 30 * (1 + j % 3)) % 300) - 6, y = ((j * 97 + t * 45) % 300) - 6; if (Math.hypot(x - px(0), y - px(0)) < 20 * PPY) alpha(.7 * k, () => rect(Math.round(x), Math.round(y), 2, 2, '#ffffff')); } }
        if (frozen){ const X = px(S.player.x), Z = px(S.player.z); alpha(.75, () => { rect(X - 7, Z - 16, 14, 18, '#a8e0ff'); rect(X - 5, Z - 14, 4, 12, '#ffffff'); }); ring(X, Z - 7, 10, '#e8f8ff'); }
        // 着弾の頭割りマーカー（自分の組に来たとき）：P5 ミッシングと同じ。4方向から内向きの「く」の字＋残り秒数
        const n = t >= T.kd1 - 3.5 && t < T.kd1 ? 1 : t >= T.kd2 - 3.5 && t < T.kd2 ? 2 : 0;
        if (n && inStack(me, n)){
          const X = px(S.player.x), Z = px(S.player.z), blink = (Math.floor(performance.now() / 160) & 1) === 0, c = blink ? P.exaHi : P.exa, d = 10;
          [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dz]) => {
            for (let i = 0; i < 6; i++){ const bx = X + dx * (d + i), bz = Z + dz * (d + i); rect(bx - dz * i - 1, bz - dx * i - 1, 2, 2, c); rect(bx + dz * i - 1, bz + dx * i - 1, 2, 2, c); }
          });
          glyph(String(Math.ceil((n === 1 ? T.kd1 : T.kd2) - t)), X, Z - 22, P.white);
        }
        void norm;
      },
    };
  },
};

export { P3D };
