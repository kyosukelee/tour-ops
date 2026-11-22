# syntax=docker/dockerfile:1
# tour-ops を手元のコンテナで動かすためのイメージ(Vercel 以外への移し先の確認用)
#   docker compose up --build で、Postgres・マイグレーション・デモデータ込みで起動する(README 参照)

# ---- 依存パッケージ ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- ビルド ----
FROM deps AS builder
COPY . .
# public フォルダは中身が空だと Git に入らないので、無くても後の COPY が失敗しないように作っておく
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# ブラウザ側の Sentry はビルド時に埋め込まれるので、使うときはビルド引数で渡す
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
RUN npm run build

# ---- マイグレーションとデモデータ(起動前に1回だけ動かす道具) ----
FROM builder AS tools
CMD ["sh", "-c", "npx drizzle-kit migrate && npx tsx scripts/seed.ts --if-empty"]

# ---- 実行用(できるだけ小さく。ビルド道具は入れない) ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
# standalone 出力(サーバーと必要な node_modules)に、静的ファイルを足す
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# R2 を使わないときの添付ファイルの保存先(docker compose ではボリュームをつなぐ)
RUN mkdir -p .data/uploads && chown -R app:app .data
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
