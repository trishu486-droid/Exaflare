// @ts-nocheck
// ===== P4 のBGM（オリジナル曲）「混沌への決戦」 =====
// 目標の音楽性：スーパーファミコン時代のラスボス戦の16bitプログレッシブ・ロック（ト短調・BPM142）
// 旋律・和声はすべてオリジナル。音色はオシレーター（矩形・ノコギリ・パルス・ノイズ）の重ね合わせ
//
// 構成（1小節＝16分音符×16）
//   イントロ（4小節・最初だけ）：タム回し → 半音ずつ下がるブラスとオーケストラヒットのキメ → オルガンの16分アルペジオが渦を巻く
//   A（8小節）：シンセブラスの主旋律（シンコペーション）、スラップベース（ルートとオクターブ・裏拍強調）、オルガンの裏打ち＋小節終わりのグリッサンド
//   B（8小節）：旋律が一段高く、ベースが半音階で下がる。最後はディミニッシュのキメ
//   A'（8小節）：A の旋律に3度上のハモリ・ストリングス・対旋律を足して厚く
//   C（4小節）：オルガンのアルペジオが前に出るブリッジ。ベースが半音で上がって D7 から A の頭へ戻る
//   ループ＝A → B → A' → C（28小節 約47秒）
// 各パート（ブラス・オルガン・ベース・ドラム・アルペジオ）は下の関数ごとに独立して書き、同じ小節の上で同期させる

const BPM = 142;

