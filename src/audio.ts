import { EXTRA_TRACKS } from './bgm_tracks.js';
import { p4Battle } from './bgm_p4.js';
import { opt } from './store.js';

// ===== 効果音（8bit矩形波） =====
// 指を離した・クリック・キー入力のたびに音を起こしておく（iOS は touchstart では音を鳴らせない）
['touchend', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, () => sfx.unlock(), { capture:true, passive:true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden && sfx.ac) sfx.unlock(); });
const SFX_VOL = .5; // 効果音全体の音量
// BGMの音量（設定の「サウンド」タブ。0〜100%）。50% が以前の音量で、初期値は 25%（以前の半分）
const bgmGain = () => Math.max(0, Math.min(100, opt.bgmVol ?? 25)) / 50;
const sfx = {
  ac:null,
  // iOS：ホーム画面から開いたアプリでは、止まった音（suspended／interrupted）を指を離したときに再開する必要がある
  //   audioSession を playback にすると、マナーモードでも鳴り、ほかのアプリの音に消されない（Safari 16.4 以降）
  unlock(){
    if (!opt.sound && !opt.bgm) return;
    try {
      const n: any = navigator; if (n.audioSession && n.audioSession.type !== 'playback') n.audioSession.type = 'playback';
      this.ac ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ac.state !== 'running') this.ac.resume().catch(() => {});
    } catch {}
  },
  tone(freq, dur, type = 'square', vol = .06, slide = 0){
    if (!opt.sound || !this.ac) return;
    const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol * SFX_VOL, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + dur + .02);
  },
  blip(f, d){ this.tone(f, d); },
  cursor(){ this.tone(880, .035, 'square', .045); },
  ok(){ [660, 990].forEach((f, i) => setTimeout(() => this.tone(f, .07, 'square', .05), i * 70)); },
  back(){ [520, 350].forEach((f, i) => setTimeout(() => this.tone(f, .07, 'square', .045), i * 70)); },
  boom(){ this.tone(140, .09, 'square', .025, -80); },
  big(){ this.tone(110, .3, 'square', .07, -70); this.tone(55, .35, 'triangle', .09, -20); },
  splash(){ this.tone(420, .18, 'triangle', .05, -300); },
  hurt(){ this.tone(220, .25, 'sawtooth', .08, -160); },
  hit(){ this.tone(988, .05, 'square', .04); },
  crit(){ this.tone(1318, .08, 'square', .045); },
  no(){ this.tone(160, .12, 'square', .05); },
  buff(){ [660, 880].forEach((f, i) => setTimeout(() => this.tone(f, .06, 'triangle', .06), i * 60)); },
  clear(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, .12), i * 110)); },
  fail(){ [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, .16), i * 150)); }
};

