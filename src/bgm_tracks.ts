// ===== 戦闘BGMの別バージョン（すべてオリジナル曲） =====
// コンセプトは1曲目と同じ：ラスボス戦・パイプオルガン・歪んだギター・変拍子・聖歌風の急な減速・8bitの音色
// 各曲は build(api) を返す。api：add(ステップ, パート, 音, 長さ) / bar(長さ, BPM, fn) / up8・dn8（オクターブ）/ tr(音, 半音) / below(音, 和音)

// よく使う伴奏の組み立て（ドラム・ギター・ベース・分散和音・弦）
function kit(api){
  const { add, up8 } = api;
  return {
    // ドラム：kick='all'（16分全部）/'8'（8分）/'4'（4分）、snare の位置、ハイハット
    drums(s0, len, { kick = 'all', snare = [4, 12], hat = true, crash = false } = {}){
      if (crash) add(s0, 'crash');
      for (let i = 0; i < len; i++){
        if (kick === 'all' || (kick === '8' && i % 2 === 0) || (kick === '4' && i % 4 === 0)) add(s0 + i, 'kick');
        if (hat) add(s0 + i, 'hat');
      }
      snare.filter(i => i < len).forEach(i => add(s0 + i, 'snare'));
    },
    // 歪んだギターの刻みとベース。accent の位置は長め
    chug(s0, len, root, accent = [0]){
      for (let i = 0; i < len; i++){ add(s0 + i, 'gtr', root, accent.includes(i) ? 2 : 1); add(s0 + i, 'bass', root, 1); }
    },
    arp(s0, len, chord, pat = [0, 1, 2, 1]){
      for (let i = 0; i < len; i++){ const k = pat[i % pat.length], n = k < chord.length ? chord[k] : up8(chord[k - chord.length]); add(s0 + i, 'arp', up8(n), 1); }
    },
    pad(s0, len, chord, organ = true){ chord.forEach(n => { if (organ) add(s0, 'organ', n, len); add(s0, 'str', n, len); }); },
    // 旋律：[音, 長さ] の列。harm に和音を渡すと下にハモリ
    mel(s0, notes, ch = 'lead', harm = null){ let s = s0; notes.forEach(([n, l]) => { if (n) { add(s, ch, n, l); if (harm) add(s, 'harm', api.below(n, harm), l); } s += l; }); },
  };
}

// 2曲目「レクイエム」：ホ短調・140。5/4拍子のリフ → 4/4の旋律 → 聖歌
function requiem(api){
  const { add, bar, up8, dn8, pos } = api, K = kit(api);
  bar(16, 140, s0 => { ['E2','B2','E3','G3','B3','E4'].forEach(n => add(s0, 'organ', n, 16)); add(s0, 'bell', 'E5'); add(s0 + 8, 'bell', 'B5'); add(s0, 'choir', 'B4', 16); add(s0, 'timp', 'E2'); add(s0, 'crash'); });
  bar(16, 140, s0 => { ['B1','B2','F#3','A3','D#4'].forEach(n => add(s0, 'organ', n, 16)); for (let i = 0; i < 16; i++){ add(s0 + i, 'timp', 'B1'); if (i >= 8) add(s0 + i, 'snare'); } add(s0, 'choir', 'D#5', 16); });
  const LOOP = pos();
  // A：5/4（20ステップ、6+6+8 に刻む）
  const A = [['E3','G3','B3'], ['C3','E3','G3'], ['A2','C3','E3'], ['B2','D#3','F#3']];
  A.forEach((c, b) => bar(20, 140, s0 => {
    const r = dn8(c[0]); K.chug(s0, 20, r, [0, 6, 12]); K.drums(s0, 20, { snare:[6, 12, 16, 18], crash:b % 2 === 0 });
    [0, 6, 12].forEach(i => c.forEach(n => add(s0 + i, 'stab', up8(n), 2)));
    [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 0].forEach((k, i) => add(s0 + i, 'toc', up8(k < 3 ? c[k] : up8(c[0])), 1));
    K.pad(s0, 20, c.map(up8), false); add(s0, 'choir', up8(up8(c[0])), 20);
    if (b === 3) api.fill(s0, 16, 20);
  }));
  // B：4/4 の旋律
  const B = [['E4','G4','B4'], ['C4','E4','G4'], ['G3','B3','D4'], ['D4','F#4','A4'], ['A3','C4','E4'], ['B3','D#4','F#4','A4']];
  const M = [[['B4',4],['E5',4],['G5',6],['F#5',2]], [['E5',8],['G5',4],['C6',4]], [['B5',6],['A5',2],['G5',4],['D5',4]], [['F#5',12],['A5',4]], [['C6',4],['B5',4],['A5',4],['E5',4]], [['D#5',4],['F#5',4],['A5',4],['B5',4]]];
  B.forEach((c, b) => bar(16, 140, s0 => {
    const r = dn8(dn8(c[0])); K.chug(s0, 16, r, [0, 8]); K.drums(s0, 16, { kick:'8', snare:[4, 12], crash:b % 2 === 0 });
    K.pad(s0, 16, c); add(s0, 'pedal', r, 16); K.arp(s0, 16, c, [0, 1, 2, 3]); K.mel(s0, M[b], 'lead', c); add(s0, 'bell', up8(up8(c[0])));
    if (b === 5) api.fill(s0, 12, 16);
  }));
  // C：聖歌（60）
  ([[['E3','G3','B3','E4'], [['G4',8],['B4',8]]], [['B2','D#3','F#3','B3'], [['F#4',8],['D#4',8]]]] as [string[], [string, number][]][]).forEach(([c, m]) => bar(16, 60, s0 => {
    c.forEach(n => add(s0, 'organ', n, 16)); add(s0, 'pedal', dn8(c[0]), 16); K.mel(s0, m, 'choir'); K.mel(s0, m.map(([n, l]) => [up8(n), l]), 'choir');
    for (let i = 0; i < 16; i += 2) add(s0 + i, 'harp', up8(c[(i / 2) % 4])); add(s0, 'timp', c[0]);
  }));
  return LOOP;
}

