# Google 検索を新しい URL に寄せる手順（2026-10-17）

検索で古い URL（`https://trishu486-droid.github.io/Exaflare/`）が上に出て、新しい URL（`https://dancing-mad-sim.pages.dev/`）が下に出ていたので、新しい方を先に出すための作業をまとめる。Google の並び順は直接決められないので、「古い方は引っ越した、新しい方が本物」と伝えて、入れかわるのを待つ（数日〜数週間）。

## こちら（リポジトリ）でやったこと

- 旧 URL（GitHub Pages）は、アプリをやめて **新しい URL へすぐ転送するページ**（`gh-redirect/index.html`・`404.html`）だけにした（`.github/workflows/deploy.yml`）。Google は、すぐ転送するページを「引っ越し（恒久的な転送）」として扱い、検索の評価を新しい URL へ移す。ブックマークから来た人も自動で新しい URL へ行く。
- 新しい URL に `robots.txt` とサイトの地図 `sitemap.xml` を足した（`public/`）。新しいページにはもとから「本物はこっち」の印（`<link rel="canonical">`）が付いている。

## ユーザーにやってもらうこと（Google Search Console。https://search.google.com/search-console ）

### 1. 新しい URL を登録する（いちばん大事）

- `index.html` にはすでに `google-site-verification` の印が 2 つ入っている（2026-10-17 に確認）。新しい URL はもう登録・確認済みかもしれない。Search Console の左上のプロパティの一覧に `https://dancing-mad-sim.pages.dev/` があれば、下の 1〜3 は飛ばして 4・5 だけでよい。

1. 左上の「プロパティを検索」→「プロパティを追加」。
2. 右側の「URL プレフィックス」に `https://dancing-mad-sim.pages.dev/` を入れて「続行」。
3. 持ち主の確かめ方で「HTML タグ」を選び、出てきた `<meta name="google-site-verification" content="……">` の **content の中の文字列** を Claude に伝える（こちらで `index.html` に入れて本番に出す）。出たら「確認」を押す。
   - Cloudflare Web Analytics や Google アナリティクスですでに確かめられる場合は、そちらでもよい。
4. 確かめられたら、左の「サイトマップ」で `sitemap.xml` と入れて「送信」。
5. 上の検索窓（URL 検査）に `https://dancing-mad-sim.pages.dev/` を入れ、「インデックス登録をリクエスト」を押す。

### 2. 古い URL を検索結果から一時的に隠す（早く消したいとき）

1. 「プロパティを追加」→「URL プレフィックス」に `https://trishu486-droid.github.io/Exaflare/` を入れる。
2. 確かめ方で「HTML タグ」を選び、content の中の文字列を Claude に伝える（転送ページ `gh-redirect/index.html` に入れて出す）。
   - 転送ページはすぐ新しい URL へ飛ぶが、Google はタグを読める。
3. 確かめられたら、左の「削除」→「新しいリクエスト」→「この接頭辞で始まる URL をすべて削除」に `https://trishu486-droid.github.io/Exaflare/` を入れて送信。約半年のあいだ検索結果から隠れる。
   - 隠すだけで、新しい URL の評価には影響しない。転送ページの効き目が出るまでのつなぎ。

### 3. そのあと

- 2026-10-31 にリポジトリを非公開にすると、旧 URL は見られなくなり、自然に検索結果から消える（そのとき `.github/workflows/deploy.yml` と `gh-redirect/` を消す）。
- 検索結果が入れかわったかは、ときどき「絶ケフカ シミュレーター」で検索して見る。Search Console の「検索パフォーマンス」でも見られる。