// ===== BGMの再生エンジン（戦闘・メニューで共通） =====
// 1ステップ＝16分音符。小節ごとに長さ（4/4=16、7/8=14、6/8=12）とテンポを持つ
// build(曲を組み立てる関数) はループ開始位置を返す
function makePlayer(VOL, build, REV = 0){ // REV：残響（大聖堂っぽい響き）の量。0 なら無し
  const N = n => { const m = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11, 'B#':12, 'E#':5, Fb:4, Cb:-1 }; const [, k, o] = n.match(/^([A-G][#b]?)(\d)$/); return 12 * (+o + 1) + m[k]; };
  const song = [], stepDur = [];   // song: { s:ステップ, ch, n:MIDI, l:長さ }
  const add = (s: number, ch: string, n?: string | number, l?: number) => song.push({ s, ch, n:n && (typeof n === 'number' ? n : N(n)), l });
  const up8 = n => n.replace(/\d/, d => String(+d + 1));
  const dn8 = n => n.replace(/\d/, d => String(+d - 1));
  let cur = 0;
  const bar = (len, bpm, fn) => { const s0 = cur; for (let i = 0; i < len; i++) stepDur.push(60 / bpm / 4); cur += len; fn(s0); };
  // フィル（区切りの前の太鼓）。曲の調に合わせた音程と、いくつかの叩き方から選ぶ
  //   tom：タムが下がる / up：タムが上がる / roll：スネアの連打→シンバル / tri：3つずつのタム（3連風）
  //   timp：ティンパニの連打 / kick：バスドラの連打＋スネア / flam：スネアとタムを重ねて下がる / sparse：8分で間を空ける
  const fill = (s0: number, from: number, to: number, style = 'tom', notes: string[] = ['A2','G2','E2','D2']) => {
    const n = to - from;
    for (let i = 0; i < n; i++){
      const s = s0 + from + i, last = i === n - 1;
      if (style === 'tom') add(s, 'tom', notes[i % notes.length]);
      else if (style === 'up') add(s, 'tom', notes[notes.length - 1 - i % notes.length]);
      else if (style === 'roll'){ add(s, 'snare'); if (i >= n - 2) add(s, 'kick'); }
      else if (style === 'tri'){ if (i % 3 !== 2) add(s, 'tom', notes[Math.floor(i / 3) % notes.length]); else add(s, 'snare'); }
      else if (style === 'timp') add(s, 'timp', notes[i % 2 ? notes.length - 1 : 0]);
      else if (style === 'kick'){ add(s, 'kick'); if (i % 2) add(s, 'snare'); }
      else if (style === 'flam'){ add(s, 'snare'); add(s, 'tom', notes[i % notes.length]); }
      else if (style === 'sparse'){ if (i % 2 === 0) add(s, 'tom', notes[(i / 2) % notes.length]); }
      if (last && style !== 'sparse') add(s, 'crash');
    }
  };

  // 和音の中で、n より下にある一番近い音（ハモリ用。MIDI番号で返す）
  const below = (n, chord) => { const m = N(n); let best = m - 12; chord.forEach(c => { let x = N(c); while (x >= m - 2) x -= 12; while (x + 12 < m - 2) x += 12; if (x > best) best = x; }); return best; };
  const tr = (n, k) => N(n) + k; // 半音 k 個ずらした音（MIDI番号）
  const LOOP = build({ add, bar, up8, dn8, fill, below, tr, pos:() => cur });

  const TOTAL = cur;
  const byStep = Array.from({ length:TOTAL }, () => []);
  song.forEach(e => byStep[e.s].push(e));

  let master = null, pulse = null, noise = null, drive = null, timer = null, next = 0, step = 0;
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  function setup(ac){
    if (master) return;
    // 全体：コンプレッサーでまとめて音圧を上げる
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .12;
    master = ac.createGain(); master.gain.value = VOL * bgmGain(); master.connect(comp).connect(ac.destination);
    if (REV){ // 残響：減衰するノイズを畳み込んで、広い石造りの空間の響きを作る（スーファミのエコーのような広がり）
      const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++){ const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      const conv = ac.createConvolver(), wet = ac.createGain(); conv.buffer = ir; wet.gain.value = REV;
      master.connect(conv); conv.connect(wet).connect(comp);
    }
    // 歪み（ギター役のパワーコード用）
    const shaper = ac.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++){ const x = i / 512 - 1; curve[i] = Math.tanh(x * 8); }
    shaper.curve = curve;
    const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;
    drive = ac.createGain(); drive.gain.value = 1; drive.connect(shaper).connect(tone).connect(master);
    const K = 32, re = new Float32Array(K), im = new Float32Array(K);
    for (let k = 1; k < K; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * .25);
    pulse = ac.createPeriodicWave(re, im);
    noise = ac.createBuffer(1, ac.sampleRate * .3, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  // att：立ち上がり（オルガンはゆっくり）
  function voice(ac, t, type, freq, dur, vol, att = .005, out = master, vib = 0){
    const o = ac.createOscillator(), g = ac.createGain();
    if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (vib && dur > .3){ // 長い音にはビブラート
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = 6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * vib, t + .25);
      l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + .02);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att + .01, dur - .12)); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function hit(ac, t, kind, freq?){
    const o = ac.createOscillator(), g = ac.createGain();
    if (kind === 'timp'){ // ティンパニ：低い三角波が少し下がりながら減衰
      o.type = 'triangle'; o.frequency.setValueAtTime(freq * 1.2, t); o.frequency.exponentialRampToValueAtTime(freq, t + .15);
      g.gain.setValueAtTime(.4, t); g.gain.exponentialRampToValueAtTime(.001, t + .7);
      o.connect(g).connect(master); o.start(t); o.stop(t + .75); return;
    }
    if (kind === 'kick'){ // ツーバス：短く重い
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + .07);
      g.gain.setValueAtTime(.6, t); g.gain.exponentialRampToValueAtTime(.001, t + .1);
      o.connect(g).connect(master); o.start(t); o.stop(t + .11); return;
    }
    if (kind === 'tom'){ // タム：音程のある太鼓
      o.type = 'triangle'; o.frequency.setValueAtTime(freq * 1.5, t); o.frequency.exponentialRampToValueAtTime(freq, t + .08);
      g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .25);
      o.connect(g).connect(master); o.start(t); o.stop(t + .26); return;
    }
    if (kind === 'snare' || kind === 'crash' || kind === 'hat'){
      const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), gn = ac.createGain();
      src.buffer = noise; fl.type = 'highpass'; fl.frequency.value = kind === 'snare' ? 1200 : kind === 'hat' ? 7500 : 3500;
      const len = kind === 'snare' ? .18 : kind === 'hat' ? .035 : .45;
      gn.gain.setValueAtTime(kind === 'snare' ? .5 : kind === 'hat' ? .14 : .3, t); gn.gain.exponentialRampToValueAtTime(.001, t + len);
      src.connect(fl).connect(gn).connect(master); src.start(t); src.stop(t + len + .01);
      if (kind === 'snare'){ // 芯（胴鳴り）
        o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + .05);
        g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
        o.connect(g).connect(master); o.start(t); o.stop(t + .09);
      }
      return;
    }
    // 鐘：高い正弦波＋倍音が長く残る
    [1, 2.76, 5.4].forEach((m, i) => {
      const oo = ac.createOscillator(), gg = ac.createGain();
      oo.type = 'sine'; oo.frequency.setValueAtTime(freq * m, t);
      gg.gain.setValueAtTime([.1, .04, .02][i], t); gg.gain.exponentialRampToValueAtTime(.0005, t + [2.4, 1.2, .6][i]);
      oo.connect(gg).connect(master); oo.start(t); oo.stop(t + 2.5);
    });
  }
  // ハープ：はじいて減衰する音
  function pluck(ac, t, f){
    ([['triangle', 1, .14], ['pulse', 2, .02]] as [string, number, number][]).forEach(([type, m, v]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
      o.frequency.setValueAtTime(f * m, t);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0005, t + 1.4);
      o.connect(g).connect(master); o.start(t); o.stop(t + 1.45);
    });
  }
  function play(ac, e, t){
    const dur = (e.l || 1) * stepDur[e.s], f = e.n && hz(e.n);
    switch (e.ch){
      // パイプオルガン：25%パルス＋1オクターブ下の矩形＋三角波を重ね、ゆっくり立ち上げる
      case 'organ': voice(ac, t, 'pulse', f, dur, .03, .02); voice(ac, t, 'square', f / 2, dur, .012, .03); voice(ac, t, 'triangle', f * 1.002, dur, .025, .02); break;
      case 'stab':  voice(ac, t, 'square', f, dur * .6, .045, .003); voice(ac, t, 'pulse', f * 2, dur * .5, .025, .003); break;
      case 'bass':  voice(ac, t, 'sawtooth', f, dur * .8, .07, .003); break;
      // ギター役：歪ませたパワーコード（根音・5度・オクターブ）。短い音は刻み、長い音はアクセント
      case 'gtr':   [1, 1.498, 2].forEach((m, i) => voice(ac, t, 'sawtooth', f * 2 * m, dur * (e.l > 1 ? .9 : .55), [.05, .04, .03][i], .002, drive)); break;
      case 'pedal': voice(ac, t, 'triangle', f, dur, .22, .01); break;
      case 'lead':  voice(ac, t, 'square', f, dur * .97, .09, .01, master, .012); voice(ac, t, 'sawtooth', f * 1.003, dur * .95, .035, .01, master, .012); voice(ac, t, 'pulse', f * 2, dur * .9, .025, .01); break;
      case 'choir': voice(ac, t, 'triangle', f, dur, .06, .25); voice(ac, t, 'triangle', f * 1.006, dur, .04, .3); break;
      case 'toc':   voice(ac, t, 'pulse', f, dur * .9, .045, .003); voice(ac, t, 'pulse', f / 2, dur * .9, .02, .003); break;
      case 'kick': case 'snare': case 'crash': case 'hat': hit(ac, t, e.ch); break;
      // 追加のパート：速い分散和音・弦のトレモロ・ハモリ・高音のきらめき
      case 'arp':   voice(ac, t, 'pulse', f, dur * .6, .022, .002); break;
      case 'str':   voice(ac, t, 'sawtooth', f, dur, .014, .08, master, .006); voice(ac, t, 'triangle', f * 1.004, dur, .02, .1); break;
      case 'harm':  voice(ac, t, 'square', f, dur * .95, .04, .01, master, .01); voice(ac, t, 'triangle', f / 2, dur * .95, .03, .01); break;
      case 'spark': voice(ac, t, 'pulse', f, dur * .4, .016, .002); break;
      case 'tom':   hit(ac, t, 'tom', f); break;
      case 'timp':  hit(ac, t, 'timp', f); break;
      case 'bell':  hit(ac, t, 'bell', f); break;
      case 'harp':  pluck(ac, t, f); break;
      case 'flute': voice(ac, t, 'triangle', f, dur * .95, .09, .08, master, .008); voice(ac, t, 'sine', f * 2, dur * .9, .02, .1); break;
      case 'pad':   voice(ac, t, 'triangle', f, dur, .035, .4); voice(ac, t, 'pulse', f * 1.003, dur, .008, .5); break;
      // 大聖堂のオルガン：8'（基音）＋16'（1オクターブ下）＋4'・2'（倍音）を重ね、少しずらして厚くする
      case 'organ2': voice(ac, t, 'pulse', f, dur, .026, .03); voice(ac, t, 'square', f / 2, dur, .014, .04); voice(ac, t, 'triangle', f * 2, dur, .016, .03);
                     voice(ac, t, 'sine', f * 4, dur, .008, .03); voice(ac, t, 'triangle', f * 1.004, dur, .02, .03); break;
      // 合唱「あー」：ゆっくり立ち上がる三角波を少しずらして重ね、ビブラート
      case 'choir2': voice(ac, t, 'triangle', f, dur, .055, .35, master, .01); voice(ac, t, 'triangle', f * 1.008, dur, .04, .4, master, .012); voice(ac, t, 'sine', f * 2, dur, .012, .4); break;
      // 金管：のこぎり波と1オクターブ下の矩形。短く立ち上がる
      case 'brass': voice(ac, t, 'sawtooth', f, dur * .92, .045, .03, master, .006); voice(ac, t, 'square', f / 2, dur * .92, .02, .03); break;
      // ===== P4 の曲用（16bit のプログレ風） =====
      // シンセブラス：少しずらした2本のノコギリ波＋1オクターブ下の矩形＋倍音のパルス。少しふくらませて立ち上げ、長い音はビブラート
      case 'sbrass': voice(ac, t, 'sawtooth', f, dur * .95, .042, .025, master, .008); voice(ac, t, 'sawtooth', f * 1.007, dur * .95, .03, .03, master, .008);
                     voice(ac, t, 'square', f / 2, dur * .95, .014, .025); voice(ac, t, 'pulse', f * 2, dur * .9, .01, .02); break;
      // 控えめなブラス（ハモリ・持続）
      case 'sbrass2': voice(ac, t, 'sawtooth', f, dur * .95, .02, .04, master, .006); voice(ac, t, 'sawtooth', f * .994, dur * .95, .016, .05); break;
      // スラップベース：アタックの強いノコギリ波＋かすかな高い矩形（弦をはじく音）
      case 'slap':  voice(ac, t, 'sawtooth', f, dur * .85, .075, .002); voice(ac, t, 'square', f * 2, Math.min(dur, .05), .025, .001); break;
      // ポップ（オクターブ上をはじく）：短く明るい
      case 'pop':   voice(ac, t, 'pulse', f, dur * .55, .05, .001); voice(ac, t, 'square', f * 2, Math.min(dur * .4, .04), .018, .001); break;
      // ロックオルガン：矩形＋2倍・3倍の正弦波（ドローバー風）＋頭のクリック
      case 'rorg':  voice(ac, t, 'square', f, dur * .8, .016, .004); voice(ac, t, 'sine', f * 2, dur * .8, .014, .004); voice(ac, t, 'sine', f * 3, dur * .8, .008, .004);
                    voice(ac, t, 'sine', f * 4, .03, .012, .001); break;
      // オルガンの速いアルペジオ用（軽め）
      case 'rorgA': voice(ac, t, 'square', f, dur * .75, .02, .002); voice(ac, t, 'sine', f * 2, dur * .75, .012, .002); break;
      // オーケストラヒット：ノコギリ波の和音を短く強く（ノイズは譜面側でシンバルを重ねる）
      case 'ohit':  voice(ac, t, 'sawtooth', f, Math.min(dur, .3), .045, .002); voice(ac, t, 'sawtooth', f * 2, Math.min(dur, .22), .025, .002); voice(ac, t, 'triangle', f / 2, Math.min(dur, .35), .05, .002); break;
    }
  }
  function tick(){
    const ac = sfx.ac; if (!ac) return;
    while (next < ac.currentTime + (window.__offline ? 60 : .15)){ // __offline：テストで音をファイルに書き出すとき
      byStep[step].forEach(e => play(ac, e, next));
      next += stepDur[step]; step++;
      if (step >= TOTAL) step = LOOP; // イントロは最初だけ
    }
  }
  return {
    start(){
      if (!opt.bgm) return;
      sfx.unlock(); const ac = sfx.ac; if (!ac || timer) return;
      setup(ac);
      master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(VOL * bgmGain(), ac.currentTime);
      step = 0; next = ac.currentTime + .05;
      timer = setInterval(tick, 25); tick();
    },
    // 音量を変えたとき：鳴っている曲にもすぐ反映
    setVol(){ const ac = sfx.ac; if (!ac || !master || !timer) return; master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(VOL * bgmGain(), ac.currentTime, .05); },
    stop(fade = .6){
      if (!timer) return;
      clearInterval(timer); timer = null;
      const ac = sfx.ac; if (!ac || !master) return;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + fade);
      // 予約済みの音はフェードで消える。次の再生は新しい音量で始める
    },
  };
}

