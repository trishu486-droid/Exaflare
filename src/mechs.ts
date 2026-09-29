import { FLOOD } from './mech_flood.js';
import { ORCH } from './mech_orch.js';
import { CELES } from './mech_celes.js';
import { EXA } from './mech_exa.js';
import { MISS } from './mech_miss.js';
import { opt, store } from './store.js';
import { RUN } from './mech_run.js';

// メニューは P5 で来る順：フラッド → オーケストラ → スリースターズ → 混沌の終末 →（オーケストラ2回目）→ ミッシング
const MECHS = [FLOOD, ORCH, CELES, EXA, MISS];

// メニューに出すギミック（隠しステージは解放後だけ）
const unlocked = () => store.get('p5', false);
const menuMechs = () => unlocked() ? [...MECHS, RUN] : MECHS;
const mech = () => [...MECHS, RUN].find(m => m.id === opt.mech) || EXA;

export { MECHS, unlocked, menuMechs, mech };