// 3曲目「テンペスト」：ハ短調・152。16分のオルガン・トッカータで押し切る → 6/8 の合唱
function tempest(api){
  const { add, bar, up8, dn8, pos } = api, K = kit(api);
  bar(16, 152, s0 => { ['C6','Bb5','Ab5','G5','F5','Eb5','D5','C5','Bb4','Ab4','G4','F4','Eb4','D4','C4','B3'].forEach((n, i) => { add(s0 + i, 'toc', n, 1); add(s0 + i, 'toc', dn8(n), 1); }); add(s0, 'crash'); });
  bar(16, 152, s0 => { ['C2','G2','C3','Eb3','G3','C4'].forEach(n => add(s0, 'organ', n, 16)); for (let i = 0; i < 16; i++) add(s0 + i, 'timp', i < 8 ? 'C2' : 'G1'); add(s0 + 12, 'crash'); });
  const LOOP = pos();
  const A = [['C4','Eb4','G4'], ['Ab3','C4','Eb4'], ['Bb3','D4','F4'], ['G3','B3','D4']];
  A.forEach((c, b) => bar(16, 152, s0 => {
    const r = dn8(dn8(c[0])); K.chug(s0, 16, r, [0, 6, 10]); K.drums(s0, 16, { kick:'8', snare:[4, 12], crash:b === 0 });
    [0, 1, 2, 3, 2, 1, 0, 1].forEach((k, i) => { const n = k < 3 ? c[k] : up8(c[0]); add(s0 + i * 2, 'toc', up8(n), 1); add(s0 + i * 2 + 1, 'toc', n, 1); });
    K.pad(s0, 16, c); add(s0, 'choir', up8(c[2]), 16);
  }));
  const B = [['C4','Eb4','G4'], ['Ab3','C4','Eb4'], ['Eb4','G4','Bb4'], ['Bb3','D4','F4'], ['F4','Ab4','C5'], ['G3','B3','D4'], ['C4','Eb4','G4'], ['G3','B3','D4','F4']];
  const M = [[['G5',4],['C6',4],['Eb6',4],['D6',2],['C6',2]], [['C6',8],['Ab5',4],['Eb5',4]], [['G5',4],['Bb5',4],['Eb6',6],['D6',2]], [['D6',12],['F5',4]],
             [['Ab5',4],['C6',4],['F6',4],['Eb6',2],['D6',2]], [['D6',4],['B5',4],['G5',4],['F5',4]], [['Eb5',2],['G5',2],['C6',4],['Eb6',8]], [['D6',4],['B5',4],['D6',4],['G6',4]]];
  B.forEach((c, b) => bar(16, 152, s0 => {
    const r = dn8(dn8(c[0])); K.chug(s0, 16, r, [0, 8]); K.drums(s0, 16, { kick:'all', snare:[4, 12], crash:b % 4 === 0 });
    K.pad(s0, 16, c); K.arp(s0, 16, c, [0, 2, 1, 2]); K.mel(s0, M[b], 'lead', c); add(s0, 'pedal', r, 16);
    if (b === 7) api.fill(s0, 12, 16);
  }));
  // 6/8（12ステップ）・100 の合唱
  [['Ab3','C4','Eb4'], ['G3','B3','D4'], ['Ab3','C4','Eb4'], ['G3','B3','D4','F4']].forEach((c, b) => bar(12, 100, s0 => {
    c.forEach(n => add(s0, 'organ', n, 12)); add(s0, 'choir', up8(c[b % 2 ? 1 : 2]), 12); add(s0, 'choir', up8(c[0]), 12);
    [0, 6].forEach(i => { add(s0 + i, 'timp', dn8(c[0])); add(s0 + i, 'bell', up8(up8(c[0]))); });
    for (let i = 0; i < 12; i += 2) add(s0 + i, 'harp', up8(c[(i / 2) % c.length]));
  }));
  return LOOP;
}

