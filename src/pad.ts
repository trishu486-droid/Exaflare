// ===== 入力：ゲームパッド（2026-10-30 ユーザー） =====
// ブラウザの「標準配置」で読む（Xbox・PS・Switch Pro など）。押したボタンは、そのボタンに割り当てたキーを押したのと同じに扱う（メニュー・解説・設定もキーと同じ動き）
// 左スティック：移動（メニューではカーソル）。十字キー：上下左右。右スティック：3D のカメラ（設定の感度・反転が効く）
// 面のボタンは画面のボタンと同じ位置：上＝X、左＝Y、右＝A、下＝B。START・SELECT（Back／Share）、L1＝安地表示、R1＝ギミック選択へ
import { keyBind } from './input.js';
import { stickVec } from './state.js';
import { on3d, turn, tilt } from './view3d.js';
import { opt } from './store.js';

const BTN_ACT = { 0:'b', 1:'a', 2:'y', 3:'x', 4:'safe', 5:'menu', 8:'select', 9:'start', 12:'up', 13:'down', 14:'left', 15:'right' };
const MOVE_DEAD = .35, CAM_DEAD = .2, TURN_SPEED = 2.6, TILT_SPEED = 1.3; // カメラは倒しきって 1 秒に何ラジアン回るか（感度 100% のとき）
const down = {};
let leftOn = false, last = performance.now();
const send = (act, type) => { const key = keyBind[act]?.find(Boolean); if (key) window.dispatchEvent(new KeyboardEvent(type, { key, bubbles:true })); };
function poll(){
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  let lx = 0, lz = 0, rx = 0, rz = 0;
  pads.forEach((p, n) => {
    Object.entries(BTN_ACT).forEach(([i, act]) => {
      const on = !!p.buttons[i]?.pressed, id = n + ':' + i;
      if (on !== !!down[id]){ down[id] = on; send(act, on ? 'keydown' : 'keyup'); }
    });
    if (Math.hypot(p.axes[0] || 0, p.axes[1] || 0) > Math.hypot(lx, lz)){ lx = p.axes[0] || 0; lz = p.axes[1] || 0; }
    if (Math.hypot(p.axes[2] || 0, p.axes[3] || 0) > Math.hypot(rx, rz)){ rx = p.axes[2] || 0; rz = p.axes[3] || 0; }
  });
  // 左スティック：倒しているときだけ書く（画面のスティック・ドラッグとぶつからないように、離したら一度だけ 0 に戻す）
  const ld = Math.hypot(lx, lz);
  if (ld > MOVE_DEAD){ stickVec.x = lx / ld; stickVec.z = lz / ld; leftOn = true; }
  else if (leftOn){ stickVec.x = stickVec.z = 0; leftOn = false; }
  // 右スティック：右へ倒すと右を向く。下へ倒すとカメラが上がる（フィールドを下へスワイプしたときと同じ）
  if (on3d() && Math.hypot(rx, rz) > CAM_DEAD){
    const k = (v: number) => Math.abs(v) < CAM_DEAD ? 0 : v;
    turn((opt.camInv ? -1 : 1) * k(rx) * TURN_SPEED * opt.camSensH * dt);
    tilt((opt.camInvV ? -1 : 1) * k(rz) * TILT_SPEED * opt.camSensV * dt);
  }
  requestAnimationFrame(poll);
}
requestAnimationFrame(poll);
