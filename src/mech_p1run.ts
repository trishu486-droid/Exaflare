// @ts-nocheck
import { TARGET_DPS } from './jobs.js';
import { opt } from './store.js';
import { S } from './state.js';
import { bgm, sfx } from './audio.js';
import { healerHit, hasFull, hasInvuln } from './action.js';
import { fxFlash, fxShake } from './fx.js';
import { hurt, alpha } from './gfx.js';
import { TH, DPS, dist, TOWER_MOVE } from './p1lib.js';
import { hyperFx, busterMark, ruingaFx, RUINGA_DUR, judgeFloor, judgeTop, JUDGE_LAVA, JUDGE_DUR } from './p1lib.js';
import { A } from './action.js';
import { P1A } from './mech_p1a.js';
import { P1B } from './mech_p1b.js';
import { P1C } from './mech_p1c.js';
import { HOW, NOGUARD, SHIRK_MISS, hateRun, hateTop as planTop, taker, guarded, tankHint, p1TankRole } from './tankplan.js';

// =====================================================================
// P1 通し：ばりばりルインガ → 神々の像 第一楽章 → 裁きの光・ハイパードライブ → 第二楽章 → 裁きの光・ハイパードライブ → 第三楽章 → 時間切れ（裁きの光）
// docs/dmu/research-p1.md §0。時刻は cactbot のタイムライン −24 秒（＝第一楽章の 0）。最初のばりばりルインガ（15.6・18.7）から始まる（負の時刻）
// 各楽章は自分の 0 からの時刻で動く（p.off がずれ）。前の楽章が終わったらすぐ次の楽章に切り替え、味方は次の楽章の始めの位置へ歩く
// つぎつぎトラップのデバフは楽章をまたいで受け渡す（第一楽章で受け取った人が第二楽章で持つ、第二楽章で受け取った人が第三楽章で持つ）
// BGM は塔が動き出す時（各楽章の MOVE の始め）に次の楽章の曲へ
// =====================================================================
// 最初のばりばりルインガ：1発目ヘイト1位・2発目ヘイト2位。MT が軽減で2発とも受ける（ユーザーの軽減表：0:16・0:19 は MT の列）
// → ST が1発目のあとに挑発して、MT をヘイト2位にする（第二楽章の ST と同じ形の逆。2026-10-15）
const OPEN = { cast:-13.4, hit:[-8.4, -5.3], until:-4.6 }; // cactbot 10.6 → 15.6・18.7。until：MT が北から戻り始める（第一楽章の時刻）
const T0 = -16;                                // 通しの始まり（cactbot 8）
const MT_NORTH = { x:0, z:-6 }, CLEAVE_HALF = 45;
// ヘイト：最後に挑発した方が1位（どちらも挑発していなければ MT）。味方のタンクの挑発の時刻（通しの時刻）
// 挑発・シャークの時刻は、タンクのバフ回しの案ごとの表（tankplan.ts。2026-10-20 ユーザー）
const AT = [0, 51, 125.9];                     // 各楽章の 0（cactbot 24・75・149.9）
const SWITCH = [31.2, 99.2];                   // 前の楽章の終わり（第一楽章 31.2・第二楽章 48.2）で次へ切り替える
const MUSIC = [{ at:51, key:'p1b' }, { at:125.9 + TOWER_MOVE[3].from, key:'p1c' }]; // 塔が中段・上段へ動き出す時（上段は2回目の裁きの光の詠唱中）
// 楽章の間：裁きの光（全体攻撃 260,000）→ ハイパードライブ×3（タンク強攻撃 700,000。ヘイト1位のタンクが軽減か無敵で受ける（推定））
const GAPS = [
  { judge:38.7, hyper:[41.8, 43.8, 45.8] },     // cactbot 62.7 → 65.8〜69.8
  { judge:108.4, hyper:[111.6, 113.6, 115.7] }, // cactbot 132.4 → 135.6〜139.7
];
const JUDGE_LEN = 5, HYPER_LEN = 2;            // 詠唱の長さは資料にないので推定
// ハイパードライブはヘイト1位のタンクのまわりの円の範囲攻撃（ユーザー 2026-10-15）。タンクはケフカの正面（北）で受け、ほかの人は後ろ（南）へ。半径は推定（P3 のタンク強攻撃と同じ 5）
const HYPER_R = 5, TANK_FRONT = { x:0, z:-6 }, BEHIND = { x:0, z:7 };
const ENRAGE = { cast:173.3, at:178.3 };       // 時間切れの裁きの光（cactbot 197.3〜。軽減表 3:22）
// DPS チェック（2026-10-29 ユーザー）：時間切れの裁きの光の詠唱（173.3）までに、ケフカを残り 15% まで削る（倒しはしない）
// 第三楽章の混乱・睡眠（6 秒）はボスを殴れないので、その分を目安の時間から引く
const GATE = .15, TIMEUP = ENRAGE.cast, INCAP = [125.9 + 29.09, 125.9 + 35.09];
const busyTime = end => Math.max(1, Math.min(end, TIMEUP) - T0 - Math.max(0, Math.min(end, INCAP[1]) - INCAP[0]));
const KILL_AT = .95, HEAL_EASE = .8;           // P2・P3 通しと同じ
const dpsTarget = () => TARGET_DPS[opt.job] * (opt.job === 'ast' || opt.job === 'sch' ? HEAL_EASE : 1);
const nextHolder = (h, pass, G) => G.filter(k => k !== h)[pass]; // 各楽章の nextHolder と同じ

