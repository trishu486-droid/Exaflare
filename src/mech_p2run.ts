// @ts-nocheck
import { TARGET_DPS } from './jobs.js';
import { opt } from './store.js';
import { P2M } from './mech_p2m.js';
import { P2T } from './mech_p2t.js';

// =====================================================================
// P2 通し：終末の双腕 → ミッシング → 裁きの光 → トライン → 終末の双腕 → 時間切れ（裁きの光）。docs/dmu/research-p2.md §1
// 時刻はミッシング（p.withEmb）の 0（＝P2 内 14.6 秒）。トラインはミッシングの「裁きの光の詠唱の始まり」（124.1）を自分の 0 にして動く
// 裁きの光まではミッシング、そのあとはトラインが描く・判定する（裁きの光の判定はミッシングの側で1回だけ）。味方はそのまま引き継ぐ
// =====================================================================
const T_AT = 124.1, SWITCH = 129.4;            // トラインの 0／ミッシング → トラインに切り替える時刻（裁きの光の直後）
const TARGETABLE = 0, UNTARGET = 166.7;        // P2 内 181.3（2回目の終末の双腕の約2秒後）に殴れなくなる
const ENRAGE = { cast:168.0, at:173.0 };       // 時間切れの裁きの光は P2 内 187.6。詠唱の長さは資料にないので、ふつうの裁きの光と同じ5秒（推定）
const KILL_AFTER = 164.7;                      // 2回目の終末の双腕まではギミックが続く（それまで HP が残る）
const KILL_AT = .95, HEAL_EASE = .8;           // P3 通しと同じ
const dpsTarget = () => TARGET_DPS[opt.job] * (opt.job === 'ast' || opt.job === 'sch' ? HEAL_EASE : 1);

const RUN2 = {
  id:'p2', name:'P2 通し', sub:'', view:24, start:P2M.start, slots:true,
  gen(){ const m = P2M.gen(), t = P2T.gen(); return [m, { ...t, me:m.me }]; },
  create(pr){
    const m = P2M.create({ ...pr[0], withEmb:true });
    const tr = P2T.create({ ...pr[1], withLoj:true, lojDone:true });
    let handed = false;
    const seg = t => t < SWITCH ? [m, t] : [tr, t - T_AT];
    const call = (f, t, ...a) => { const [s, tt] = seg(t); return s[f]?.(tt, ...a); };
    return {
      view:24, t0:TARGETABLE, countdown:5, bossR:m.bossR, start:m.start,
      intro:`${m.intro}　最後まで被弾なしで`,
      end:ENRAGE.at,
      casts:[
        ...m.casts,
        ...tr.casts.filter(c => c.name !== '裁きの光').map(c => ({ ...c, start:c.start + T_AT })),
        { name:'裁きの光', start:ENRAGE.cast, len:ENRAGE.at - ENRAGE.cast },
      ],
      bossHp: dpsTarget() * (UNTARGET - TARGETABLE) * KILL_AT, dpsTarget: dpsTarget(),
      bossName:'ケフカ', killAfter:KILL_AFTER, enrageName:'裁きの光',
      targetable: t => t >= TARGETABLE && t < UNTARGET,
      activeTime: end => Math.max(1, Math.min(end, UNTARGET) - TARGETABLE),
      progress: () => '', // 下の帯は HP と HIT だけ（P3 通しと同じ。長い技名が重なるため）
      status: t => call('status', t) || [],
      tick(t){
        if (t < SWITCH){ m.tick(t); return; }
        if (!handed){ handed = true; tr._bots.forEach(b => { const q = m._bots.find(x => x.k === b.k); if (q){ b.x = q.x; b.z = q.z; } }); }
        tr.tick(t - T_AT);
      },
      safeActive: t => !!call('safeActive', t),
      safe: (x, z, t) => { const [s, tt] = seg(t); return s.safe(x, z, tt); },
      guide: t => call('guide', t),
      screenBg: t => call('screenBg', t),
      drawFloor: t => call('drawFloor', t),
      draw: t => call('draw', t),
      // テスト用（?debug）：今の区切りの担当の位置
      _spotAt: (k, t) => { const [s, tt] = seg(t); return s._spotAt(k, tt); }, _A: m._A, _me: m._me,
    };
  },
};

export { RUN2 };
