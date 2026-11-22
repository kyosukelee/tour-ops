// 画面テスト(Playwright)。本番ビルドを起動し、本物のブラウザで操作する
// データベースは E2E_DATABASE_URL(テスト専用)を使い、始める前に中身を作り直す。詳しくは README
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  // 同じデモデータを順に操作するので、1本ずつ順番に動かす
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // 手元に入っている Chrome を使うとき(PW_CHROMIUM_PATH にパスを入れる)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: "npm run start",
    url: `${baseURL}/login`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
      BETTER_AUTH_URL: baseURL,
      DEMO_MODE: "true",
      DEMO_MAIL_TO: "e2e@example.com",
      CRON_SECRET: "e2e-cron-secret",
      // 画面テストでは実際にメールを送らない・R2 を使わない(手元のフォルダに保存)
      RESEND_API_KEY: "",
      R2_ACCOUNT_ID: "",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
    },
  },
});