// ===== 戦闘BGM（オリジナル曲。ラスボス終盤風：テンポ130・7/8拍子の混在・聖歌風の急な減速） =====
// 構成：イントロ(4/4×2) → A 7/8リフ(×4) → B 4/4旋律(×6) → C 聖歌風 BPM66(×2) → A に戻る（1周 約25秒）
// 激しさ：歪んだパワーコードの刻み・重いキック・タムのフィル・コンプレッサーで音圧を上げる
// 厚み：ハイハット16分・速い分散和音・弦・合唱・旋律のハモリ・対旋律・鐘を重ねる
const bgm1 = makePlayer(.125, ({ add, bar, up8, dn8, fill, below, pos }) => {
  // --- イントロ（4/4、130）---
  bar(16, 130, s0 => { ['D2','D3','A3','D4','F4','A4'].forEach(n => add(s0, 'organ', n, 16)); add(s0, 'crash'); add(s0, 'kick'); add(s0, 'gtr', 'D2', 12); add(s0, 'timp', 'D2'); add(s0, 'bell', 'A5');
    ['D4','F4','A4'].forEach(n => add(s0, 'str', n, 16)); add(s0, 'choir', 'D5', 16); add(s0, 'choir', 'A4', 16);
    for (let i = 0; i < 16; i++){ add(s0 + i, 'arp', ['D5','F5','A5','D6'][i % 4], 1); if (i >= 8) add(s0 + i, 'timp', 'D2'); } });
  bar(16, 130, s0 => { ['A1','A2','E3','A3','C#4','E4'].forEach(n => add(s0, 'organ', n, 16)); add(s0, 'gtr', 'A1', 8); for (let i = 8; i < 16; i++){ add(s0 + i, 'snare'); add(s0 + i, 'kick'); }
    ['C#4','E4','A4'].forEach(n => add(s0, 'str', n, 16)); add(s0, 'choir', 'E5', 16); add(s0, 'choir', 'C#5', 16);
    for (let i = 0; i < 16; i++){ add(s0 + i, 'arp', ['A5','E5','C#5','A4'][i % 4], 1); add(s0 + i, 'hat'); }
    ['A5','G5','F5','E5','D5','C#5','E5','A5'].forEach((n, i) => add(s0 + 8 + i, 'spark', up8(n), 1)); });

  // --- A：7/8 のリフ（2+2+3 に刻む）---
  const LOOP = pos();
  const A_CH = [['D4','F4','A4'], ['Bb3','D4','F4'], ['G3','Bb3','D4'], ['A3','C#4','E4']];
  const A_BASS = ['D2','Bb1','G1','A1'];
  A_CH.forEach((c, b) => bar(14, 130, s0 => {
    const groups = [0, 4, 8], r = A_BASS[b];
    if (b % 2 === 0) add(s0, 'crash');
    for (let i = 0; i < 14; i++){ add(s0 + i, 'bass', r, 1); add(s0 + i, 'kick'); add(s0 + i, 'gtr', r, groups.includes(i) ? 2 : 1); }
    groups.forEach((g, gi) => { c.forEach(n => add(s0 + g, 'stab', n, 2)); add(s0 + g, gi ? 'snare' : 'timp', gi ? undefined : r.replace(/\d/, '2')); });
    const riff = [c[0], c[2], c[1], c[2],  c[0], c[2], c[1], c[2],  c[0], c[1], c[2], up8(c[0]), c[2], c[1]];
    riff.forEach((n, i) => add(s0 + i, 'toc', n, 1));
    // 追加：ハイハットの16分、2オクターブ上の速い分散和音、弦の持続音、裏で動く対旋律、合唱
    for (let i = 0; i < 14; i++){ add(s0 + i, 'hat'); add(s0 + i, 'arp', up8([c[0], c[1], c[2], up8(c[0])][i % 4]), 1); }
    c.forEach(n => add(s0, 'str', up8(n), 14));
    [[0, up8(c[2]), 4], [4, up8(c[1]), 4], [8, up8(c[0]), 6]].forEach(([i, n, l]) => add(s0 + i, 'harm', n, l));
    add(s0, 'choir', up8(c[0]), 14);
    if (b === 3) fill(s0, 10, 14, 'tom', ['D3','C3','A2','F2']);
  }));

  // --- B：4/4 の旋律（Dm B♭ E° A7 / E♭ A）---
  const B_CH = [['D4','F4','A4'], ['Bb3','D4','F4'], ['E4','G4','Bb4'], ['C#4','E4','A4'], ['Eb4','G4','Bb4'], ['C#4','E4','A4']];
  const B_BASS = ['D2','Bb1','E2','A1','Eb2','A1'];
  const B_MEL = [
    [['A4',8],['D5',4],['F5',4]],
    [['F5',8],['D5',4],['Bb4',4]],
    [['E5',6],['G5',2],['Bb5',8]],
    [['A5',8],['C#5',4],['E5',4]],
    [['Eb6',8],['D6',4],['Bb5',4]],
    [['C#6',4],['A5',4],['E5',2],['F5',2],['G5',2],['A5',2]],
  ];
  B_CH.forEach((c, b) => bar(16, 130, s0 => {
    const r = B_BASS[b];
    if (b % 2 === 0) add(s0, 'crash');
    for (let i = 0; i < 16; i++){ add(s0 + i, 'bass', r, 1); add(s0 + i, 'kick'); add(s0 + i, 'gtr', r, [0, 6, 12].includes(i) ? 2 : 1); }
    add(s0, 'pedal', r, 16);
    c.forEach(n => add(s0, 'organ', n, 16));
    [0, 6, 12].forEach(i => { c.forEach(n => add(s0 + i, 'stab', n, 2)); add(s0 + i, 'snare'); add(s0 + i, 'timp', r.replace(/\d/, '2')); });
    [c[0], c[2], c[1], c[2]].forEach((n, i) => { for (let k = 0; k < 4; k++) add(s0 + k * 4 + i, 'toc', n, 1); });
    let s1 = s0; B_MEL[b].forEach(([n, l]) => { add(s1, 'lead', n, l); add(s1, 'harm', below(n, c), l); s1 += l; }); // 旋律の下で和音のハモリ
    // 追加：ハイハット16分、裏打ちのスネア、速い分散和音、弦、合唱、小節頭の鐘
    for (let i = 0; i < 16; i++){ add(s0 + i, 'hat'); add(s0 + i, 'arp', up8([c[0], c[1], c[2], c[1]][i % 4]), 1); if (i % 4 === 2) add(s0 + i, 'snare'); }
    c.forEach(n => add(s0, 'str', n, 16)); add(s0, 'choir', c[0], 16); add(s0, 'choir', c[2], 16);
    add(s0, 'bell', up8(up8(c[0])));
    [12, 13, 14, 15].forEach((i, k) => add(s0 + i, 'spark', up8(up8(c[k % 3])), 1));
    if (b === 5) fill(s0, 12, 16, 'roll');
  }));

  // --- C：聖歌風（テンポ66に急減速）---
  const C_CH = [['D3','F3','A3','D4'], ['A2','C#3','E3','A3']];
  const C_MEL = [[['F4',8],['A4',8]], [['A4',8],['C#5',8]]];
  C_CH.forEach((c, b) => bar(16, 66, s0 => {
    c.forEach(n => add(s0, 'organ', n, 16));
    add(s0, 'pedal', dn8(c[0]), 16);
    add(s0, 'bell', up8(up8(c[0])));
    add(s0, 'timp', c[0].replace(/\d/, '2'));
    let s1 = s0; C_MEL[b].forEach(([n, l]) => { add(s1, 'choir', n, l); add(s1, 'choir', up8(n), l); add(s1, 'harm', below(n, c), l); s1 += l; });
    // 追加：弦の持続とハープの分散和音（聖歌の下でゆっくり上り下り）
    c.forEach(n => add(s0, 'str', up8(n), 16));
    for (let i = 0; i < 16; i += 2) add(s0 + i, 'harp', up8([c[0], c[1], c[2], c[3], up8(c[0]), c[3], c[2], c[1]][i / 2]));
    if (b === 1) for (let i = 8; i < 16; i++){ add(s0 + i, 'timp', 'A1'); if (i >= 12) add(s0 + i, 'snare'); }
  }));

  return LOOP;
});

