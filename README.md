# tour-ops 観光手配案件管理

旅行会社から受けた手配依頼を **1件 = 1チケット** として、引合から精算・完了まで追う案件管理アプリです。
宿・バス・観光タクシー・ガイド・食事などの手配明細と、その回答期限・取消料発生日を取りこぼさず追えることを目指しています。
ポートフォリオ用のデモで、会社名・人名・データはすべて架空です。

> 開発状況: **ステップ3(画面)まで完了**。手配依頼書のPDF・メール送信、期限の自動通知、添付ファイルなどは順に追加します。

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
| PDF | @react-pdf/renderer | Playwright(HTML→PDF) |
| メール | Resend + React Email | Amazon SES、SendGrid |
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
| `/projects/[id]` | 案件詳細(ステータス操作、金額のまとめ、手配明細・タスク・コメント・履歴のタブ。手配明細はモーダルで追加・編集) |
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
| 手配担当 | takahashi@tour-ops.example |
| 手配担当 | nakamura@tour-ops.example |

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
