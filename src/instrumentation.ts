// サーバーの起動時に1回だけ呼ばれる(Next.js の instrumentation)
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
}

// サーバー側で起きた想定外のエラー(画面・Route Handler・Server Action)を Sentry に送る
export const onRequestError = Sentry.captureRequestError;
