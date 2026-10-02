// テスト用：URL に ?debug を付けたときだけ、自動プレイのテストから中身を触れるようにする
import { S, keys } from './state.js';
import { opt } from './store.js';
import { MECHS } from './mechs.js';
import { RUN } from './mech_run.js';
import { A, HP, pressKey, actTick, hasInvuln } from './action.js';
import { job } from './jobs.js';
import { sfx, BGM_TRACKS } from './audio.js';
import { begin } from './game.js';
import { hurt } from './gfx.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
if (DEBUG) window.__T = { S, opt, MECHS, RUN, A, HP, pressKey, actTick, job, hasInvuln, keys, sfx, BGM_TRACKS, begin, hurt };
export { DEBUG };
