import { FLOOD } from './mech_flood.js';
import { ORCH } from './mech_orch.js';
import { CELES } from './mech_celes.js';
import { EXA } from './mech_exa.js';
import { MISS } from './mech_miss.js';
import { opt, store } from './store.js';
import { RUN } from './mech_run.js';
import { P4 } from './mech_p4.js';

// フェーズごとのギミック。P5 は来る順：フラッド → オーケストラ → スリースターズ → 混沌の終末 →（オーケストラ2回目）→ ミッシング
const P4_MECHS = [P4];
const P5_MECHS = [FLOOD, ORCH, CELES, EXA, MISS];
const MECHS = [...P4_MECHS, ...P5_MECHS];

// メニューに出すギミック：フェーズ選択で選んだフェーズの分だけ（P5 の隠しステージは解放後だけ）
const unlocked = () => store.get('p5', false);
const phaseOf = (id: string) => P4_MECHS.some(m => m.id === id) ? 'p4' : 'p5';
const menuMechs = () => opt.phase === 'p4' ? P4_MECHS : unlocked() ? [...P5_MECHS, RUN] : P5_MECHS;
const mech = () => [...MECHS, RUN].find(m => m.id === opt.mech) || EXA;

export { MECHS, P4_MECHS, P5_MECHS, unlocked, phaseOf, menuMechs, mech };
