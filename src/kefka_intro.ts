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

// ===== 笑い声：「ヒャー ハッ ハッ ハッ」（スーパーファミコン風のエコー付き） =====
// 声の元（ノコギリ波）にフォルマント（口の形の響き）を当てて「ア」の音色にし、短いエコーを重ねる
// 形：最初の「ヒャー」は短く上がる → 「ハッ」は 0.25 秒おきに、小さく始まって強く切れる（後ろにエコーが2回）
//     ハッのたびに声が低く、響きも低い方へ移る
let lastOut = null;
function laugh(ac, t0, vol = .35, count = 3){
  const out = ac.createGain(); out.gain.value = vol; lastOut = out;
  // 昔のゲーム機の音声のように、高い音を落とす（2.4kHz より上はほとんど無い）
  const band = ac.createBiquadFilter(); band.type = 'lowpass'; band.frequency.value = 2400; band.Q.value = .7;
  const band2 = ac.createBiquadFilter(); band2.type = 'lowpass'; band2.frequency.value = 2400;
  out.connect(band).connect(band2);
  // エコー：80ms 遅れて少しずつ弱く・こもって返ってくる
  const dry = ac.createGain(); dry.gain.value = 1; band2.connect(dry).connect(ac.destination);
  const dl = ac.createDelay(1), fb = ac.createGain(), lp = ac.createBiquadFilter(), wet = ac.createGain();
  dl.delayTime.value = .08; fb.gain.value = .45; lp.type = 'lowpass'; lp.frequency.value = 2000; wet.gain.value = .5;
  band2.connect(dl); dl.connect(lp).connect(fb).connect(dl); lp.connect(wet).connect(ac.destination);
  const noise = ac.createBuffer(1, ac.sampleRate * .5, ac.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // フォルマント：F1・F2・F3 のバンドパスを並べる
  const formants = (src, t, f1, f2, f3, f2end, dur, f1end = f1) => {
    [[f1, f1end, 5, 1], [f2, f2end, 6, .7], [f3, f3, 9, .2]].forEach(([fa, fb2, q, gain]) => {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(fa, t); bp.frequency.linearRampToValueAtTime(fb2, t + dur);
      const gg = ac.createGain(); gg.gain.value = gain;
      src.connect(bp).connect(gg).connect(out);
    });
  };
  // 1音。shape：'rise'＝ふつう（立ち上がって伸びる）、'cresc'＝小さく始まって強くなり、すっと切れる
  const syll = (t, dur, p0, p1, amp, f1, f2, f2end, shape = 'rise', breath = .5, f1end = f1) => {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(p0, t); o.frequency.exponentialRampToValueAtTime(p1, t + dur);
    const env = ac.createGain();
    if (shape === 'cresc'){ env.gain.setValueAtTime(amp * .15, t); env.gain.linearRampToValueAtTime(amp, t + dur * .8); env.gain.linearRampToValueAtTime(0, t + dur); }
    else { env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(amp, t + .03); env.gain.setValueAtTime(amp, t + dur * .75); env.gain.linearRampToValueAtTime(0, t + dur); }
    o.connect(env); formants(env, t, f1, f2, 2300, f2end, dur, f1end);
    // 声の芯（低い成分）
    const lo = ac.createGain(); lo.gain.value = .35; env.connect(lo).connect(out);
    o.start(t); o.stop(t + dur + .02);
    // 息（かすれ）
    const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
    n.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = f2; bp.Q.value = 1.2;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(amp * breath, t + dur * .6); ng.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp).connect(ng).connect(out); n.start(t); n.stop(t + dur + .02);
  };
  let t = t0;
  syll(t, .3, 430, 560, .9, 800, 1700, 1500, 'rise', .6, 1250); t += .36;   // ヒャー（響きが 800→1250Hz へ上がる）
  const P = [500, 455, 420, 390, 365, 345].slice(0, count);                  // ハッのたびに低く
  P.forEach((p, i) => { const k = i / Math.max(1, P.length - 1); syll(t, .12, p * 1.05, p * .93, .95 - k * .25, 1050 - k * 230, 1600 - k * 300, 1450 - k * 300, 'cresc', .7); t += .21; });
  return t + .3 - t0; // エコーの尾ぶん
}

// 飛ばしたときは笑い声をすぐ消す
function stopLaugh(ac){ if (!lastOut || !ac) return; lastOut.gain.cancelScheduledValues(ac.currentTime); lastOut.gain.setTargetAtTime(0, ac.currentTime, .03); lastOut = null; }

export { drawFace, laugh, stopLaugh, FW, FH };