function p4Battle(api){
  const { add, bar, up8, dn8, fill, below, tr, pos } = api;

  // ---------- パートごとの書き方 ----------
  // シンセブラス（主旋律）：[音, 長さ] の列。null は休み
  const brass = (s0, notes, ch = 'sbrass') => { let s = s0; notes.forEach(([n, l]) => { if (n) add(s, ch, n, l); s += l; }); };
  // ブラスの下に、和音の中の音でハモリ
  const brassHarm = (s0, notes, chord) => { let s = s0; notes.forEach(([n, l]) => { if (n) add(s, 'sbrass2', below(n, chord), l); s += l; }); };
  // 3度上のハモリ（A' 用）：和音の中で旋律より上の一番近い音
  const above = (n, chord) => { const m = tr(n, 0); let best = m + 12; chord.forEach(c => { let x = tr(c, 0); while (x <= m + 2) x += 12; while (x - 12 > m + 2) x -= 12; if (x < best) best = x; }); return best; };
  const brassUp = (s0, notes, chord) => { let s = s0; notes.forEach(([n, l]) => { if (n) add(s, 'sbrass2', above(n, chord), l); s += l; }); };

  // スラップベース：ルート（低）とオクターブ（ポップ）を行き来。裏の16分（奇数）にポップを置いて疾走感
  const SLAP = 'R.PR.RP.R.PRP.RP'; // R＝ルート、P＝オクターブ上のポップ、.＝休み
  const slap = (s0, root, pat = SLAP) => { [...pat].forEach((c, i) => { if (c === 'R') add(s0 + i, 'slap', root, 1); else if (c === 'P') add(s0 + i, 'pop', up8(root), 1); }); };
  // 半音階で動くベース（B・C 用）：4分ごとに音を変える
  const walk = (s0, notes) => notes.forEach((n, k) => { add(s0 + k * 4, 'slap', n, 2); add(s0 + k * 4 + 2, 'pop', up8(n), 1); add(s0 + k * 4 + 3, 'slap', n, 1); });

  // ロックオルガン：裏拍（8分の裏）を突くコード。end で小節終わりにグリッサンド（駆け上がり）
  const organ = (s0, chord, { gliss = false, hits = [2, 6, 10, 14] } = {}) => {
    hits.forEach(i => chord.forEach(n => add(s0 + i, 'rorg', n, 2)));
    if (gliss){ // 和音の音を16分で一気に上がる（最後の4つ）
      const g = [chord[0], chord[1], chord[2], up8(chord[0])];
      g.forEach((n, k) => add(s0 + 12 + k, 'rorg', up8(n), 1));
    }
  };
  // アルペジオ（16分で渦を巻く）：和音を上がって下がる
  const ARP = [0, 1, 2, 3, 4, 3, 2, 1];
  const arp = (s0, chord, len = 16, ch = 'arp') => {
    const tones = [chord[0], chord[1], chord[2], up8(chord[0]), up8(chord[1])];
    for (let i = 0; i < len; i++) add(s0 + i, ch, up8(tones[ARP[i % ARP.length]]), 1);
  };
  // ドラム：ロックの8ビート（キック 0・3・8・10、スネア 4・12、ハイハット 8分）
  const drums = (s0, { crash = false, kicks = [0, 3, 8, 10], snares = [4, 12], hat = 2 } = {}) => {
    if (crash) add(s0, 'crash');
    kicks.forEach(i => add(s0 + i, 'kick'));
    snares.forEach(i => add(s0 + i, 'snare'));
    for (let i = 0; i < 16; i += hat) add(s0 + i, 'hat');
  };
  const pad = (s0, chord, len = 16) => chord.forEach(n => add(s0, 'str', n, len));

  // ---------- イントロ（最初だけ） ----------
  // 1小節目：タム回し（16分で高い方から低い方へ、2周）
  bar(16, BPM, s0 => {
    const toms = ['G3', 'F3', 'D3', 'C3', 'Bb2', 'G2', 'F2', 'D2'];
    for (let i = 0; i < 16; i++){ add(s0 + i, 'tom', toms[i % 8]); if (i % 4 === 0) add(s0 + i, 'kick'); }
    add(s0 + 15, 'snare');
  });
  // 2小節目：半音ずつ下がる重いキメ（ブラス＋オーケストラヒット）。G → F# → F → E、最後に Eb で伸ばす
  bar(16, BPM, s0 => {
    const hits = [[0, ['G3', 'Bb3', 'D4']], [3, ['F#3', 'A3', 'C#4']], [6, ['F3', 'Ab3', 'C4']], [10, ['E3', 'G3', 'B3']]];
    hits.forEach(([i, c]) => { c.forEach(n => { add(s0 + i, 'ohit', n, 2); add(s0 + i, 'sbrass', up8(n), 2); }); add(s0 + i, 'slap', dn8(c[0]), 2); add(s0 + i, 'kick'); add(s0 + i, 'crash'); });
    ['Eb3', 'G3', 'Bb3'].forEach(n => { add(s0 + 12, 'ohit', n, 4); add(s0 + 12, 'sbrass', up8(n), 4); });
    add(s0 + 12, 'slap', 'Eb2', 4); add(s0 + 12, 'kick'); add(s0 + 12, 'timp', 'Eb2');
    add(s0 + 14, 'snare'); add(s0 + 15, 'snare');
  });
  // 3小節目：オルガンの16分アルペジオが鳴り始める（Gm）。下でブラスの持続とティンパニ
  bar(16, BPM, s0 => {
    arp(s0, ['G3', 'Bb3', 'D4'], 16, 'rorgA');
    ['G3', 'D4'].forEach(n => add(s0, 'sbrass2', n, 16));
    add(s0, 'slap', 'G1', 16); add(s0, 'timp', 'G2'); add(s0 + 8, 'timp', 'G2');
    for (let i = 0; i < 16; i += 2) add(s0 + i, 'hat');
  });
  // 4小節目：D7 で焦りを高める。アルペジオは高く、スネアロールでなだれ込む
  bar(16, BPM, s0 => {
    arp(s0, ['D4', 'F#4', 'A4'], 16, 'rorgA');
    ['D4', 'F#4', 'C5'].forEach(n => add(s0, 'sbrass2', n, 12));
    add(s0, 'slap', 'D2', 8); add(s0 + 8, 'slap', 'D2', 4);
    fill(s0, 8, 16, 'roll');
  });

  const LOOP = pos();

  // ---------- A（メインテーマ） ----------
  const A_CH = [['G3', 'Bb3', 'D4'], ['Eb3', 'G3', 'Bb3'], ['F3', 'A3', 'C4'], ['D3', 'F#3', 'A3'],
                ['G3', 'Bb3', 'D4'], ['Eb3', 'G3', 'Bb3'], ['C3', 'Eb3', 'G3'], ['D3', 'F#3', 'C4']];
  const A_ROOT = ['G1', 'Eb2', 'F1', 'D2', 'G1', 'Eb2', 'C2', 'D2'];
  // 主旋律（オリジナル）：付点のリズムと、小節線をまたぐシンコペーション
  const A_MEL = [
    [['G4', 3], ['Bb4', 3], ['D5', 2], ['C5', 2], ['D5', 2], ['F5', 4]],
    [['G5', 6], ['F5', 2], ['Eb5', 2], ['D5', 2], ['Bb4', 4]],
    [['C5', 3], ['D5', 3], ['F5', 2], ['A5', 3], ['G5', 3], ['F5', 2]],
    [['A5', 8], ['G5', 2], ['F#5', 2], ['D5', 4]],
    [['G4', 3], ['Bb4', 3], ['D5', 2], ['G5', 4], ['F5', 2], ['G5', 2]],
    [['Bb5', 6], ['A5', 2], ['G5', 2], ['Eb5', 2], ['G5', 4]],
    [['C6', 3], ['Bb5', 3], ['G5', 2], ['Eb5', 3], ['F5', 3], ['G5', 2]],
    [['F#5', 6], ['A5', 2], ['D6', 8]],
  ];
  const sectionA = (variant) => A_CH.forEach((c, b) => bar(16, BPM, s0 => {
    drums(s0, { crash:b % 4 === 0 });
    slap(s0, A_ROOT[b]);
    organ(s0, c, { gliss:b % 2 === 1 });
    arp(s0, c, 16, 'arp');
    brass(s0, A_MEL[b]);
    if (variant){ // A'：3度上のハモリ、ストリングス、ブラスの低い持続
      brassUp(s0, A_MEL[b], c); pad(s0, c.map(up8));
      add(s0, 'sbrass2', c[0], 16);
    } else brassHarm(s0, A_MEL[b], c);
    if (b === 7) fill(s0, 12, 16, 'tom', ['D3', 'C3', 'A2', 'F#2']);
  }));
  sectionA(false);

  // ---------- B（サビ・展開部）：旋律が一段高く、ベースは半音階で下がる ----------
  const B_CH = [['G3', 'Bb3', 'D4'], ['D3', 'F#3', 'A3'], ['D3', 'F3', 'A3'], ['E3', 'G3', 'Bb3', 'D4'],
                ['Eb3', 'G3', 'Bb3', 'D4'], ['D3', 'F#3', 'A3'], ['Ab3', 'C4', 'Eb4'], ['F#3', 'A3', 'C4', 'Eb4']];
  // ベース：G → F# → F → E → Eb → D と半音で下がり、Ab に跳んで、F#°（ディミニッシュ）でキメ
  const B_BASS = [['G1', 'G1', 'G2', 'F#2'], ['F#1', 'F#1', 'F#2', 'F2'], ['F1', 'F1', 'F2', 'E2'], ['E1', 'E1', 'E2', 'Eb2'],
                  ['Eb1', 'Eb1', 'Eb2', 'D2'], ['D1', 'D1', 'D2', 'Eb2'], ['Ab1', 'Ab1', 'Ab2', 'G2'], null];
  const B_MEL = [
    [['D6', 6], ['C6', 2], ['Bb5', 4], ['A5', 2], ['Bb5', 2]],
    [['A5', 8], ['F#5', 4], ['A5', 2], ['C6', 2]],
    [['D6', 3], ['F6', 3], ['E6', 2], ['D6', 4], ['C6', 2], ['A5', 2]],
    [['Bb5', 8], ['G5', 4], ['Bb5', 2], ['D6', 2]],
    [['G6', 6], ['F6', 2], ['Eb6', 2], ['D6', 2], ['Bb5', 4]],
    [['A5', 6], ['D6', 2], ['F#6', 8]],
    [['Eb6', 3], ['F6', 3], ['Eb6', 2], ['C6', 4], ['Ab5', 4]],
    null,
  ];
  B_CH.forEach((c, b) => bar(16, BPM, s0 => {
    if (b < 7){
      drums(s0, { crash:b % 2 === 0, kicks:[0, 3, 6, 8, 10, 14] });
      walk(s0, B_BASS[b]);
      organ(s0, c.slice(0, 3), { gliss:b === 3 || b === 5 });
      arp(s0, c, 16, 'arp');
      pad(s0, c);
      brass(s0, B_MEL[b]); brassHarm(s0, B_MEL[b], c);
      add(s0, 'bell', up8(up8(c[0])));
    } else {
      // キメ：F#°7 を 0・3・6 で叩き、ブラスが半音で駆け上がって A の頭（Gm）へ
      [0, 3, 6].forEach(i => { c.forEach(n => { add(s0 + i, 'ohit', n, 2); add(s0 + i, 'sbrass', up8(n), 2); }); add(s0 + i, 'slap', 'F#1', 2); add(s0 + i, 'kick'); add(s0 + i, 'crash'); });
      ['A4', 'Bb4', 'B4', 'C5', 'C#5', 'D5'].forEach((n, k) => add(s0 + 9 + k, 'sbrass', n, 1));
      add(s0 + 15, 'sbrass', 'D5', 1);
      fill(s0, 8, 16, 'flam', ['D3', 'C3', 'A2', 'F#2']);
      add(s0 + 8, 'slap', 'D2', 8);
    }
  }));

  // ---------- A'（主題の再現・厚く） ----------
  sectionA(true);

  // ---------- C（ブリッジ）：オルガンのアルペジオが前に出る。ベースは半音で上がる ----------
  const C_CH = [['G3', 'Bb3', 'D4'], ['Ab3', 'C4', 'Eb4'], ['A3', 'C4', 'Eb4'], ['D3', 'F#3', 'A3', 'C4']];
  const C_BASS = [['G1', 'G1', 'G1', 'G1'], ['Ab1', 'Ab1', 'Ab1', 'Ab1'], ['A1', 'A1', 'A1', 'A1'], ['D2', 'D2', 'C2', 'C2']];
  C_CH.forEach((c, b) => bar(16, BPM, s0 => {
    arp(s0, c, 16, 'rorgA');                        // オルガンの16分アルペジオが主役
    arp(s0, c.map(up8), 16, 'arp');                 // 1オクターブ上で重ねて渦を巻く
    walk(s0, C_BASS[b]);
    c.slice(0, 3).forEach(n => add(s0, 'sbrass2', n, 16)); // ブラスの低い持続
    drums(s0, { crash:b === 0, kicks:[0, 8], snares:[8], hat:2 }); // ハーフタイム
    add(s0, 'timp', c[0].replace(/\d/, '2'));
    if (b === 3){ fill(s0, 8, 16, 'tom', ['D3', 'C3', 'A2', 'F#2']); [0, 4].forEach(i => c.forEach(n => add(s0 + i, 'ohit', n, 2))); }
  }));

  return LOOP;
}

export { p4Battle };
