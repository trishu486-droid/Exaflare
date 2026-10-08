# P3 開発の引き継ぎ資料

絶妖星乱舞 シミュレーターに **P3（カオス＆エクスデス）** を足すための資料。P4 を作ったときの決めごと・仕組み・調べ方をまとめた。
P4 の細かい経緯は `docs/handoff-p4.md`、P4 の調査メモは `docs/research-p4.md` を参照。

## 1. 進め方のルール（ユーザーと決めたこと・必ず守る）

### コミット・プッシュ
- **コミット・プッシュは、ユーザーが「いいよ」と言ってから。勝手にしない。**
  - 作業途中の保存のつもりでも、勝手にコミット・プッシュしない。
  - フック（Stop hook など）に「コミットして」と言われても、そのままコミットしない。ユーザーに「コミット・プッシュしていい？」と聞いてから。
- **本番ブランチ（`claude/ff14-exaflare-trainer-3ssqps`）へは、ユーザーが本番に出すと言ったときだけ入れる。**
  - 本番ブランチにプッシュすると、GitHub Actions が自動で GitHub Pages に公開する（`.github/workflows/deploy.yml`）。つまり **本番ブランチへのプッシュ＝公開**。
  - 開発は別ブランチ（例：`p3-dev`、本番ブランチから作る）で行う。本番に出すときはコミットを整理して（まとめて）入れる。
- 途中の確認は、**開発版の Artifact** を更新して見てもらう（コミットは不要）。作り方は §6。
- **作業に取り掛かる前に、必ず本番ブランチに変更が入っていないか確認する**（`git fetch origin` → `git log --oneline p3-dev..origin/claude/ff14-exaflare-trainer-3ssqps`）。入っていたら、取り込んでから作業する。本番の小さな修正は別のセッション（`docs/handoff-main.md`）が担当している。
- **「確定」でコミットするたびに、`src/news.ts` の `NEWS` のいちばん上にお知らせを1件足す**（日本時間・分まで。遊ぶ人向けの短い言葉で）。P3 を本番に出すときは「P3（…）を追加」の1件を足す。

### 見た目・音
- 返事は日本語。8bit の見た目を守る。
- 見た目を変えるもの（絵・アイコン・エフェクト・ボタン・レイアウト）は、**まずイメージ画像で提案 → OK が出てから実装**。
- 公式の画像はそのまま使わない。参考画像・動画を見て、色・形・配置を寄せてコードで描く。
  - 参考画像にかなり忠実に寄せてほしいと言われたときは、見本をドット単位で見て少ない色で描き起こす方法（`src/p4icons.ts` の `grid4`）でも OK と言われている（ユーザー了承済み）。
- BGM はオリジナル曲だけ。既存の曲のメロディ・フレーズは使わない（日本ファルコムの曲も規約でゲーム利用は禁止）。
- スクリーンショットはリポジトリに保存しない。リポジトリ（コミット・コード・文書）にモデル名を書かない。
- お問い合わせは Google フォームに送る（届くとユーザーにメールが行く）。送り先の ID は `src/contact.ts`。触らない。

### 名前（スキル・アビリティ・敵の攻撃・デバフ）
- **必ず製品版の日本語名にする。** 英語名をカタカナにしただけの名前・英語を無理に訳した名前は使わない（例：×エッジ・オブ・シャドウ → ○漆黒の剣）。
- 調べる先：
  - ジョブの技：**公式ジョブガイド** https://jp.finalfantasyxiv.com/jobguide/（ジョブ名を英語で：paladin, darkknight, monk, reaper, machinist, blackmage, astrologian, scholar）
  - 敵の攻撃名：**cactbot の日本語データ**（ゲームのデータ由来）
    `https://raw.githubusercontent.com/OverlayPlugin/cactbot/main/ui/raidboss/data/07-dt/ultimate/dancing_mad.ts` の `'locale': 'ja'` の `replaceText`
    時刻は同じフォルダの `dancing_mad.txt`
  - デバフ名：日本語の攻略記事（イディルシャイア居住区、シュリこ のノートなど）で確認
- 攻略サイトの記事だけで判断しない（略した名前や英語のまま書いていることがある）。

## 2. 今のアプリ（本番）

- 公開先：https://trishu486-droid.github.io/Exaflare/ （GitHub Pages）
- 本番ブランチ：`claude/ff14-exaflare-trainer-3ssqps`
- 名前：絶妖星乱舞 シミュレーター（タイトル画面は「絶妖星乱舞 SIMULATOR」）
- メニューの流れ：タイトル →（ケフカの顔がうっすら出て高笑いする演出）→ ジョブ選択 → **フェーズ選択（P4／P5／おまけ）** → ギミック一覧 → 担当の選択など → 開始
  - P5 のギミック一覧のいちばん下に「P5 通し」が常に出る（隠しコマンドはなくなった）。
