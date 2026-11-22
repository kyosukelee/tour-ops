// Sentry(ブラウザ側)。NEXT_PUBLIC_SENTRY_DSN が未設定なら何も送らない
import * as Sentry from "@sentry/nextjs";
import { sentryCommonOptions } from "@/lib/sentry-options";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  ...sentryCommonOptions,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
