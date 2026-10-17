import { FLOOD } from './mech_flood.js';
import { ORCH } from './mech_orch.js';
import { CELES } from './mech_celes.js';
import { EXA } from './mech_exa.js';
import { MISS } from './mech_miss.js';
import { opt } from './store.js';
import { RUN } from './mech_run.js';
import { P4 } from './mech_p4.js';
import { P3A0, P3B } from './mech_p3.js';
import { P3A, RUN3, withP3Sky } from './mech_p3run.js';
import { withSky, withFloor } from './sky.js';
import { P3D } from './mech_p3d.js';
import { P3C } from './mech_p3c.js';
import { P2M } from './mech_p2m.js';
import { P2T } from './mech_p2t.js';
import { P1A } from './mech_p1a.js';
import { P1B } from './mech_p1b.js';
import { P1C } from './mech_p1c.js';
import { RUN2 } from './mech_p2run.js';
import { RUN1 } from './mech_p1run.js';
import { LINK12, LINK23, LINK34, LINK45, FULL } from './mech_link.js';

// フェーズごとのギミック。P5 は来る順：フラッド → オーケストラ → スリースターズ → 混沌の終末 →（オーケストラ2回目）→ ミッシング
// P2：ミッシング → トライン → 通し
// P3：前半（バウル・オブ・アゴニー＋アルテマブラスター）→ じしん＆ブラックホール → どんどこ地団駄 → 通し
const P1_MECHS = [P1A, P1B, P1C, RUN1].map(m => withFloor(m, 'blue')); // 3つに分ける（神々の像1回目・2回目・ずびずばテレポ）＋通し。名前はユーザーの資料のフォルダ
const P2_MECHS = [P2M, P2T, RUN2].map(m => withFloor(m, 'gold'));
const P3_MECHS = [P3A, withP3Sky(P3C), withP3Sky(P3D), RUN3].map(m => withFloor(m, 'blue'));
const P3_HIDDEN = [P3A0, P3B].map(m => withFloor(m, 'blue')); // メニューには出さない（前半の部品。テスト用に名前で呼べる）
const P4_MECHS = [withFloor(withSky(P4, 'ruins', 'kefka'), 'blue')]; // P4 の空は P3 と同じ、ケフカは P1 と同じ絵（ユーザー 2026-10-17）
// P5：赤い星雲の空とカオスケフカの絵（ユーザー 2026-10-17）
const P5_MECHS = [FLOOD, ORCH, CELES, EXA, MISS].map(m => withFloor(withSky(m, 'nebula', 'chaos'), 'rust'));
const RUN5 = withFloor(withSky(RUN, 'nebula', 'chaos'), 'rust');
const LINK_MECHS = [withFloor(LINK12, 'blue'), withFloor(LINK23, 'gold'), withFloor(LINK34, 'blue'), withFloor(LINK45, 'blue')]; // つなぎ目の確認用（今だけ。全通しができたら消す。2026-10-16 ユーザー）
const FULL_MECHS = [FULL]; // 全通し（P1〜P5。ユーザー 2026-10-17）
const MECHS = [...P1_MECHS, ...P2_MECHS, ...P3_MECHS, ...P3_HIDDEN, ...P4_MECHS, ...P5_MECHS, ...FULL_MECHS, ...LINK_MECHS];

// メニューに出すギミック：フェーズ選択で選んだフェーズの分だけ（P5 は最後に「P5 通し」）
const phaseOf = (id: string) => id === 'full' ? 'full' : LINK_MECHS.some(m => m.id === id) ? 'link' : P1_MECHS.some(m => m.id === id) ? 'p1' : P2_MECHS.some(m => m.id === id) ? 'p2' : [...P3_MECHS, ...P3_HIDDEN].some(m => m.id === id) ? 'p3' : P4_MECHS.some(m => m.id === id) ? 'p4' : 'p5';
const menuMechs = () => opt.phase === 'full' ? FULL_MECHS : opt.phase === 'link' ? LINK_MECHS : opt.phase === 'p1' ? P1_MECHS : opt.phase === 'p2' ? P2_MECHS : opt.phase === 'p3' ? P3_MECHS : opt.phase === 'p4' ? P4_MECHS : [...P5_MECHS, RUN5];
const mech = () => [...MECHS, RUN5].find(m => m.id === opt.mech && !(m as any).wip) || P5_MECHS[3]; // 見つからないときは混沌の終末

export { MECHS, P1_MECHS, P2_MECHS, P3_MECHS, P4_MECHS, P5_MECHS, phaseOf, menuMechs, mech };
