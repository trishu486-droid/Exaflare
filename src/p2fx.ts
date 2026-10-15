// @ts-nocheck
import { opt } from './store.js';

// P2 の画面全体の演出（実機の動画に寄せたもの）。画面（.screen）の上に重ねる小さなキャンバスに、粗いドットで描く
// ミッシング：白く光る → 黒いもやが横に流れながら画面を覆う → 赤い横の光の筋 → 消える
// 裁きの光：白〜金に強く光る → 画面がガラスのように割れて、銀の破片が飛び散る → 消える
const RES = 180; // 横のドット数（縦は画面の比率で）
let cv = null, g = null, cur = null;
const rnd = s => () => (s = (s * 9301 + 49297) % 233280) / 233280;

function ensure(){
  const host = document.querySelector('.screen');
  if (!host) return false;
  if (!cv){
    cv = document.createElement('canvas'); cv.className = 'p2fx';
    Object.assign(cv.style, { position:'absolute', inset:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'50', imageRendering:'pixelated' });
    host.appendChild(cv); g = cv.getContext('2d');
  }
  const r = host.getBoundingClientRect(), h = Math.max(1, Math.round(RES * r.height / Math.max(1, r.width)));
  if (cv.width !== RES || cv.height !== h){ cv.width = RES; cv.height = h; }
  return true;
}
const blob = (x, y, r, col) => { g.fillStyle = col; for (let dy = -r; dy <= r; dy++){ const hw = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(Math.round(x - hw), Math.round(y + dy), hw * 2 + 1, 1); } };

function drawForsaken(e, W, H){
  const R = rnd(11);
  // 白い光
  if (e < .45){ g.globalAlpha = .9 * (1 - e / .45); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }
  // 黒いもや：大小のかたまりが横に流れる（後ろに横の尾）
  const k = e < .3 ? 0 : e < .7 ? (e - .3) / .4 : e < 1.5 ? 1 : Math.max(0, 1 - (e - 1.5) / .5);
  if (k > 0){
    g.globalAlpha = .82 * k;
    for (let i = 0; i < 18; i++){
      const y = R() * H, x0 = R() * W, r = 8 + R() * 22, sp = (R() - .5) * 70, x = x0 + sp * e;
      blob(x, y, Math.round(r), i % 3 ? '#0e0a10' : '#2a1418');
      g.fillStyle = '#0e0a10'; for (let n = 0; n < 6; n++) g.fillRect(Math.round(x - r - 6 - R() * 30 * Math.sign(sp || 1)), Math.round(y - r / 2 + R() * r), Math.round(10 + R() * 30), 1);
    }
  }
  // 赤い横の光の筋（中央から外へ）
  const s = e < 1.0 ? 0 : e < 1.3 ? (e - 1.0) / .3 : Math.max(0, 1 - (e - 1.3) / .9);
  if (s > 0){
    g.globalAlpha = .55 * s; g.fillStyle = '#fff4f4'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++){
      const y = Math.round(R() * H), dir = R() < .5 ? -1 : 1, len = 20 + R() * 70, x = W / 2 + dir * (10 + (e - 1) * 160 * (.5 + R()));
      g.globalAlpha = .8 * s; g.fillStyle = i % 4 ? '#e8283a' : '#ff8ab0'; g.fillRect(Math.round(dir > 0 ? x : x - len), y, Math.round(len), 1);
    }
  }
  g.globalAlpha = 1;
  return e < 2.4;
}

function drawJudgment(e, W, H){
  const R = rnd(29);
  // 強い白〜金の光
  if (e < 1.1){ g.globalAlpha = e < .7 ? .95 : .95 * (1 - (e - .7) / .4); g.fillStyle = e < .35 ? '#ffffff' : '#fff2b0'; g.fillRect(0, 0, W, H); }
  // 割れたガラスの破片：銀の多角形が外へ飛び、少し回りながら消える
  if (e >= .6){
    const f = e - .6, a = f < 1.4 ? 1 : Math.max(0, 1 - (f - 1.4) / .6);
    for (let i = 0; i < 26; i++){
      const cx = R() * W, cy = R() * H, sz = 10 + R() * 26, rot = R() * 6.28 + f * (R() - .5) * 2, dx = (cx - W / 2) * .5 * f, dy = (cy - H / 2) * .5 * f + 18 * f * f;
      const n = 3 + (R() * 2 | 0), pts = [];
      for (let k = 0; k < n; k++){ const t = rot + k / n * 6.28 + (R() - .5) * .9, rr = sz * (.5 + R() * .6); pts.push([cx + dx + Math.cos(t) * rr, cy + dy + Math.sin(t) * rr * .55]); }
      g.globalAlpha = .9 * a; g.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#d8dce8' : '#9aa0b8';
      g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(Math.round(x), Math.round(y)) : g.moveTo(Math.round(x), Math.round(y))); g.closePath(); g.fill();
      g.strokeStyle = '#5a6078'; g.lineWidth = 1; g.stroke();
    }
    // ひびの線（最初だけ）
    if (f < .5){ g.globalAlpha = 1 - f / .5; g.strokeStyle = '#ffffff';
      for (let i = 0; i < 9; i++){ g.beginPath(); let x = W / 2, y = H / 2; g.moveTo(x, y); const t = R() * 6.28; for (let k = 0; k < 5; k++){ x += Math.cos(t + (R() - .5)) * W / 8; y += Math.sin(t + (R() - .5)) * H / 8; g.lineTo(Math.round(x), Math.round(y)); } g.stroke(); } }
  }
  g.globalAlpha = 1;
  return e < 2.7;
}

// バウル・オブ・アゴニー（P3）：画面全体が白〜黄色の光で放射状に弾ける（2026-10-16 ユーザー：フィールドだけでなく画面全体に）
function drawBowels(e, W, H){
  const k = Math.min(1, e / .85), C = [W / 2, H * .42];
  g.globalAlpha = .85 * (1 - k); g.fillStyle = '#fff4c8'; g.fillRect(0, 0, W, H);
  g.globalAlpha = 1 - k; const r0 = 6 + k * 40, r1 = Math.hypot(W, H);
  for (let a = 0; a < 24; a++){ const th = a * Math.PI / 12; g.strokeStyle = a % 2 ? '#ffd84a' : '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(C[0] + Math.cos(th) * r0, C[1] + Math.sin(th) * r0); g.lineTo(C[0] + Math.cos(th) * r1, C[1] + Math.sin(th) * r1); g.stroke(); }
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(C[0], C[1], 14 * (1 - k) + 2, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  return e < .85;
}

function loop(){
  if (!cur){ return; }
  const e = (performance.now() - cur.at) / 1000;
  g.clearRect(0, 0, cv.width, cv.height);
  const more = ({ forsaken:drawForsaken, judgment:drawJudgment, bowels:drawBowels })[cur.kind](e, cv.width, cv.height);
  if (more) requestAnimationFrame(loop); else { g.clearRect(0, 0, cv.width, cv.height); cur = null; }
}
// kind：'forsaken'（ミッシング）・'judgment'（裁きの光）・'bowels'（P3 バウル・オブ・アゴニー）
function screenFx(kind){
  if (opt.fx === false || !ensure()) return;
  const running = !!cur; cur = { kind, at:performance.now() };
  if (!running) requestAnimationFrame(loop);
}
// メニューに戻ったときなどに消す
function screenFxStop(){ cur = null; if (g) g.clearRect(0, 0, cv.width, cv.height); }

export { screenFx, screenFxStop };