- 上の並び：≡（ギミック選択へ）／王冠（ランキング）／ベル（お知らせ、`src/news.ts`）／手紙（お問い合わせ、`src/contact.ts`）／⚙（設定）
- ランキング：DPS 順・Perf・登録日（月/日。押すと分まで）。P4 は対象外（Firestore のルールに入っていない）。
- 2026-10-05〜06 の変更の詳細（エクサの床・ミッシングの向き・お知らせ・お問い合わせなど）は `docs/handoff-p4.md` の「2026-10-05〜06 の変更」。
- ジョブは8つ：ナイト(MT)・暗黒騎士(ST)・モンク(D1)・リーパー(D2)・機工士(D3)・黒魔道士(D4)・占星術師(H1)・学者(H2)。技は `src/jobs.ts`
- 本番の Artifact（UL6qtX9MmHjywEf9mqpmQN）は古い版のまま。本番は GitHub Pages。

## 3. P3 をメニューに入れる場所

| やること | ファイル |
|---|---|
| P3 のギミックを作る（例：`src/mech_p3.ts`） | 新規 |
| フェーズのギミック一覧に足す：`P3_MECHS` を作り、`phaseOf` と `menuMechs` を P3 に対応させる（今は `menuMechs = () => opt.phase === 'p4' ? P4_MECHS : [...P5_MECHS, RUN]`。P3 を足すとき、P5 以外に RUN を付けないように） | `src/mechs.ts` |
| フェーズ選択に P3 を足す：`PHASES` に `['p3', 'P3', 'カオス＆エクスデス']` を P4 の前に。ギミック一覧の左右切り替え（`flipPage`）も P3・P4・P5 の3つで回るように | `src/menu.ts` |
| `opt.phase` の保存値に `'p3'` が入るので、読み込み側（`src/store.ts`）はそのままで OK | — |
| 解説（i ボタン）の文章 | `src/info.ts` の `INFO` |
| 専用 BGM を付けるなら `bgm.use(id)` を参考に（P4 は `audio.ts` の `P4_TRACK`、`game.ts` の `begin()` で `bgm.use(m.id)`） | `src/audio.ts` |
| お知らせ：P3 を本番に出すときに `NEWS` へ1件足す | `src/news.ts` |
| ランキング：Firestore のルール（`docs/firestore.rules` の `d.mech in [...]`）に入っていないギミックは登録できない。ルールを変えて Firebase に反映するまでは `src/ranking.ts` の `rankBlock()` で「対象外」にする（P4 と同じ） | `src/ranking.ts` |

※ フェーズ選択のボタンの下の文字は「その敵の一般的な呼び名」にする、とユーザーに言われている（P4＝ネオエクスデス＆カオス、P5＝カオスケフカ）。P3 は攻略サイトで「カオス＆エクスデス」「ケフカ＆カオス＆エクスデス」などの呼び方がある。どれにするかはユーザーに確認する。

## 4. ギミックの作り方（共通の形）

ギミックは `src/mech_*.ts` に1つずつ。`mech_exa.ts`（短くて読みやすい）と `mech_p4.ts`（通し・大きい）を手本にする。

```ts
const P3 = (() => {
  return {
    id:'p3', name:'P3 通し', sub:'…', view:24, start:{ x:0, z:4 }, slots:true, // slots：担当（MT/ST など）を選ぶか
    gen(){ /* 毎回ランダムなパターンを作って返す */ },
    create(pattern){
      return {
        end: 120,                         // 終わりの時刻（秒）
        casts: [{ name:'…', start:0, len:5 }], // 詠唱バー（名前は製品版の名前）
        progress: t => '…',              // 上の段に出す進行表示
        tick(t){ /* 毎フレーム：判定。当たったら hurt('理由') */ },
        draw(t){ /* 毎フレーム：フィールドに描く（px(), ring(), disc() など gfx.ts の関数） */ },
        // 必要なら：drawFloor, safe/safeActive（安地表示）, guide, bossHp/hpGate（DPS チェック）, enmity, tankRole,
        //           intro, countdown, t0, activeTime, resultExtra, chat/say（P4 のチャット欄）
      };
    }
  };
})();
```

