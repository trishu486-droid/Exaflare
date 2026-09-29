import { $ } from './store.js';

// おまけ：しゃるるんさんのチャンネル（@syaruuu）の「陰キャと見るあたしンち」
const OMAKE = [
  ['cKpjYE8GsQk', '第1話', ''], ['RYBz1wS5E0Q', '第2話', ''], ['Psq9GrUjptQ', '第3話', ''], ['iUbahfL5izY', '第4話', ''],
  ['9QsPSLhC1-Y', '第5話', ''], ['1YkqAOnqeLc', '第6話', 'かわを残すはかわり者'], ['Ip_1kK4H7os', '第7話', 'してはいけないパンツの話'],
  ['0TZCN8HZkI8', '第8話', '君の心はプレミアム'], ['0NZAyHMBJE8', '第9話', '腹が減っては戦はできぬ'], ['sJzzdvlt31k', '第10話', '真夏の夜の陰キャ'],
  ['mCdvBgQg5ZE', '第11話', '野菜室はラビリンス'], ['u-olmWNYtMY', '第12話', 'プディングウェイ'], ['bf2SGdZpFbo', '第13話', ''], ['d7PK6f5CX14', '第14話', ''],
];
const OMAKE_CHANNEL = 'https://www.youtube.com/@syaruuu';
// スマホのボタンは押した瞬間（pointerdown）だとブラウザが別タブを開かせてくれないので、指を離したとき（pointerup）に開く
function openOmake(i){
  const w = window.open(i < OMAKE.length ? `https://www.youtube.com/watch?v=${OMAKE[i][0]}` : OMAKE_CHANNEL, '_blank');
  if (w) w.opener = null;
  else $('menu').querySelector('.note').textContent = '開けませんでした。一覧を直接タップしてください';
}

export { OMAKE, OMAKE_CHANNEL, openOmake };
