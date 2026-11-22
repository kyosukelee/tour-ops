// 想定外のエラーを記録する: 動作ログ(JSON)に出し、Sentry が設定されていれば送る
// 画面にはエラーを返さず処理を続ける箇所(Server Action の失敗、メールの一部失敗など)で使う
// 処理が止まるエラーは instrumentation.ts の onRequestError が Sentry に送る
import { logger } from "./logger";

export function reportError(msg: string, error: unknown, context: Record<string, unknown> = {}) {
  logger.error(msg, { ...context, error });
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error, { extra: { msg, ...context } }))
    .catch(() => undefined);
}
