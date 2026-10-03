// @ts-nocheck
// ===== タイトルの後の演出：暗闇から道化の顔が浮かび上がり、高笑いする =====
// 顔はコードで描くドット絵（40×48）。笑い声はオシレーターとフィルターで作る（声の録音は使わない）

// 顔：40×48 のドット絵（文字＝色）。後ろへなでつけた金髪と頭頂の飾り、長くとがった耳、細い青い目、左目の赤い化粧、頬まで裂けた紫の笑み
const FACE = [
  '..................rrrr.....yy...........',
  '.................yhrrhh.yyhh............',
  '.................hhyhhyhhhh.............',
  '.................rrrrrhh................',
  '................hyhhyhh.................',
  '..............hhhhhhhHHHH...............',
  '............hhhhhhhhhhhHhHH.............',
  '...........hyhhyhhhhhhyhhHHH............',
  '..........hhhyhhyhhhhyhhhhHhH...........',
  '.........hhhhhhhhyhhhhhhyhhHHH..........',
  '..d.....yhyhyhhhhyhhhhhhhhhhHHH.....d...',
  '...d...yhhhhhhhhhhhhyhhyhyhyHhHH...d....',
  '...d...hhhhyhyhyhhhhyhhhhhhhhHHH...d....',
  '...dd..hyhhrrhhhhhhhyhyhhhhhyHHH..dd....',
  '....dd.hhhyrhhhhhhhhyhyhyhyhhHHh.dd.....',
  '....dsshhhhryhsssssssssssyhhhhHHSSd.....',
  '....dssllllrllsssssssssssSyhSSSSSSd.....',
  '.....dsllllrllsssssssssssSSyhSSSSd......',
  '.....dsllllrkkkkkksssskkkkkyhSSSSd......',
  '.....dslllkrllsssssssssssSSSyhSSSd......',
  '......rrrrrrBBBBBssssSBBBBBByhSSd.......',
  '......dllrrlllblsssssSslblblyhSSd.......',
  '......dlllrdddddsssssSsdddddyhSSd.......',
  '.......drSrrllsssssssSsssSyhyhSd........',
  '.......rpSSlllsssssssSssrryhhSpp........',
  '........PpSlllsssssssSsssSrrrpPP........',
  '......r.dPplllssssdsSSdssSSrpPr.r.......',
  '......r..dPpplsssssssssssSppPr..r.......',
  '......e...dPPppsssssssssppPPd...e.......',
  '..........dllPPppppsppppPPSSd...........',
  '...........dlppPPPPPPPPPppSd............',
  '...........dsssppppsppppsSSd............',
  '............dsssssspsssssSd.............',
  '.............dsssssssssssd..............',
  '.............dsssssssssssd..............',
  '..............dsssssssssd...............',
  '...............dsssssssd................',
  '...............dsssssssd................',
  '................dssSSsd.................',
  '................dsssssd.................',
  '.................dsssd..................',
  '..................dsd...................',
  '................ssssSSS.................',
  '................ssssSSS.................',
  '.............cooocccoooccc..............',
  '.........cccooocccooocccoooccc..........',
  '......occcooocccooocccooocccooocc.......',
  '..ooocccooocccooocccooocccooocccooocc...',
];
const PAL = { b:'#8ad0f0', B:'#2a1a30', e:'#ff6a6a', c:'#c03028', o:'#e8b830', y:'#f8e8a0', h:'#e0c050', H:'#8a6420', l:'#fffaf2', s:'#ece4dc', S:'#a49a98', d:'#5e5260', k:'#120a14',
  r:'#c01830', R:'#ff4a5a', p:'#7a2a7a', P:'#3a0c40', t:'#e8dcc0' };
const FW = FACE[0].length, FH = FACE.length;
function drawFace(){
  const c = document.createElement('canvas'); c.width = FW; c.height = FH;
  const g = c.getContext('2d');
  FACE.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]){ g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

// ===== 笑い声：「ヒャーーッ ハッ ハッ ハッ ハッ ハッ」 =====
// 声の元（パルス波）にフォルマント（口の形の響き）を当てて「ア」の音色にする。各「ハ」の頭に息のノイズ
let lastOut = null;
function laugh(ac, t0, vol = .35){
  const out = ac.createGain(); out.gain.value = vol; out.connect(ac.destination); lastOut = out;
  const noise = ac.createBuffer(1, ac.sampleRate * .5, ac.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // フォルマント：F1・F2・F3 のバンドパスを並べる
  const formants = (src, t, f1, f2, f3, f2end = f2, dur = .2) => {
    [[f1, f1, 6, 1], [f2, f2end, 8, .7], [f3, f3, 10, .35]].forEach(([fa, fb, q, gain]) => {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(fa, t); bp.frequency.linearRampToValueAtTime(fb, t + dur);
      const gg = ac.createGain(); gg.gain.value = gain;
      src.connect(bp).connect(gg).connect(out);
    });
  };
  // 1音（音節）：pitch は [始め, 終わり]、vowel は 'ia'（イ→ア）か 'a'
  const syll = (t, dur, p0, p1, amp, vowel = 'a') => {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(p0, t); o.frequency.exponentialRampToValueAtTime(p1, t + dur);
    // 声の震え
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 7; lg.gain.value = p0 * .025; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + .05);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(amp, t + .025); env.gain.setValueAtTime(amp, t + dur * .7); env.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(env);
    if (vowel === 'ia') formants(env, t, 350, 2300, 3000, 1250, dur * .5); else formants(env, t, 820, 1250, 2800, 1150, dur);
    o.start(t); o.stop(t + dur + .02);
    // 「h」の息
    const n = ac.createBufferSource(), hp = ac.createBiquadFilter(), ng = ac.createGain();
    n.buffer = noise; hp.type = 'bandpass'; hp.frequency.value = 1800; hp.Q.value = .8;
    ng.gain.setValueAtTime(amp * .9, t - .03); ng.gain.exponentialRampToValueAtTime(.001, t + .06);
    n.connect(hp).connect(ng).connect(out); n.start(Math.max(0, t - .03)); n.stop(t + .08);
  };
  let t = t0;
  syll(t, .7, 420, 760, .9, 'ia'); t += .78;                          // ヒャーーッ（上がる）
  const HA = [700, 620, 540];                                           // ハッハッハッ（少しずつ下がる）
  HA.forEach((p, i) => { syll(t, .13, p * 1.05, p * .9, .85 - i * .08); t += .17 + i * .008; });
  syll(t + .04, .5, 500, 330, .6);                                     // 最後のハーーッ（下がって消える）
  return t + .6 - t0;
}

// 飛ばしたときは笑い声をすぐ消す
function stopLaugh(ac){ if (!lastOut || !ac) return; lastOut.gain.cancelScheduledValues(ac.currentTime); lastOut.gain.setTargetAtTime(0, ac.currentTime, .03); lastOut = null; }

export { drawFace, laugh, stopLaugh, FW, FH };
