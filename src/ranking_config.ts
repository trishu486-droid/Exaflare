// ===== みんなのランキング（Supabase）の接続先 =====
// Supabase の Project Settings → API（Data API）にある「Project URL」と「anon / publishable key」を入れる。
// どちらも公開してよい値（書き込めるのは scores テーブルへの追加と読み取りだけ。docs/ranking.sql の設定で制限している）。
// 空のままならランキング機能は出ない。アーティファクト版（claude.ai）も外部に通信できないので出さない
const RANK_URL = '';
const RANK_KEY = '';
const RANK_ON = !!RANK_URL && !!RANK_KEY && import.meta.env.MODE !== 'artifact';

export { RANK_URL, RANK_KEY, RANK_ON };
