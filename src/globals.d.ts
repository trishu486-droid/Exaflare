// テスト用の入口などで window に足すもの
interface Window {
  __T?: any; __noHurt?: boolean; __hurts?: string[];
  webkitAudioContext?: typeof AudioContext;
}
