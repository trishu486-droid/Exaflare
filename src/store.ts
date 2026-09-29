// ===== 設定（保存に失敗しても動く） =====
const $ = (id: string): any => document.getElementById(id); // 要素の種類が多いので any で受ける
const store = {
  get(k, d){ try { const v = localStorage.getItem('exa-kefka:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem('exa-kefka:' + k, JSON.stringify(v)); } catch {} }
};
const opt = {
  first: store.get('first', 'rand'), speed: store.get('speed', 1), path: store.get('path', false),
  spots: store.get('spots', false), marker: store.get('marker', 'nw'), sound: store.get('sound', true), bgm: store.get('bgm', true),
  safe: store.get('safe', false), fx: store.get('fx', !matchMedia('(prefers-reduced-motion: reduce)').matches), job: store.get('job', 'pld'), mech: store.get('mech', 'exa'),
  debuff: store.get('debuff', 'rand'), dbl: store.get('dbl', 'first'), slot: store.get('slot', {}), orch: store.get('orch', 1), track: store.get('bgmVer', 0) >= 2 ? store.get('track', 11) : 11 // 戦闘BGMの初期設定は12曲目「堕天の舞」（以前の保存値は1度だけ上書き）
};

export { $, store, opt };
store.set('bgmVer', 2); store.set('track', opt.track);
