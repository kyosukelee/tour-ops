// Sentry(サーバー側)。SENTRY_DSN が未設定なら何も送らない
import * as Sentry from "@sentry/nextjs";
import { sentryCommonOptions } from "@/lib/sentry-options";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
  ...sentryCommonOptions,
});