const RUN1 = {
  id:'p1', name:'P1 通し', sub:'', view:24, start:P1A.start, slots:true,
  gen(){
    const a = P1A.gen(), b = P1B.gen(), c = P1C.gen();
    b.trapT = nextHolder(a.trapT, a.pass.T, TH); b.trapD = nextHolder(a.trapD, a.pass.D, DPS);
    c.trapT = nextHolder(b.trapT, b.pass.T, TH); c.trapD = nextHolder(b.trapD, b.pass.D, DPS);
    b.me = c.me = a.me;
    return [a, b, c];
  },
  create(pr){
    const me = pr[0].me;
    const pre = { until:OPEN.until, spot:k => k === 'MT' ? MT_NORTH : null };
    const isTank = me === 'MT' || me === 'ST';
    const hateTop = t => planTop(t, me, st => st); // P1 通しの時刻のまま
    // 楽章の間（ハイパードライブの3発目まで）：ヘイト1位のタンクは正面、ほかは後ろにまとまる
    const SL = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
    const gapSpot = k => k === hateTop(S.t) ? TANK_FRONT : { x:BEHIND.x + Math.cos(SL.indexOf(k) * Math.PI / 4) * 1.6, z:BEHIND.z + Math.sin(SL.indexOf(k) * Math.PI / 4) * 1.6 };
    const gapPre = i => ({ until:GAPS[i - 1].hyper[2] + .4 - AT[i], spot:gapSpot });
    const segs = pr.map((p, i) => [P1A, P1B, P1C][i].create({ ...p, off:AT[i], pre:i === 0 ? pre : gapPre(i) }));
    let cleaveShow = null, hyperShow = null;
    const JUDGES = [...GAPS.map(g => g.judge), ENRAGE.at];
    const ruinga = n => {
      // 1発目は詠唱が始まった時のヘイト1位、2発目はその時のヘイト2位へ（2026-10-31 ユーザー）
      const tank = n === 1 ? hateTop(OPEN.cast) : hateTop(S.t) === 'MT' ? 'ST' : 'MT';
      const tq = tank === me ? S.player : segs[0]._debug.pos(tank), d = Math.hypot(tq.x, tq.z) || 1, u = { x:tq.x / d, z:tq.z / d };
      const inCone = q => { const r = Math.hypot(q.x, q.z); return r > .5 && (q.x * u.x + q.z * u.z) / r >= Math.cos(CLEAVE_HALF * Math.PI / 180); };
      if (!isTank && inCone(S.player)) hurt('ばりばりルインガ（タンク強攻撃の扇）に当たった');
      if (isTank){ // 最初のルインガはどの案も MT が2発とも受ける（受け方は案で違う）
        const [who, how] = taker('r1');
        if (me === who && tank !== me) hurt(n === 1 ? 'ばりばりルインガ1発目を受けなかった（詠唱が始まる時にヘイト1位でいる）' : 'ばりばりルインガ2発目を受けなかった（詠唱中に相方が挑発して、あなたがヘイト2位で受ける。挑発し返さない）');
        else if (me === who && !guarded(how, hasInvuln, hasFull)) hurt(`ばりばりルインガ${n}発目を${NOGUARD[how]}なしで受けた`);
        else if (me !== who && tank === me) hurt(n === 1 ? `ばりばりルインガ1発目を受けた（受けるのは ${who}。挑発は詠唱が始まってから）` : `ばりばりルインガ2発目を受けた（詠唱中に挑発して、${who} をヘイト2位に）`);
        else if (me !== who && inCone(S.player) && dist(S.player, tq) > 3) hurt(`ばりばりルインガ：${who} の扇に入った`);
      }
      cleaveShow = { t:S.t, u }; sfx.big();
    };
    const idx = t => t < SWITCH[0] ? 0 : t < SWITCH[1] ? 1 : 2;
    const call = (f, t, ...a) => { const i = idx(t); return segs[i][f]?.(t - AT[i], ...a); };
    let cur = 0, music = 0, shirkMiss = 0;
    const fired = new Set();
    const events = [[OPEN.hit[0], () => ruinga(1)], [OPEN.hit[1], () => ruinga(2)]];
    GAPS.forEach(g => {
      events.push([g.judge, () => { healerHit(260000, '裁きの光'); fxFlash('#ffffff', .5, .25); sfx.big(); fxShake(3, .3); }]);
      g.hyper.forEach((h, j) => events.push([h, () => {
        const tk = hateTop(S.t), tq = tk === me ? S.player : segs[idx(S.t)]._debug.pos(tk);
        const [who, how] = taker(g === GAPS[0] ? 'h1' : 'h2');
        if (isTank && me === who && tk !== me) hurt(`ハイパードライブ（${j + 1}発目）を受けなかった（受けるのは ${who}。ヘイト1位に）`);
        else if (isTank && me !== who && tk === me) hurt(`ハイパードライブ（${j + 1}発目）を受けた（受けるのは ${who}）`);
        else if (tk === me && !guarded(how, hasInvuln, hasFull)) hurt(`${NOGUARD[how]}なしでハイパードライブ（${j + 1}発目）を受けた`);
        if (tk !== me && dist(S.player, tq) <= HYPER_R) hurt('ハイパードライブ（タンクのまわりの範囲）に巻き込まれた');
        hyperShow = { t:S.t, x:tq.x, z:tq.z };
        sfx.big(); fxShake(2, .2);
      }]));
    });
    const self = {
      view:24, t0:T0, countdown:3, bossR:segs[0].bossR, bossArt:'kefka', markers:segs[0].markers, start:segs[0].start,
      intro:isTank ? `あなたは ${me}（タンク強攻撃：${['r1', 'h1', 'r2', 'h2'].map(k => taker(k)).map(([w, h], i) => `${['ルインガ', 'ハイドラ', 'ルインガ', 'ハイドラ'][i]}${w}${HOW[h]}`).join('・')}）` : `あなたは ${me}`,
      tankRole: t => p1TankRole(t, me), // シャークの少し前だけ B がシャーク、無敵の回の前だけ Y が無敵
      tankHint: t => isTank ? tankHint(t, me) : '',
      end:TIMEUP, hpGate:GATE, gateNext:'P2', // 15% まで削れていれば、ここで終わり（全通しは次へ）。足りなければ時間切れ
      casts:[
        { name:'ばりばりルインガ', start:OPEN.cast, len:OPEN.hit[0] - OPEN.cast },
        ...segs.flatMap((s, i) => s.casts.map(c => ({ ...c, start:c.start + AT[i] }))),
        ...GAPS.flatMap(g => [{ name:'裁きの光', start:g.judge - JUDGE_LEN, len:JUDGE_LEN }, { name:'ハイパードライブ', start:g.hyper[0] - HYPER_LEN, len:HYPER_LEN }]),
      ],
      bossHp: dpsTarget() * busyTime(TIMEUP) * KILL_AT, dpsTarget: dpsTarget(), // bossHp ぶん削ると残り 15%（hpGate）
      bossName:'ケフカ', enrageName:'裁きの光',
      activeTime: busyTime,
      incap: t => !!call('incap', t),
      healEase: t => call('healEase', t) ?? .45,
      progress: () => '', // 下の帯は HP と HIT だけ（P2・P3 通しと同じ）
      status: t => call('status', t) || [],
      enmity: () => ['MT', 'ST'].map(k => ({ k, top:k === hateTop(S.t), me:k === me })), // 挑発の時刻で決まる（表示は負の時刻も今の時刻で）
      lockMove: t => !!call('lockMove', t),
      tick(t){
        const i = idx(t);
        if (i !== cur){ // 次の楽章へ：味方は前の楽章の終わりの位置から歩き出す
          const prev = segs[cur]._debug.pos, next = segs[i]._debug.pos;
          ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'].filter(k => k !== me).forEach(k => { const a = prev(k), b = next(k); if (a && b){ b.x = a.x; b.z = a.z; } });
          cur = i;
        }
        if (music < MUSIC.length && t >= MUSIC[music].at){ bgm.stop(1); bgm.use(MUSIC[music].key); setTimeout(() => { if (S.inst === self && S.phase === 'run') bgm.start(); }, 400); music++; }
        segs[i].tick(t - AT[i]);
        if (isTank){ const m = hateRun(t, me, st => st).miss.length; if (m > shirkMiss){ shirkMiss = m; hurt(SHIRK_MISS); } }
        events.forEach(([et, fn], j) => { if (t >= et && !fired.has(j)){ fired.add(j); fn(); } });
      },
      safeActive: t => !!call('safeActive', t),
      safe: (x, z, t) => { const i = idx(t); return segs[i].safe(x, z, t - AT[i]); },
      guide: t => call('guide', t),
      screenBg: t => call('screenBg', t),
      drawFloor(t){
        call('drawFloor', t);
        // ばりばりルインガ：前へ飛ぶ白い扇の奥義（p1lib の ruingaFx）
        if (cleaveShow && S.t - cleaveShow.t < RUINGA_DUR) ruingaFx(cleaveShow.u, CLEAVE_HALF, S.t - cleaveShow.t);
        // 裁きの光：赤い溶岩 → 白く光る（金の柱は drawTop）
        JUDGES.forEach(at => { const a = t - at; if (a >= -JUDGE_LAVA && a < JUDGE_DUR) judgeFloor(a); });
      },
      draw(t){
        call('draw', t);
        // ばりばりルインガの詠唱中：ヘイト1位の頭上に強攻撃のマーカー
        if (t >= OPEN.cast && t < OPEN.hit[0]){ const k = hateTop(OPEN.cast); busterMark(k === me ? S.player : segs[idx(S.t)]._debug.pos(k)); }
      },
      drawTop(t, g){
        call('drawTop', t, g);
        JUDGES.forEach(at => judgeTop(g, t - at));
        // ハイパードライブ：ヘイト1位のタンクのまわり（半径5）に、たらいと黄色寄りの光（ユーザーの動画 2026-10-15）。0.8 秒前から降ってくる
        GAPS.forEach(gp => gp.hyper.forEach(h => { const a = S.t - h; if (a < -.8 || a >= .6) return;
          const q = a >= 0 && hyperShow && Math.abs(hyperShow.t - h) < .2 ? hyperShow : (hateTop(S.t) === me ? S.player : segs[idx(S.t)]._debug.pos(hateTop(S.t)));
          hyperFx(g, q, HYPER_R, a); }));
      },
      // テスト用（?debug）
      _segs:segs, _idx:idx, _AT:AT, _me:me,
      _botGoal:(k, t) => { const i = idx(t); return segs[i]._botGoal(k, t - AT[i]); },
      _lock:t => { const i = idx(t); return segs[i]._lock(t - AT[i]); },
      _face:() => segs[2]._face?.(),
    };
    return self;
  },
};

export { RUN1 };