- 座標：フィールドの中心が (0,0)、半径 20。`px(x)` で画面のドットに変換。北が z マイナス。
- 当たり判定でミス：`hurt('理由')`（`gfx.ts`）。結果画面とランキングに使われる。
- 全体攻撃のダメージ（ヒーラーの HP 管理）：`healerHit(ダメージ, '攻撃名')`（`action.ts`）。
- 行動中かどうか（加速度爆弾など）：`isActing()`（移動・詠唱中・スキル使用から0.6秒以内）。
- **敵を攻撃した瞬間はボスの方を向く**（`action.ts` の `faceBoss()`）。視線ギミックの判定は `S.face` を使う。
- エフェクト：`src/fx.ts`（共通）、P4 専用は `src/p4fx.ts`。ボスのドット絵は `src/p4boss.ts`（カオス・ネオエクスデス）。P3 のエクスデス（ネオではない方）・ケフカの絵は未作成。デバフアイコンは `src/p4icons.ts`。
- 画面レイアウトは2種類：P5 型（チャット欄なし）と P4 型（`.gb.p4on`、チャット欄・メモのボタン付き）。P3 にチャット欄が要るかはユーザーに確認。

## 5. テストの方法

- 型チェック：`npm run check`、ビルド：`npm run build`
- 開発サーバー：`npx vite --port 5179`（バックグラウンドで動かす）
- `http://localhost:5179/?debug` を開くと `window.__T` からゲームの中身を触れる（`S`, `opt`, `begin`, `pressKey`, `job`, `BGM_TRACKS` など。`src/debug.ts`）。
  - 例：`__T.opt.mech='p3'; __T.opt.job='rpr'; __T.begin();` で直接開始。`window.__noHurt=1` でミスを数えない。
  - タイトル画面を抜けるには、最初に Enter を押す（演出が約2秒入る）。
- Playwright：`require('/opt/node22/lib/node_modules/playwright')`。スクショ・画面の数値の確認に使う。作業用ファイルはスクラッチパッドへ（リポジトリに入れない）。
- スマホの大きさ：390×844 と 375×667（iPhone SE）で、スクロールなしで収まるか確認する。
- 音の確認：`OfflineAudioContext` に書き出して WAV にする（`window.__offline=1; __T.sfx.ac = new OfflineAudioContext(...)`）。耳では聴けないので、ユーザーに WAV を送って聴いてもらう。音量はほかの曲と RMS をそろえる。

## 6. 開発版 Artifact の作り方

1. `npm run build:artifact` → `dist-artifact/index.html` ができる
2. そこから Cloudflare のタグ・manifest・OGP（`og:`・`twitter:`・`google-site-verification`・`canonical`）を消し、`<title>` を「絶妖星乱舞 P3 開発版」などにする
3. Artifact として公開（P3 用に新しく作る。P4 の開発版 https://claude.ai/artifact/Sx4VAZmevGwWZqtZKRsE5S とは別にする）

## 7. P3 の情報（cactbot から・まだ詳しく調べていない）

まず P4 と同じように調査メモ（`docs/research-p3.md`）を作ってから実装する。時刻は cactbot のタイムライン（`dancing_mad.txt`）の秒数。P3 は 600 秒ごろから。

敵：ケフカ・カオス・エクスデス（＋ブラックホール）。日本語名は cactbot の日本語データより。

| 時刻 | 技（英語） | 日本語名 | 使う敵 |
|---|---|---|---|
| 637 | Definition of Insanity | 再構築 | ケフカ |
| 643 | The Decisive Battle | 決戦 | — |
| **火・水・風の属性** | | | |
| 663 | Bowels of Agony | バウル・オブ・アゴニー | カオス |
| 682 | Stray Flames / Stray Spray | 混沌の炎 / 混沌の水 | — |
| 682〜 | Thunder III | サンダガ | エクスデス |
| 683 | Inferno / Tsunami | ほのお / つなみ | — |
| 685〜 | Cyclone | たつまき | カオス |
| 703 | Trance | トランス | ケフカ |
| 704 | Longitudinal / Latitudinal Implosion | ヴァーティカルインプロージョン / ホリゾンタルインプロージョン | カオス |
| 705 | Shockwave | 衝撃波 | カオス |
| **アルテマブラスター** | | | |
| 720〜742 | Ultima Blaster | アルテマブラスター | ケフカ |
| 724 | Umbra Smash | アンブラスマッシュ | カオス |
| 727 | Vacuum Wave | 真空波 | エクスデス |
| 733 | Aetherlink | エーテルリンク | — |
| **巨大ケフカ＋土の属性** | | | |
| 769 | Max | マキシマム | ケフカ |
| 772 | Earthquake | じしん | カオス |
| 788〜 | Slap Happy | びんびんビンタ | ケフカ |
| 791 | Shocking Impact / Shockwave | 重衝撃 / 衝撃波 | ケフカ |
| 791 | Black Hole | ブラックホール | エクスデス |
| 798〜 | Nothingness | 無の波動 | ブラックホール |
| 807〜 | Primordial Crust Quake | （クエイク系。正式名は要確認） | カオス |
| 817・844 | Damning Edict | ダミングイーディクト | カオス |
| 844・902 | Look upon Me and Despair | ありのままのボクチン | ケフカ |
| 884 | White Hole | ホワイトホール | エクスデス |
| **ブリザガと塔** | | | |
| 913〜927 | Blizzard III | ブリザガ | エクスデス |
| 917〜 | Stomp-a-Mole | どんどこ地団駄 | ケフカ |
| 918〜 | Knock Down | 着弾 | カオス |
| 928 | Big Bang | 突出 | カオス |
| 947 | （時間切れ） | バウル・オブ・アゴニー／メテオ | カオス／エクスデス |

