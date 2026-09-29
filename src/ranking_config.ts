// ===== みんなのランキング（Firebase / Firestore）の接続先 =====
// Firebase コンソール → プロジェクトの設定 → マイアプリ（ウェブ）の firebaseConfig にある「projectId」と「apiKey」を入れる。
// どちらも公開してよい値（できるのは記録の追加と読み取りだけ。docs/firestore.rules のルールで制限している）。
// 空のままならランキング機能は出ない。アーティファクト版（claude.ai）も外部に通信できないので出さない
const FB_PROJECT = 'kefka-d3de5';
const FB_KEY = 'AIzaSyDbmIoI-6emSF7kBCOfQ_Vikej5MWP9N8E';
// テスト用：?rankapi=http://localhost:xxxx でモックに向ける（?debug のときだけ）
const q = new URLSearchParams(location.search);
const FB_BASE = (q.has('debug') && q.get('rankapi')) || 'https://firestore.googleapis.com';
const RANK_ON = (!!FB_PROJECT && !!FB_KEY || FB_BASE !== 'https://firestore.googleapis.com') && import.meta.env.MODE !== 'artifact';

export { FB_PROJECT, FB_KEY, FB_BASE, RANK_ON };
