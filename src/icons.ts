// ===== ジョブ・スキル・状態異常のアイコン（実機の画像を元にしたドット絵。作り方は tools/make_icons.py） =====
// 画像は public/img/icon/ にある
// 大きさはスキル 28×28、状態異常 25×28（ユーザーが5段階の見本から選んだ。tools/make_icons.py の段階3）
const BASE = 'img/icon/';

// スキル名 → 絵（元の画像がない技は null。ボタンは文字だけ）
const SKILL: Record<string, string> = {
  'ファストブレード':'pld_fast', 'インペラトル':'pld_imperator', 'サークル・オブ・ドゥーム':'pld_circle', 'ライオットソード':'pld_riot', 'ロイヤルアソリティ':'pld_royal', 'エクスピアシオン':'pld_expi',
  'ランパート':'pld_rampart', 'インビンシブル':'pld_invuln', 'エクストリームガード':'pld_guard', '挑発':'pld_provoke', 'シャーク':'pld_shirk',
  'ハードスラッシュ':'drk_hard', 'サイフォンストライク':'drk_syphon', 'ソウルイーター':'drk_souleater', 'シャドウブリンガー':'drk_bringer',
  '漆黒の剣':'drk_edge', 'カーヴ・アンド・スピット':'drk_carve', 'リビングデッド':'drk_living', 'シャドウヴィジル':'drk_vigil',
  'スライス':'rpr_slice', 'ワクシングスライス':'rpr_waxing', 'インファナルスライス':'rpr_infernal', 'ストークスウェーズ':'rpr_stalk',
  'フォールマレフィク':'ast_malefic', 'コンジャンクション・ヘリオス':'ast_helios', '運命の輪':'ast_cu', 'ニュートラルセクト':'ast_ns', 'サンサイン':'ast_sun', 'ベネフィラ':'ast_bene',
  '極炎法':'sch_broil', '士気高揚の策':'sch_concit', '野戦治療の陣':'sch_soil', '疾風怒濤の計':'sch_exped', '鼓舞激励の策':'sch_adlo',
  'ヒートスプリットショット':'mch_split', 'ヒートスラッグショット':'mch_slug', 'ヒートクリーンショット':'mch_clean', 'ドリル':'mch_drill', 'チェックメイト':'mch_checkmate', 'ダブルチェック':'mch_double',
  'ファイジャ':'blm_fire', '三連魔':'blm_triple', '迅速魔':'blm_swift', 'ゼノグロシー':'blm_xeno',
  '猿舞連撃':'mnk_a', '竜頷正拳撃':'mnk_b', '虎襲崩拳':'mnk_y', '陰陽闘気斬':'mnk_x',
};
// 暗黒騎士のランパート・挑発・シャークは暗黒騎士の絵（ナイトと同じ名前なのでジョブで分ける）
const SKILL_BY_JOB: Record<string, Record<string, string>> = { drk:{ 'ランパート':'drk_rampart', '挑発':'drk_provoke', 'シャーク':'drk_shirk' } };
const skillIconUrl = (job: string, name: string) => { const k = SKILL_BY_JOB[job]?.[name] || SKILL[name]; return k ? `${BASE}skill/${k}.png` : null; };

// 自分に付くバフ（BUFFS の id）→ 逆ホームベース型の絵（buff/）。P5 のデバフはホームベース型（status/）
const BUFF = new Set(['rampart', 'invuln', 'guardian', 'living', 'walking', 'rebirth', 'vigil', 'soil', 'exped', 'galv', 'adlo', 'cu', 'helios', 'ns', 'sun', 'b2', 'triple', 'swift']);
const DEBUFF = new Set(['flare', 'holy', 'fireDown', 'iceDown', 'thunderDown']); // 被魔法ダメージ増加（magicVuln）は実機の絵がないので hud.ts の手描き
const buffImgUrl = (id: string) => BUFF.has(id) ? `${BASE}buff/${id}.png` : DEBUFF.has(id) ? `${BASE}status/${id}.png` : null;
// P4 の状態異常（p4icons.ts の id）のうち、実機の画像を元にしたもの。混沌の炎・水は P3 の絵をホームベース型の枠に入れたもの
const STATUS = new Set(['water', 'fork', 'shriek', 'bomb', 'dead', 'live', 'field', 'beyond', 'flame', 'wave']);
const statusImgUrl = (id: string) => STATUS.has(id) ? `${BASE}status/${id}.png` : null;

// ジョブアイコン（8bit の線画。tools/make_job_icons.py）：28×28、small はフィールドの自キャラ用 15×15
const jobIconUrl = (id: string, small = false) => `${BASE}job/${id}${small ? '_s' : ''}.png`;
// キャンバスに描く画像は先に読み込んでおく（読み込み前は null）
const imgCache: Record<string, HTMLImageElement> = {};
function img(url: string){
  let im = imgCache[url];
  if (!im){ im = new Image(); im.src = url; imgCache[url] = im; }
  return im.complete && im.naturalWidth ? im : null;
}

export { skillIconUrl, buffImgUrl, statusImgUrl, jobIconUrl, img };