// 4曲目「狂気のワルツ」：ト短調・3/4 の速いワルツ（180）→ 7/8 の重いリフ（150）→ 聖歌
function waltz(api){
  const { add, bar, up8, dn8, pos } = api, K = kit(api);
  bar(12, 180, s0 => { ['G2','D3','G3','Bb3','D4'].forEach(n => add(s0, 'organ', n, 12)); add(s0, 'bell', 'G5'); add(s0, 'crash'); });
  bar(12, 180, s0 => { ['D2','A2','D3','F#3','C4'].forEach(n => add(s0, 'organ', n, 12)); [0, 4, 8].forEach(i => add(s0 + i, 'timp', 'D2')); add(s0 + 8, 'bell', 'F#5'); });
  const LOOP = pos();
  const W = [['G3','Bb3','D4'], ['G3','Bb3','D4'], ['C4','Eb4','G4'], ['C4','Eb4','G4'], ['D4','F#4','A4'], ['D4','F#4','A4','C5'], ['G3','Bb3','D4'], ['D4','F#4','A4','C5']];
  const M = [[['D5',4],['G5',4],['Bb5',4]], [['A5',4],['G5',4],['F#5',4]], [['G5',4],['C6',4],['Eb6',4]], [['D6',8],['C6',4]],
             [['A5',4],['F#5',4],['D5',4]], [['A5',4],['C6',4],['Eb6',4]], [['D6',4],['Bb5',4],['G5',4]], [['F#5',8],['A5',4]]];
  W.forEach((c, b) => bar(12, 180, s0 => {
    const r = dn8(dn8(c[0]));
    add(s0, 'bass', r, 4); add(s0, 'kick'); add(s0, 'gtr', r, 3); [4, 8].forEach(i => { c.forEach(n => add(s0 + i, 'stab', n, 2)); add(s0 + i, 'snare'); }); // ズン・チャッ・チャッ
    for (let i = 0; i < 12; i += 2) add(s0 + i, 'hat');
    K.mel(s0, M[b], 'lead', c); add(s0, 'str', c[0], 12); add(s0, 'str', c[2], 12);
    [0, 1, 2, 1, 2, 3].forEach((k, i) => add(s0 + i * 2, 'arp', up8(k < c.length ? c[k] : up8(c[0])), 1));
    if (b === 0 || b === 4) add(s0, 'crash');
  }));
  // 7/8（14）の重いリフ
  const R = [['Eb4','G4','Bb4'], ['D4','F#4','A4'], ['C4','Eb4','G4'], ['D4','F#4','A4','C5']];
  R.forEach((c, b) => bar(14, 150, s0 => {
    const r = dn8(dn8(c[0])); K.chug(s0, 14, r, [0, 4, 8]); K.drums(s0, 14, { snare:[4, 8, 11], crash:b % 2 === 0 });
    [0, 4, 8].forEach(i => c.slice(0, 3).forEach(n => add(s0 + i, 'stab', n, 2)));
    [c[0], c[1], c[2], c[1], c[0], c[1], c[2], c[1], c[0], c[2], up8(c[0]), c[2], c[1], c[0]].forEach((n, i) => add(s0 + i, 'toc', up8(n), 1));
    K.mel(s0, [[up8(c[2]), 4], [up8(c[1]), 4], [up8(c[0]), 6]], 'harm'); K.pad(s0, 14, c);
    if (b === 3) api.fill(s0, 10, 14);
  }));
  ([[['G2','D3','G3','Bb3'], [['Bb4',6],['A4',6]]], [['D2','A2','D3','F#3'], [['A4',6],['F#4',6]]]] as [string[], [string, number][]][]).forEach(([c, m]) => bar(12, 70, s0 => {
    c.forEach(n => add(s0, 'organ', n, 12)); K.mel(s0, m, 'choir'); K.mel(s0, m.map(([n, l]) => [up8(n), l]), 'choir'); add(s0, 'timp', c[0]); add(s0, 'bell', up8(up8(c[2])));
  }));
  return LOOP;
}

