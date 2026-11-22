# tour-ops 観光手配案件管理

旅行会社から受けた手配依頼を **1件 = 1チケット** として、引合から精算・完了まで追う案件管理アプリです。
宿・バス・観光タクシー・ガイド・食事などの手配明細と、その回答期限・取消料発生日を取りこぼさず追えることを目指しています。
ポートフォリオ用のデモで、会社名・データはすべて架空です。人名は実在の人と紛れないよう「デモ 太郎」のような仮名にしています。

> 開発状況: **ステップ7(画面テスト・エラー監視・Docker)まで完了**。次は Vercel への公開です。

## 技術構成

標準的な接続方式(PostgreSQL・S3互換API・メール送信API・OAuth/OIDC)の部品で組み、領域ごとに乗り換え先も決めています。

| 領域 | 採用 | 乗り換え先 |
| --- | --- | --- |
| フレームワーク | Next.js(App Router)+ TypeScript | React Router、SvelteKit |
| UI | Tailwind CSS + shadcn/ui | MUI、Chakra UI |
| 入力チェック | Zod | Valibot |
| DB | Neon(PostgreSQL)+ Drizzle ORM | Supabase、AWS RDS、Azure Database for PostgreSQL |
| 認証 | Better Auth | Auth.js、Clerk、Entra ID、Cognito |
| ファイル保管 | Cloudflare R2(S3互換) | AWS S3、Vercel Blob |
| PDF | @react-pdf/renderer + Noto Sans JP | Playwright(HTML→PDF) |
| メール | Resend(本文はテキスト。送信部分は `src/server/mailer.ts` の1か所) | Amazon SES、SendGrid |
| 定期処理 | Vercel Cron | GitHub Actions、Inngest |
| ログ | 操作ログテーブル + Sentry + 構造化ログ | Datadog、CloudWatch Logs |
| テスト・CI | Vitest + Playwright + GitHub Actions | Jest、Cypress |
| 公開 | Vercel / Dockerfile(standalone 出力) | 客先の AWS・Azure |

## データモデル

業務テーブルは12個です(`src/db/schema.ts`)。ログイン用の session・account・verification は Better Auth が使うテーブルで、個数には含めません。

| テーブル | 内容 |
| --- | --- |
| projects | 案件(1件の手配依頼) |
| arrangements | 手配明細(宿・バス・観光タクシーなど) |
| supplier_requests / request_items | 仕入先への依頼(照会・手配・変更・取消)と、含めた手配明細 |
| attachments | FAXで届いた依頼書・回答の原本 |
| tasks | タスク(回答期限・取消料発生日から自動生成) |
| comments / status_history | コメントと変更履歴 |
| audit_logs | 操作ログ(追記のみ) |
| agencies / suppliers / user | 依頼元・仕入先・担当者 |

案件ステータスのルールは `src/lib/status.ts` の1か所にまとめています。

## サーバー処理の作り

| 場所 | 役割 |
| --- | --- |
| `src/lib/validation.ts` | 入力チェック(Zod)。画面とサーバーで同じ定義を使う |
| `src/server/queries.ts` | 画面表示用の読み取り(案件・タスク・マスタ・担当者・操作ログ) |
| `src/server/*.ts` | 業務処理(案件・手配明細・タスク・コメント・マスタ・担当者)。権限・ステータス遷移・変更履歴・自動タスク・操作ログをここで扱う。画面に依存しないのでテストから直接呼べる |
| `src/app/actions/*.ts` | Server Action。ログインを確かめ、入力をチェックし、業務処理を呼ぶだけの薄い層 |
| `src/lib/auth.ts` / `src/lib/session.ts` | ログイン(Better Auth)と、ログイン中の担当者の取り出し |
| `src/proxy.ts` | 未ログインなら /login へ回す簡易チェック(本当の確認は各処理で毎回行う) |

## 画面

