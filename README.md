# tour-ops 観光手配案件管理

旅行会社から受けた手配依頼を **1件 = 1チケット** として、引合から精算・完了まで追う案件管理アプリです。
宿・バス・観光タクシー・ガイド・食事などの手配明細と、その回答期限・取消料発生日を取りこぼさず追えることを目指しています。
ポートフォリオ用のデモで、会社名・人名・データはすべて架空です。

> 開発状況: **ステップ1(土台)まで完了**。ログイン・画面・手配依頼書PDFなどは順に追加します。

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

## 動かし方(Windows / PowerShell)

前提: Node.js 22 以上、Neon のアカウント(無料プラン)

```powershell
# 1. 依存関係を入れる
npm.cmd install

# 2. 環境変数を用意して、DATABASE_URL に Neon の接続文字列を入れる
Copy-Item .env.example .env.local
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

パスワードは `.env.local` の `SEED_DEMO_PASSWORD`(初期値 `tour-ops-demo`)です。ログイン画面はステップ2で追加します。

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `npm.cmd run dev` | 開発サーバー |
| `npm.cmd run lint` | Lint |
| `npm.cmd run typecheck` | 型チェック |
| `npm.cmd test` | テスト(PGlite でマイグレーションとデモデータも検証。DB接続は不要) |
| `npm.cmd run db:generate` | スキーマ変更後にマイグレーションSQLを作る |
| `npm.cmd run db:migrate` | マイグレーションを Neon に反映する |
| `npm.cmd run db:seed` | デモデータを入れ直す |
| `npm.cmd run db:studio` | DBの中身をブラウザで見る |

## 作成について

構想・設計判断・確認・運用は李匡祐が行い、プログラムのコードは AI(Claude)が作成しています。