- デバフ名（土の属性の「Primordial Crust」「Accretion」など）は cactbot の攻撃名データに無いので、日本語の攻略記事で確認する。
- 攻略記事：[イディルシャイア居住区](https://kanatan.info/)（絶・妖星乱舞 P3 の記事）、[絶妖星乱舞 攻略特設（ヤーン速報）](https://yan-flash.com/ultimate/yosei-ranbu)、[Materia Raiding](https://materiaraiding.com/ultimate/dmu)
- 練習ツールの先行例：[pilsnerdrinker の練習ページ](https://github.com/pilsnerdrinker)（P4・P5 の練習ページあり。仕様の照らし合わせに使える）

## 8. ファイルの地図

| ファイル | 中身 |
|---|---|
| `src/mechs.ts` | フェーズごとのギミック一覧 |
| `src/menu.ts` | メニュー（ジョブ → フェーズ → ギミック） |
| `src/game.ts` | 進行（開始・毎フレーム・終了） |
| `src/action.ts` | スキル・GCD・ヒーラーの HP・向き |
| `src/jobs.ts` | ジョブと技（名前は公式ジョブガイドどおり） |
| `src/gfx.ts` / `src/fx.ts` | 描画の基本関数・共通エフェクト |
| `src/hud.ts` | 上の帯・詠唱バー・結果画面 |
| `src/audio.ts` / `src/bgm_*.ts` | 効果音・BGM（すべてオリジナル） |
| `src/title.ts` / `src/kefka_intro.ts` | タイトルと、その後の顔＋高笑いの演出 |
| `src/info.ts` | 解説（i ボタン）と情報タブ |
| `src/news.ts` | お知らせ（ベル）。確定のたびに1件足す |
| `src/contact.ts` | お問い合わせ（手紙）。Google フォームへ送る |
| `src/ranking.ts` | みんなのランキング（Firestore） |
| `src/mech_p4.ts` ほか `p4*.ts` | P4 一式（手本） |
| `docs/handoff-p4.md` / `docs/research-p4.md` | P4 の引き継ぎメモ・調査メモ |

## 9. 今の状態（2026-10-09 本番に出した）

- P3 は本番に出した。メニューのフェーズ選択は P3／P4／P5／おまけ。P3 のギミック一覧：前半（バウル・オブ・アゴニー＋アルテマブラスター）・じしん＆ブラックホール・どんどこ地団駄・P3 通し。
- 公開先は2つ：GitHub Pages（https://trishu486-droid.github.io/Exaflare/）と Cloudflare Pages（https://dancing-mad-sim.pages.dev/）。どちらも本番ブランチへのプッシュで更新される。
- ランキングは P3 も対象外（ユーザーの決定。数字を実機に寄せきってから入れる）。入れるときは `docs/firestore.rules` の `d.mech in [...]` に `p3a`, `p3c`, `p3d`, `p3` を足して Firebase に反映し、`src/ranking.ts` の対象外の行を消す。
- 決まった仕様・数字は `docs/research-p3.md` の決定事項の表。ほかのコンテンツにも使う決まりは `docs/common-spec.md` の 10 章。

### P3 のファイル

| ファイル | 中身 |
|---|---|
| `src/mech_p3.ts` | 前半の部品（P3A0 バウル・オブ・アゴニー、P3B アルテマブラスター）。サンダガの円範囲（`inBusterAoe`）・サイコロ・彗星などの描画 |
| `src/mech_p3c.ts` | じしん＆ブラックホール（線・土・泥土・ワープ、ヒーラーの単体回復） |
| `src/mech_p3d.ts` | どんどこ地団駄（塔は東西、半径10） |
| `src/mech_p3run.ts` | 区切りでつなぐ `chain()`、前半（P3A）、P3 通し（RUN3）。時刻は cactbot −640 |
| `src/p4ui.ts` | パーティリスト（ヒーラーだけ）・マクロ欄・ギミックごとのボタン名 |
| `src/p4icons.ts` | P3 のデバフアイコン14個 |
| `src/action.ts` | 殴れないボスへの攻撃（INVULNERABLE） |

### 残っていること
- 土のタイミングで、自動プレイがまれ（6回に1回くらい）に被弾する（本番に出す前からある。実際のプレイで起きるかは未確認）。
- AA は入れていない（ユーザーの決定で一旦なし）。