| URL | 画面 |
| --- | --- |
| `/` | ダッシュボード(期限が近いタスク、出発が近い案件、回答期限切れ・未依頼の手配、今月出発の粗利見込み、ステータス別の件数) |
| `/projects` | 案件一覧。リストとカンバンを切り替え(キーワード・依頼元・担当者で絞り込み。条件は URL に残る)。カンバンはカードをドラッグして、許された列にだけステータスを進められる |
| `/projects/new`、`/projects/[id]/edit` | 案件の登録・編集 |
| `/projects/[id]` | 案件詳細(ステータス操作、金額のまとめ、案件票・行程表のPDF、手配明細・手配依頼・添付書類・タスク・コメント・履歴のタブ。手配明細はモーダルで追加・編集) |
| `/tasks` | タスク一覧(期限切れ・今日・7日以内・それ以降。担当者で絞り込み、手動タスクはその場で完了) |
| `/agencies`、`/suppliers` | 依頼元・仕入先マスタ(追加・編集・利用停止。削除はせず過去の案件の記録を残す) |
| `/users` | 担当者管理(管理者のみ。追加・権限変更・利用停止・パスワード再設定) |
| `/audit` | 操作ログ(管理者のみ。種類・操作した人・日付で絞り込み、変更内容を「前 → 後」で表示) |

- スマホでは上部メニュー・カード表示に切り替わる
- 画面の枠は先に表示し、データは読み込めた部分から順に表示する(Next.js の Cache Components と Suspense)
- 入力エラーのときも打った内容は消えない
- 自動タスク(回答期限・取消料発生日)は手配明細に合わせて自動で完了し、手では操作できない
- コメントは追記のみ(やり取りの記録として残す)

- 複数のテーブルにまたがる更新は、すべてトランザクションでまとめて確定する
- 操作ログは追記のみ。パスワードなどの秘密の値は記録しない
- 利用停止にした担当者はログインできず、使用中のセッションもすぐに消える

## 手配依頼とPDF

案件詳細の「手配依頼」タブから、仕入先ごとに依頼書(PDF)を作って送ります。

1. 仕入先・依頼の種類(照会・手配・変更・取消)・手配を選ぶ。受注前は照会だけ、受注後は手配・変更、終了した案件は取消だけ選べる
2. 「PDFを確認」で送る前の依頼書を別タブで開く(記録はしない)
3. メールなら PDF を添付して送り、FAX なら自社の FAX で送ったあとに記録する。送ると手配は「依頼中」(取消依頼は「取消」)になる
4. 仕入先から回答が来たら「回答を入力」で、手配ごとに 確定 / 仮押さえ / 手配不可 と確定番号・原価を入れる

- 依頼書は FAX で読みやすいよう A4縦・白黒・本文10pt。日本語フォントは Noto Sans JP(SIL Open Font License)を npm パッケージから読み込む
- 依頼番号は「案件番号-R連番」。送付・回答・PDFの表示はすべて操作ログに残る
- メールは `RESEND_API_KEY` がないときは送らずにサーバーのログへ出す。`DEMO_MAIL_TO` を入れると宛先をすべてそのアドレスに差し替える(公開デモで実在の宛先へ送らないため)

### メールを実際に送る(任意)

