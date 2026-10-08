# 資料の入口

FF14 絶妖星乱舞（絶ケフカ）の練習ツール「絶妖星乱舞 シミュレーター」のリポジトリ。
**どのセッションも、作業の前にこの資料を読む。** そのあと `common-spec.md` → `dmu/spec.md` の順に読む。

## 1. 読む順番と資料の地図

| 資料 | 中身 | いつ読む |
|---|---|---|
| `docs/README.md`（これ） | 環境・作業の流れ・今の状態・残っていること | 最初に必ず |
| `docs/common-spec.md` | どの絶・零式にも共通の決まり（方針・ユーザーとの進め方・実機に合わせる原則・味方 NPC・タンクの練習箇所・新しく作る手順） | 最初に必ず |
| `docs/dmu/spec.md` | 絶妖星乱舞の仕様（画面・メニュー・P3／P4／P5・お知らせ／お問い合わせ／ランキング・ファイルの地図・テストのしかた） | 作業の前に |
| `docs/dmu/history.md` | いつ何を決めて何を変えたかの記録 | 経緯を知りたいとき |
| `docs/dmu/research-p3.md` / `research-p4.md` / `research-p5-exa.md` | 調査メモ（技名・時刻・処理法・決定事項） | そのフェーズを触るとき |
| `docs/firestore.rules` | ランキング（Firebase）のルール | ランキングを触るとき |

- 決まったこと・わかったことは、その場で該当の資料に追記して育てる（追記のしかたは `common-spec.md` の 0 章）。
- 食い違いがあったら：ユーザーの最新の発言 ＞ `common-spec.md` ＞ `dmu/` の資料。気づいたらユーザーに確認してから直す。

## 2. 環境

| 種類 | 場所 | 中身 |
|---|---|---|
| **本番（メイン）** | https://dancing-mad-sim.pages.dev/ （Cloudflare Pages、プロジェクト名 `dancing-mad-sim`） | `main` ブランチの最新。プッシュで自動更新（1〜2分） |
| 本番（旧住所・移行中） | https://trishu486-droid.github.io/Exaflare/ （GitHub Pages） | 移行が終わったら「移転しました」の案内だけにする |
| **開発版** | `dev` ブランチ（Cloudflare のプレビューで `https://dev.dancing-mad-sim.pages.dev/` を予定） | 確定前の確認用 |
| リポジトリ | GitHub `trishu486-droid/Exaflare`（名前は変更予定） | 公開中。移行が終わったら非公開にする予定 |

- **ブランチは `main`（本番）と `dev`（開発）の2本だけ**。ほかのブランチは作らない（2026-10-09 に整理）。
- ランキング：Firebase（Firestore、プロジェクト `kefka-d3de5`）。お問い合わせ：Google フォーム（届くとユーザーにメール）。アクセス解析：Cloudflare Web Analytics と Google Search Console。どれも住所が変わってもそのまま動く。
- Artifact（claude.ai）は使わない方針（開発版は Cloudflare のプレビューで見る）。Artifact の中ではランキングとお問い合わせが動かない。

## 3. 作業の流れ

1. **作業の前に `dev` の最新を取り込む**：`git fetch origin && git checkout dev && git pull origin dev`。`main` に `dev` にないコミットがあれば `git merge origin/main` で取り込む。
2. **`dev` で作業する**。見た目を変えるものは、先にイメージ画像で提案して OK をもらう（`common-spec.md` 2 章）。
3. **ユーザーに見てもらうとき**：「開発版に出していい？」と聞いて OK なら `dev` にコミット・プッシュ → 開発版の住所で見てもらう。
4. **「確定」をもらったら本番へ**：`src/news.ts` の `NEWS` のいちばん上にお知らせを1件足す（文書だけの変更なら不要）→ `dev` にコミット → `main` に `dev` を取り込んで（`git checkout main && git merge --ff-only dev`）プッシュ → 公開を確認。
5. **公開の確認**：`curl -s https://dancing-mad-sim.pages.dev/ | grep -o 'assets/index-[^"]*'` が、手元の `npm run build` の `dist/assets/index-*.js` と同じ名前になるか。この環境のブラウザは外のサイトを開くと証明書エラーになることがあるので、確認は curl で。

- **コミット・プッシュは、ユーザーの OK をもらってから**。Stop hook に「コミットして」と言われても、その理由を1〜2行で返して待つ。
- **開発するセッションは同時に1つ**が基本。2つ動かすときは、作業の前に必ず `dev` の最新を取り込み、共通の部分（`style.css`・`index.html`・`menu.ts`・`input.ts`・`action.ts`・`p4ui.ts`）を大きく変えるときは先にユーザーに言う。

## 4. 今の状態（2026-10-09）

- 公開中：P3（エクスデス＆カオス）・P4（おちょくりソウル）・P5（フラッド・オーケストラ・スリースターズ・混沌の終末・ミッシング・P5 通し）・おまけ。
- ランキングの対象は P5 だけ（P3・P4 は数字を実機に寄せきるまで対象外）。

## 5. 片付け（2026-10-09）の残り：ユーザーの操作が要るもの

1. **GitHub Pages の公開を `main` から許可する**：リポジトリの Settings → Environments → `github-pages` → Deployment branches and tags → `main` を追加（いまは旧ブランチだけ許可されていて、`main` からの公開が失敗する）。
2. **GitHub の標準ブランチを `main` にする**：Settings → General → Default branch。
3. **Cloudflare の本番ブランチを `main` に**：Workers & Pages → `dancing-mad-sim` → 設定 → ビルド → ブランチ コントロール → 本番ブランチを `main`、プレビュー ブランチを「カスタム」で `dev` だけに。
4. 上の3つが済んだら、旧ブランチ（`claude/ff14-exaflare-trainer-3ssqps`・`p3-dev`・`p4-dev`）を消す（中身はすべて `main` に入っている）。
5. 使わなくなった Artifact を消す（ユーザーの確認をもらってから）。
6. リポジトリ名の変更（案：`dancing-mad-sim`）と、旧住所の案内用の公開リポジトリ（名前 `Exaflare`、中身は新しい住所へ飛ばす1ページだけ）。
7. 1〜2週間たったらリポジトリを非公開にする（そのとき `.github/workflows/deploy.yml` を消す）。

## 6. まだ残っていること（ゲームの中身）

- 混沌の渦の半径（今 4、Splatoon では 5）をそろえるか、ユーザーに聞く。
- ミッシングの東西南北の向きの確認（1〜4回目が映った動画があれば確定できる）。
- P3：土のタイミングで、自動プレイがまれ（6回に1回くらい）に被弾する。AA は入れていない（ユーザーの決定）。
- P4：ケフカの絵（向き未定）、混沌の水「タケノコ」の演出（動画がないので推定）、一部のデバフアイコン（はっきりした画像があれば寄せられる）。
- ホーム画面のアプリで、上の余白が足りているか（ユーザーに実機で見てもらう）。iPhone SE の Safari（バーあり）と横向きは少しスクロールが出る。
- お問い合わせが本番から届くか（届いたものは Google ドライブで「絶ケフカシミュ問い合わせ」→「回答」タブ）。
- 滞在時間・プレイ回数を知る仕組み（提案：Firebase に記録）。未着手。