// ===== メニューBGM（オリジナル曲。FFのメニュー画面っぽい、ハープが上り下りする分散和音） =====
// 4/4・16分音符のハープが2オクターブ上がって下がる。和音は D Bm G A / D F#m G A を2小節ずつ（1周 約44秒）
const menuBgm = makePlayer(.1, ({ add, bar, up8 }) => {
  const CH = [['D3','F#3','A3','C#4'], ['B2','D3','F#3','A3'], ['G2','B2','D3','F#3'], ['A2','C#3','E3','G3'],
              ['D3','F#3','A3','D4'],  ['F#2','A2','C#3','E3'], ['G2','B2','D3','E3'],  ['A2','C#3','E3','A3']];
  const MEL = [['F#5',16], ['D5',16], ['B4',8,'D5',8], ['C#5',16], ['A5',16], ['C#5',8,'E5',8], ['D5',12,'E5',4], ['C#5',16]];
  CH.forEach((c, b) => {
    // 上り8音（2オクターブ）＋下り8音を2拍ずつ繰り返す＝1小節で上って下りる
    const upNotes = [...c, ...c.map(up8)], seq = [...upNotes, ...[...upNotes].reverse()];
    bar(16, 88, s0 => { seq.forEach((n, i) => add(s0 + i, 'harp', up8(n), 1)); add(s0, 'pedal', c[0].replace(/\d/, d => String(+d - 1)), 16); c.slice(1, 3).forEach(n => add(s0, 'pad', up8(n), 16)); if (b === 0) add(s0, 'bell', 'A5'); });
    bar(16, 88, s0 => { seq.forEach((n, i) => add(s0 + i, 'harp', up8(n), 1)); add(s0, 'pedal', c[0].replace(/\d/, d => String(+d - 1)), 16); c.slice(1, 3).forEach(n => add(s0, 'pad', up8(n), 16));
      const m = MEL[b]; let s1 = s0; for (let i = 0; i < m.length; i += 2){ add(s1, 'flute', m[i], m[i + 1]); s1 += m[i + 1]; } });
  });
  return 0;
});