1. [Resend](https://resend.com) に無料登録し、API Keys で鍵を作る
2. `.env.local` に `RESEND_API_KEY=(作った鍵)` と、`DEMO_MAIL_TO=(Resend に登録した自分のメールアドレス)` を書く
3. 開発サーバーを起動し直して手配依頼をメールで送ると、自分宛てに PDF 付きのメールが届く

独自ドメインを Resend に登録するまでは、差出人 `onboarding@resend.dev` から自分のアドレスにしか送れません(デモではこれで十分です)。

## 案件票・行程表と添付書類

案件詳細の上部のボタンから、PDF を別タブで開きます(開いた記録は操作ログに残ります)。

| PDF | 用途 | 載せないもの |
| --- | --- | --- |
| 案件票(社内) | 社内での確認・保管。手配明細、原価・販売額、粗利、未完了のタスク、メモ | — |
| 案件票(依頼元向け) | 旅行会社への手配状況の回答(「手配状況のご案内」) | 原価・粗利・仕入先の連絡先・社内メモ |
| 行程表 | 添乗員・社内向け。日別・時刻順の行程、集合場所、確定番号、緊急連絡先 | 金額 |

「添付書類」タブでは、FAX で届いた依頼書・変更依頼や仕入先の回答を PDF・写真(JPEG・PNG・WebP、4MBまで)で残します。

- ファイルの種類は中身の先頭で判断する(拡張子や送られてきた種類は信用しない)
- 保管場所は Cloudflare R2(S3 互換 API。`src/server/storage.ts`)。R2 を設定しない手元では `.data/uploads` に置く
- 表示はログインした担当者だけ。開いた記録も操作ログに残る
- 公開デモの毎朝の作り直しでは、添付ファイルもまとめて消す

### Cloudflare R2 を使う(任意。公開時は必須)

1. Cloudflare に無料登録し、R2 を有効にしてバケット(例: `tour-ops`)を作る
2. R2 の「API トークンを管理」で、そのバケットに「オブジェクトの読み取りと書き込み」ができるトークンを作る
3. 表示されたアカウントID・アクセスキーID・シークレットを `.env.local` の `R2_ACCOUNT_ID`・`R2_ACCESS_KEY_ID`・`R2_SECRET_ACCESS_KEY` に、バケット名を `R2_BUCKET` に入れる

## 毎朝の処理(期限の通知)

Vercel Cron が毎朝6時ごろ(日本時間)に `/api/cron/daily` を呼びます(`vercel.json`。無料プランでは1日1回・前後1時間の幅で動きます)。

1. `DEMO_RESET=true` のとき(公開デモ)は、データを今日の日付で作り直す
2. 取消料発生日を過ぎた自動タスクを完了にする
3. 担当者ごとに、期限切れ・今日・3日以内のタスクと、7日以内に出発するのに確定していない手配をメールで知らせる(何もない人には送らない)

- 合言葉 `CRON_SECRET` を知っている呼び出しだけ受け付ける。未設定なら誰も実行できない
- 同じ日に2回呼ばれても、2回目は何もしない。実行結果は操作ログ(種類「システム」)に残る
- 管理者はダッシュボードの「今すぐ送る」で手動でも実行できる(このときはデモデータを作り直さない)

手元で Cron と同じ呼び出しを試すには、`.env.local` に `CRON_SECRET` を入れて開発サーバーを起動し、別の PowerShell で次を実行します。

```powershell
$secret = (Select-String -Path .env.local -Pattern '^CRON_SECRET=(.+)$').Matches[0].Groups[1].Value
Invoke-RestMethod -Uri http://localhost:3000/api/cron/daily -Headers @{ Authorization = "Bearer $secret" }
```

## テスト・エラー監視・Docker

### テストは2段構え

| 種類 | 中身 | 動かし方 |
| --- | --- | --- |
| 単体テスト(Vitest) | 業務処理・入力チェック・PDF・メール・保管場所など。DB は PGlite(メモリ上の Postgres)なので接続不要 | `npm.cmd test` |
| 画面テスト(Playwright) | 本番ビルドを起動し、本物のブラウザでログイン・案件登録・カンバン・手配依頼・回答・添付・管理画面・スマホ表示を操作する(`e2e/`) | GitHub Actions で自動。手元では下記 |

GitHub Actions では、push のたびに「Lint・型・単体テスト・ビルド」「画面テスト(Postgres をサービスとして起動)」「Docker イメージを作って起動・ログインできるか」の3つが走ります。

画面テストを手元で動かすには、中身を消してよいテスト専用の Postgres が必要です。本番の Neon を消さないよう、接続先が手元(localhost)でなければ止まるようにしてあります。Docker Desktop があれば、使い捨ての Postgres を立てて動かせます(任意。GitHub Actions では自動で動きます)。

```powershell
docker run --rm -d --name tour-ops-e2e-db -p 5433:5432 -e POSTGRES_USER=tour_ops -e POSTGRES_PASSWORD=tour_ops -e POSTGRES_DB=tour_ops_e2e postgres:17-alpine
npx playwright install chromium
$env:E2E_DATABASE_URL = "postgresql://tour_ops:tour_ops@localhost:5433/tour_ops_e2e"
npm.cmd run build
npm.cmd run test:e2e
docker stop tour-ops-e2e-db
```

### エラー監視(Sentry)とログ

- `SENTRY_DSN`(サーバー)と `NEXT_PUBLIC_SENTRY_DSN`(ブラウザ)を入れると、想定外のエラーを Sentry に送る。空欄なら何も送らない
- 送るのはエラーの内容と場所だけ。ログインのクッキー・リクエストの本文・案件の中身・利用者の情報は送らない(`src/lib/sentry-options.ts`)。無料枠に収めるため性能計測もしない
- Sentry の画面で「新しいエラーが出たらメールで知らせる」設定にしておく(既定で有効)
- アプリの動作ログは1行1件の JSON(`src/lib/logger.ts`)。Vercel のログ画面や `docker logs` でそのまま検索できる

### Docker で動かす

Vercel 以外(客先の AWS・Azure、社内サーバーなど)へ移すときの確認用です。Postgres・マイグレーション・デモデータ込みで起動します。

```powershell
docker compose up --build
```

http://localhost:3000 を開くと、ログイン画面にデモ用アカウントが出ます。止めるときは `docker compose down`(データも消すなら `docker compose down -v`)。

- `Dockerfile` はマルチステージで、実行用イメージにはビルド道具を入れない(standalone 出力 + 静的ファイル、一般ユーザーで実行、ヘルスチェック付き)
- 起動前に `migrate` がテーブルを作り、空のときだけデモデータを入れる
- メール・R2・Sentry は未設定のまま動く(メールはログに出し、添付はボリュームに保存)

## 動かし方(Windows / PowerShell)

前提: Node.js 22 以上、Neon のアカウント(無料プラン)

```powershell
# 1. 依存関係を入れる
npm.cmd install

# 2. 環境変数を用意する(DATABASE_URL と BETTER_AUTH_SECRET を入れる)
Copy-Item .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # 秘密鍵を作る
notepad .env.local

# 3. テーブルを作り、デモデータを入れる
npm.cmd run db:migrate
npm.cmd run db:seed

# 4. 起動して http://localhost:3000 を開く
npm.cmd run dev
```

デモデータは「今日」を基準に作るので、`npm.cmd run db:seed` を実行し直すといつでも初期状態に戻せます。

### デモ用アカウント

| 権限 | メールアドレス |
| --- | --- |
| 管理者 | admin@tour-ops.example |
| 手配担当 | staff1@tour-ops.example |
| 手配担当 | staff2@tour-ops.example |

パスワードは `.env.local` の `SEED_DEMO_PASSWORD`(初期値 `tour-ops-demo`)です。`DEMO_MODE=true` のときは、ログイン画面にも表示されます。

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `npm.cmd run dev` | 開発サーバー |
| `npm.cmd run lint` | Lint |
| `npm.cmd run typecheck` | 型チェック |
| `npm.cmd test` | 単体テスト(PGlite でマイグレーション・デモデータ・業務処理を検証。DB接続は不要) |
| `npm.cmd run test:e2e` | 画面テスト(先に `npm.cmd run build`。`E2E_DATABASE_URL` が必要) |
| `npm.cmd start` | 本番ビルドを起動する(standalone 出力に静的ファイルをコピーしてから起動) |
| `npm.cmd run db:generate` | スキーマ変更後にマイグレーションSQLを作る |
| `npm.cmd run db:migrate` | マイグレーションを Neon に反映する |
| `npm.cmd run db:seed` | デモデータを入れ直す |
| `npm.cmd run db:studio` | DBの中身をブラウザで見る |

## 作成について

構想・設計判断・確認・運用は李匡祐が行い、プログラムのコードは AI(Claude)が作成しています。