// 5曲目「終末の行進」：嬰ヘ短調・重い行進（112、ティンパニと合唱）→ 急加速（168）の旋律 → 聖歌
function march(api){
  const { add, bar, up8, dn8, pos } = api, K = kit(api);
  bar(16, 112, s0 => { ['F#2','C#3','F#3','A3','C#4'].forEach(n => add(s0, 'organ', n, 16)); [0, 4, 8, 12].forEach(i => add(s0 + i, 'timp', 'F#2')); add(s0, 'crash'); add(s0, 'choir', 'F#4', 16); add(s0, 'choir', 'C#5', 16); });
  const LOOP = pos();
  const A = [['F#3','A3','C#4'], ['D3','F#3','A3'], ['E3','G#3','B3'], ['C#3','F3','G#3']];
  A.forEach((c, b) => bar(16, 112, s0 => {
    const r = dn8(c[0]);
    [0, 8].forEach(i => { add(s0 + i, 'timp', r); add(s0 + i, 'kick'); add(s0 + i, 'gtr', r, 6); c.forEach(n => add(s0 + i, 'stab', up8(n), 4)); });
    [4, 12].forEach(i => add(s0 + i, 'snare')); if (b === 3) for (let i = 12; i < 16; i++) add(s0 + i, 'snare'); // 行進のスネア
    for (let i = 0; i < 16; i += 4) add(s0 + i, 'bass', dn8(r), 4);
    c.forEach(n => add(s0, 'organ', n, 16)); add(s0, 'choir', up8(c[0]), 16); add(s0, 'choir', up8(c[2]), 16); add(s0, 'bell', up8(up8(c[0])));
    for (let i = 0; i < 16; i += 2) add(s0 + i, 'hat');
  }));
  const B = [['F#4','A4','C#5'], ['D4','F#4','A4'], ['E4','G#4','B4'], ['C#4','F4','G#4'], ['B3','D4','F#4'], ['C#4','F4','G#4','B4']];
  const M = [[['C#5',4],['F#5',4],['A5',4],['G#5',2],['F#5',2]], [['A5',8],['F#5',4],['D5',4]], [['B5',4],['G#5',4],['E5',4],['B5',4]], [['G#5',8],['F5',4],['C#5',4]],
             [['D6',4],['C#6',4],['B5',4],['F#5',4]], [['C#6',12],['G#5',4]]];
  B.forEach((c, b) => bar(16, 168, s0 => {
    const r = dn8(dn8(c[0])); K.chug(s0, 16, r, [0, 8]); K.drums(s0, 16, { kick:'all', snare:[4, 12], crash:b % 2 === 0 });
    K.pad(s0, 16, c); K.arp(s0, 16, c, [0, 1, 2, 1]); K.mel(s0, M[b], 'lead', c); add(s0, 'pedal', r, 16);
    if (b === 5) api.fill(s0, 12, 16);
  }));
  ([[['F#2','A2','C#3','F#3'], [['A4',8],['C#5',8]]], [['C#2','F2','G#2','C#3'], [['G#4',8],['F4',8]]]] as [string[], [string, number][]][]).forEach(([c, m]) => bar(16, 66, s0 => {
    c.forEach(n => add(s0, 'organ', n, 16)); K.mel(s0, m, 'choir'); K.mel(s0, m.map(([n, l]) => [up8(n), l]), 'choir'); add(s0, 'timp', c[0]);
    for (let i = 0; i < 16; i += 2) add(s0 + i, 'harp', up8(up8(c[(i / 2) % 4])));
  }));
  return LOOP;
}