// 戦闘BGM：設定で選んだ曲を鳴らす（1曲目＋別バージョン5曲）
// P4 は専用の曲（設定の一覧の最後にも入れて、試聴できるように）
const P4_TRACK = { name:'混沌への決戦（ト短調・P4 の曲）', player:makePlayer(.21, p4Battle) }; // 音数が少ない分、ほかの曲と同じくらいの大きさに
const BGM_TRACKS = [{ name:'混沌の聖歌（ニ短調・7/8）', player:bgm1 }, ...EXTRA_TRACKS.map((t: any) => ({ name:t.name, player:makePlayer(.125, t.build, t.rev || 0) })), P4_TRACK];
let forced = null; // ギミックで決まった曲（P4）。null なら設定で選んだ曲
const bgm = {
  use(id: string | null){ forced = id === 'p4' ? P4_TRACK : null; },
  start(){ (forced || BGM_TRACKS[opt.track] || BGM_TRACKS[0]).player.start(); },
  stop(fade?: number){ BGM_TRACKS.forEach(t => t.player.stop(fade)); },
};
function applyBgmVol(){ menuBgm.setVol(); BGM_TRACKS.forEach(t => t.player.setVol()); }
export { SFX_VOL, sfx, makePlayer, bgm, menuBgm, BGM_TRACKS, applyBgmVol };
