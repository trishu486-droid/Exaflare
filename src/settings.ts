import { $, opt, store } from './store.js';
import { bgm, menuBgm, sfx, BGM_TRACKS } from './audio.js';
import { S } from './state.js';
import { cancelKeyWait, renderKeyOpts } from './input.js';
import { cv } from './gfx.js';

// ===== 設定シート =====
const oBgm = $('oBgm'); oBgm.checked = opt.bgm;
oBgm.addEventListener('change', () => {
  opt.bgm = oBgm.checked; store.set('bgm', opt.bgm);
  if (!opt.bgm){ bgm.stop(.2); menuBgm.stop(.2); }
  else if (S.phase === 'run' || S.phase === 'count') bgm.start();
  else if (S.phase === 'menu') menuBgm.start();
});

const oFirst = $('oFirst'), oSpeed = $('oSpeed'), oPath = $('oPath'), oSpots = $('oSpots'), oMarker = $('oMarker'), oSound = $('oSound'), oDebuff = $('oDebuff'), oDouble = $('oDouble');
oFirst.value = opt.first; oSpeed.value = opt.speed; oPath.checked = opt.path; oSpots.checked = opt.spots; oMarker.value = opt.marker; oSound.checked = opt.sound;
oDebuff.value = String(opt.debuff); oDouble.value = opt.dbl;
function speedLabel(){ $('oSpeedV').textContent = Math.round(opt.speed * 100) + '%'; }
speedLabel();
oFirst.addEventListener('change', () => { opt.first = oFirst.value; store.set('first', opt.first); });
oSpeed.addEventListener('input', () => { opt.speed = parseFloat(oSpeed.value); store.set('speed', opt.speed); speedLabel(); });
oPath.addEventListener('change', () => { opt.path = oPath.checked; store.set('path', opt.path); });
oSpots.addEventListener('change', () => { opt.spots = oSpots.checked; store.set('spots', opt.spots); });
oMarker.addEventListener('change', () => { opt.marker = oMarker.value; store.set('marker', opt.marker); });
oSound.addEventListener('change', () => { opt.sound = oSound.checked; store.set('sound', opt.sound); if (opt.sound) sfx.unlock(); });
oDebuff.addEventListener('change', () => { opt.debuff = oDebuff.value; store.set('debuff', opt.debuff); });
oDouble.addEventListener('change', () => { opt.dbl = oDouble.value; store.set('dbl', opt.dbl); });
// 戦闘BGMの選択。メニューにいるときは試聴する
const oTrack = $('oTrack');
oTrack.innerHTML = BGM_TRACKS.map((t, i) => `<option value="${i}">${i + 1}. ${t.name}</option>`).join('');
oTrack.value = String(opt.track);
let previewing = false;
oTrack.addEventListener('change', () => {
  opt.track = Number(oTrack.value); store.set('track', opt.track);
  bgm.stop(.1);
  if (S.phase === 'run' || S.phase === 'count'){ setTimeout(() => bgm.start(), 120); return; }
  if (opt.bgm){ menuBgm.stop(.1); previewing = true; setTimeout(() => bgm.start(), 120); }
});
function endPreview(){ if (!previewing) return; previewing = false; bgm.stop(.3); if (S.phase === 'menu') menuBgm.start(); }
function closeSheet(){ endPreview(); cancelKeyWait(); $('sheet').hidden = true; cv.focus({ preventScroll:true }); }
$('bOpt').addEventListener('click', () => { $('sheet').hidden = false; });
$('bClose').addEventListener('click', closeSheet);
// 設定のタブ
document.querySelector('#sheet .tabs').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]'); if (!b) return;
  document.querySelectorAll('#sheet .tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll<HTMLElement>('#sheet .tabpane').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
  cancelKeyWait(); renderKeyOpts();
});
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

export { oBgm, oFirst, oSpeed, oPath, oSpots, oMarker, oSound, oDebuff, oDouble, speedLabel, closeSheet };
