// @ts-nocheck
// ===== バトルBGM（オリジナル曲）「紅き疾走」 =====
// 目標の雰囲気：アクションRPGのボス戦の疾走ロック（ホ短調・BPM176）
//   歪んだギターの16分リフ（ベースとユニゾン）、ツーバスの連打、バイオリンの主旋律、ピアノの分散和音、キメの後のシンセのソロ
// 旋律・リフ・和声はすべてオリジナル
//
// 構成（1小節＝16分音符×16）
//   イントロ（4小節・最初だけ）：ギターとベースのユニゾンのリフ → パワーコードのキメ → スネアの連打
//   A（4小節）：メインのリフ。上でバイオリンが長い音で叫ぶ
//   B（8小節）：バイオリンの主旋律。ギターは刻み、ピアノが16分で分散和音
//   C（8小節）：サビ。旋律が高く、ハモリと弦が入り、ツーバスで畳みかける
//   D（8小節）：シンセの速弾きソロ（和声的短音階の16分の駆け上がり）→ タム回しで A へ
//   ループ＝A → B → C → D（28小節 約38秒）

const BPM = 176;

function rush(api){
  const { add, bar, up8, dn8, fill, below, pos } = api;

  // ---------- パート ----------
  // ギターとベースのユニゾン・リフ（1小節16音）
  const riff = (s0, notes) => notes.forEach((n, i) => { if (!n) return; add(s0 + i, 'riff', n, 1); add(s0 + i, 'bass', n, 1); });
  // ギターの刻み（ルートの16分、アクセントでパワーコード）
  const chug = (s0, root, accent = [0, 6, 12]) => { for (let i = 0; i < 16; i++){ add(s0 + i, 'gtr', root, accent.includes(i) ? 2 : 1); add(s0 + i, 'bass', root, 1); } };
  // ピアノの16分の分散和音（上がって下がる）
  const PIANO = [0, 1, 2, 3, 4, 3, 2, 1];
  const piano = (s0, chord) => { const t = [chord[0], chord[1], chord[2], up8(chord[0]), up8(chord[1])]; for (let i = 0; i < 16; i++) add(s0 + i, 'piano', up8(t[PIANO[i % 8]]), 1); };
  // 旋律（バイオリン）。harm に和音を渡すと下にハモリ
  const mel = (s0, notes, ch = 'violin', harm = null) => { let s = s0; notes.forEach(([n, l]) => { if (n){ add(s, ch, n, l); if (harm) add(s, 'violin2', below(n, harm), l); } s += l; }); };
  // ドラム：double＝ツーバス（16分ぜんぶ）、ふだんは 8分
  const drums = (s0, { crash = false, double = false, snares = [4, 12] } = {}) => {
    if (crash) add(s0, 'crash');
    for (let i = 0; i < 16; i++){ if (double || i % 2 === 0) add(s0 + i, 'kick'); if (i % 2 === 0) add(s0 + i, 'hat'); }
    snares.forEach(i => add(s0 + i, 'snare'));
  };
  const strings = (s0, chord) => chord.forEach(n => add(s0, 'str', up8(n), 16));

  // メインのリフ（ホ短調。開放弦の E を叩きながら、上の音が動く）
  const RIFF   = ['E2','E2','E3','E2','D3','E2','G2','E2','A2','E2','Bb2','A2','G2','E2','D2','E2'];
  const RIFF_UP = ['E2','E2','E3','E2','D3','E2','G2','E2','B2','B2','C3','C#3','D3','D#3','E3','F#3']; // 4小節目：半音で駆け上がる

  // ---------- イントロ（最初だけ） ----------
  bar(16, BPM, s0 => { riff(s0, RIFF); for (let i = 8; i < 16; i++) add(s0 + i, 'kick'); add(s0 + 12, 'snare'); });
  bar(16, BPM, s0 => { riff(s0, RIFF); drums(s0, { crash:true }); });
  // パワーコードのキメ：C5 → D5 → （休み）→ B5 を伸ばす
  bar(16, BPM, s0 => {
    [[0, 'C2'], [3, 'D2'], [6, 'C2'], [10, 'D2']].forEach(([i, r]) => { add(s0 + i, 'gtr', r, 2); add(s0 + i, 'bass', r, 2); add(s0 + i, 'kick'); add(s0 + i, 'crash'); });
    add(s0 + 12, 'gtr', 'B1', 4); add(s0 + 12, 'bass', 'B1', 4); add(s0 + 12, 'kick');
  });
  bar(16, BPM, s0 => { add(s0, 'gtr', 'B1', 8); add(s0, 'bass', 'B1', 8); add(s0, 'violin', 'F#5', 16); fill(s0, 0, 16, 'roll'); });

  const LOOP = pos();

  // ---------- A：メインのリフ ----------
  const A_CRY = [['B5', 16], ['G5', 16], ['A5', 16], ['B5', 16]]; // バイオリンが上で長く叫ぶ
  for (let b = 0; b < 4; b++) bar(16, BPM, s0 => {
    riff(s0, b === 3 ? RIFF_UP : RIFF);
    drums(s0, { crash:b === 0, double:true });
    add(s0, 'violin', A_CRY[b][0], A_CRY[b][1]);
    add(s0, 'violin2', b === 1 ? 'E5' : b === 2 ? 'F#5' : 'G5', 16);
  });

  // ---------- B：主旋律 ----------
  const B_CH = [['E3','G3','B3'], ['C3','E3','G3'], ['D3','F#3','A3'], ['B2','D3','F#3'],
                ['E3','G3','B3'], ['C3','E3','G3'], ['A2','C3','E3'], ['B2','D#3','F#3']];
  const B_ROOT = ['E2','C2','D2','B1','E2','C2','A1','B1'];
  const B_MEL = [
    [['B4',4],['E5',4],['F#5',2],['G5',2],['F#5',2],['E5',2]],
    [['G5',6],['A5',2],['G5',2],['E5',2],['C5',4]],
    [['F#5',4],['A5',4],['D6',6],['C6',2]],
    [['B5',8],['A5',2],['F#5',2],['D5',4]],
    [['E5',2],['G5',2],['B5',4],['A5',2],['G5',2],['F#5',2],['G5',2]],
    [['E6',6],['D6',2],['C6',4],['G5',4]],
    [['A5',3],['C6',3],['E6',2],['D6',3],['C6',3],['B5',2]],
    [['D#6',8],['B5',4],['F#5',4]],
  ];
  B_CH.forEach((c, b) => bar(16, BPM, s0 => {
    chug(s0, B_ROOT[b]);
    drums(s0, { crash:b % 4 === 0 });
    piano(s0, c);
    mel(s0, B_MEL[b]);
    if (b === 7) fill(s0, 12, 16, 'tom', ['B2', 'A2', 'F#2', 'D#2']);
  }));

  // ---------- C：サビ（高く、ハモリと弦、ツーバス） ----------
  const C_CH = [['C3','E3','G3'], ['D3','F#3','A3'], ['B2','D3','F#3'], ['E3','G3','B3'],
                ['A2','C3','E3'], ['D3','F#3','A3'], ['G2','B2','D3'], ['B2','D#3','F#3']];
  const C_ROOT = ['C2','D2','B1','E2','A1','D2','G1','B1'];
  const C_MEL = [
    [['E6',6],['D6',2],['E6',4],['G6',4]],
    [['F#6',6],['E6',2],['D6',4],['A5',4]],
    [['B5',3],['D6',3],['F#6',2],['E6',4],['D6',4]],
    [['E6',10],['D6',2],['E6',2],['F#6',2]],
    [['G6',6],['F#6',2],['E6',4],['C6',4]],
    [['D6',3],['E6',3],['F#6',2],['A6',8]],
    [['G6',6],['F#6',2],['D6',4],['B5',4]],
    [['D#6',4],['F#6',4],['B6',8]],
  ];
  C_CH.forEach((c, b) => bar(16, BPM, s0 => {
    chug(s0, C_ROOT[b], [0, 3, 6, 8, 11, 14]);
    drums(s0, { crash:b % 2 === 0, double:true });
    strings(s0, c);
    piano(s0, c);
    mel(s0, C_MEL[b], 'violin', c);
    add(s0, 'bell', up8(up8(c[0])));
    if (b === 7) fill(s0, 8, 16, 'flam', ['B2', 'A2', 'F#2', 'D#2']);
  }));

  // ---------- D：シンセの速弾きソロ ----------
  // ホ短調の和声的短音階（D# を使う）で、16分の駆け上がり・駆け下り。4小節の型を2回（2回目は1オクターブ上から）
  const SCALE = ['E','F#','G','A','B','C','D#'];
  const run = (startOct, startDeg, dir, len) => { const out = []; let d = startDeg, o = startOct;
    for (let i = 0; i < len; i++){ out.push(SCALE[((d % 7) + 7) % 7] + (o + Math.floor(d / 7))); d += dir; } return out; };
  const D_CH = [['E3','G3','B3'], ['D3','F#3','A3'], ['C3','E3','G3'], ['B2','D#3','F#3']];
  const D_ROOT = ['E2','D2','C2','B1'];
  for (let k = 0; k < 2; k++) D_CH.forEach((c, b) => bar(16, BPM, s0 => {
    // ソロの型：上がる → 下がる → 3音ずつのシーケンス → 長い音でしめ
    const o = 5 + k;
    let notes;
    if (b === 0) notes = run(o - 1, 0, 1, 16);                                             // E から2オクターブ近く駆け上がる
    else if (b === 1) notes = run(o + 1, 1, -1, 16);                                       // 上から駆け下りる
    else if (b === 2) notes = [0,1,2, 1,2,3, 2,3,4, 3,4,5, 4,5,6, 7].map(d => SCALE[d % 7] + (o + Math.floor(d / 7)));
    else notes = null;
    if (notes) notes.forEach((n, i) => add(s0 + i, 'syn', n, 1));
    else { add(s0, 'syn', 'D#' + (o + 1), 8); add(s0 + 8, 'syn', 'F#' + (o + 1), 8); }
    chug(s0, D_ROOT[b], [0, 8]);
    drums(s0, { crash:b === 0, double:k === 1 });
    c.forEach(n => add(s0, 'organ', up8(n), 16));
    if (k === 1 && b === 3) fill(s0, 8, 16, 'tom', ['E3', 'D3', 'B2', 'G2']);
  }));

  return LOOP;
}

export { rush };
