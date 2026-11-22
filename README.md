# tour-ops 観光手配案件管理

旅行会社から受けた手配依頼を **1件 = 1チケット** として、引合から精算・完了まで追う案件管理アプリです。
宿・バス・観光タクシー・ガイド・食事などの手配明細と、その回答期限・取消料発生日を取りこぼさず追えることを目指しています。
ポートフォリオ用のデモで、会社名・データはすべて架空です。人名は実在の人と紛れないよう「デモ 太郎」のような仮名にしています。

> 開発状況: **ステップ5(毎朝の期限通知)まで完了**。カンバン、案件票・行程表、添付ファイルなどは順に追加します。

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
| `/` | ダッシュボード(期限が近いタスク、出発が近い案件、ステータス別の件数) |
| `/projects` | 案件一覧(キーワード・ステータス・依頼元・担当者で絞り込み。条件は URL に残る) |
| `/projects/new`、`/projects/[id]/edit` | 案件の登録・編集 |
| `/projects/[id]` | 案件詳細(ステータス操作、金額のまとめ、手配明細・手配依頼・タスク・コメント・履歴のタブ。手配明細はモーダルで追加・編集) |
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
| `npm.cmd test` | テスト(PGlite でマイグレーション・デモデータ・業務処理を検証。DB接続は不要) |
| `npm.cmd run db:generate` | スキーマ変更後にマイグレーションSQLを作る |
| `npm.cmd run db:migrate` | マイグレーションを Neon に反映する |
| `npm.cmd run db:seed` | デモデータを入れ直す |
| `npm.cmd run db:studio` | DBの中身をブラウザで見る |

## 作成について

構想・設計判断・確認・運用は李匡祐が行い、プログラムのコードは AI(Claude)が作成しています。