// 6曲目「混沌のフーガ」：イ短調・138。主題を旋律→5度上で追いかける → 9/8 のリフ → 聖歌
function fugue(api){
  const { add, bar, up8, dn8, tr, pos } = api, K = kit(api);
  const SUBJ = [['A4',2],['E5',2],['C5',2],['A4',2],['F5',4],['E5',2],['D5',2],['C5',2],['B4',2],['G#4',4],['A4',4],['E4',4]]; // 32ステップ（2小節）
  const play = (s0, notes, ch, k = 0) => { let s = s0; notes.forEach(([n, l]) => { add(s, ch, k ? tr(n, k) : n, l); s += l; }); };
  bar(16, 138, s0 => { ['A2','E3','A3','C4','E4'].forEach(n => add(s0, 'organ', n, 16)); add(s0, 'crash'); add(s0, 'bell', 'A5'); });
  const LOOP = pos();
  // A：主題（2小節）→ 5度上の応答＋対旋律（2小節）
  const AC = [['A3','C4','E4'], ['E3','G#3','B3'], ['E3','G#3','B3'], ['A3','C4','E4']];
  let a0 = 0;
  AC.forEach((c, b) => bar(16, 138, s0 => {
    if (b === 0) a0 = s0;
    const r = dn8(dn8(c[0])); K.chug(s0, 16, r, [0, 8]); K.drums(s0, 16, { kick:'8', snare:[4, 12], crash:b === 0 || b === 2 });
    c.forEach(n => add(s0, 'str', n, 16)); add(s0, 'pedal', r, 16);
  }));
  play(a0, SUBJ, 'lead'); play(a0 + 32, SUBJ, 'harm', 7); play(a0 + 32, [['A5',8],['G#5',8],['B5',8],['C6',8]], 'lead');
  play(a0, SUBJ.map(([n, l]) => [n, l]), 'toc', -12);
  // B：9/8（18ステップ、6+6+6）
  const B = [['A3','C4','E4'], ['F3','A3','C4'], ['G3','B3','D4'], ['E3','G#3','B3']];
  B.forEach((c, b) => bar(18, 138, s0 => {
    const r = dn8(dn8(c[0])); K.chug(s0, 18, r, [0, 6, 12]); K.drums(s0, 18, { snare:[6, 12, 15], crash:b % 2 === 0 });
    [0, 6, 12].forEach(i => c.forEach(n => add(s0 + i, 'stab', up8(n), 2)));
    for (let i = 0; i < 18; i++) add(s0 + i, 'toc', up8([c[0], c[1], c[2], c[1], c[2], up8(c[0])][i % 6]), 1);
    K.pad(s0, 18, c); add(s0, 'choir', up8(c[2]), 18);
    if (b === 3) api.fill(s0, 14, 18);
  }));
  ([[['A2','C3','E3','A3'], [['C5',8],['E5',8]]], [['E2','G#2','B2','E3'], [['B4',8],['G#4',8]]]] as [string[], [string, number][]][]).forEach(([c, m]) => bar(16, 60, s0 => {
    c.forEach(n => add(s0, 'organ', n, 16)); K.mel(s0, m, 'choir'); K.mel(s0, m.map(([n, l]) => [dn8(n), l]), 'choir'); add(s0, 'timp', c[0]); add(s0, 'bell', up8(c[3]));
  }));
  return LOOP;
}

const EXTRA_TRACKS = [
  { name:'レクイエム（ホ短調・5/4）', build:requiem },
  { name:'テンペスト（ハ短調・トッカータ）', build:tempest },
  { name:'狂気のワルツ（ト短調・3/4）', build:waltz },
  { name:'終末の行進（嬰ヘ短調・行進曲）', build:march },
  { name:'混沌のフーガ（イ短調・9/8）', build:fugue },
];
export { EXTRA_TRACKS };
