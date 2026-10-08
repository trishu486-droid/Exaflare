import { FLOOD } from './mech_flood.js';
import { ORCH } from './mech_orch.js';
import { CELES } from './mech_celes.js';
import { EXA } from './mech_exa.js';
import { MISS } from './mech_miss.js';
import { opt } from './store.js';
import { RUN } from './mech_run.js';
import { P4 } from './mech_p4.js';
import { P3A0, P3B } from './mech_p3.js';
import { P3A, RUN3 } from './mech_p3run.js';
import { P3D } from './mech_p3d.js';
import { P3C } from './mech_p3c.js';

// フェーズごとのギミック。P5 は来る順：フラッド → オーケストラ → スリースターズ → 混沌の終末 →（オーケストラ2回目）→ ミッシング
// P3：前半（バウル・オブ・アゴニー＋アルテマブラスター）→ じしん＆ブラックホール → どんどこ地団駄 → 通し
const P3_MECHS = [P3A, P3C, P3D, RUN3];
const P3_HIDDEN = [P3A0, P3B]; // メニューには出さない（前半の部品。テスト用に名前で呼べる）
const P4_MECHS = [P4];
const P5_MECHS = [FLOOD, ORCH, CELES, EXA, MISS];
const MECHS = [...P3_MECHS, ...P3_HIDDEN, ...P4_MECHS, ...P5_MECHS];

// メニューに出すギミック：フェーズ選択で選んだフェーズの分だけ（P5 は最後に「P5 通し」）
const phaseOf = (id: string) => [...P3_MECHS, ...P3_HIDDEN].some(m => m.id === id) ? 'p3' : P4_MECHS.some(m => m.id === id) ? 'p4' : 'p5';
const menuMechs = () => opt.phase === 'p3' ? P3_MECHS : opt.phase === 'p4' ? P4_MECHS : [...P5_MECHS, RUN];
const mech = () => [...MECHS, RUN].find(m => m.id === opt.mech && !(m as any).wip) || EXA;

export { MECHS, P3_MECHS, P4_MECHS, P5_MECHS, phaseOf, menuMechs, mech };
