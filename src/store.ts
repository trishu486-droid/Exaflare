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
  debuff: store.get('debuff', 'rand'), dbl: store.get('dbl', 'first'), slot: store.get('slot', {}), orch: store.get('orch', 1)
};

export { $, store, opt };
