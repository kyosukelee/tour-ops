// Sentry に送るデータの範囲(サーバー・ブラウザ共通)
// 業務データ(氏名・連絡先・案件の中身)やログインのクッキーは送らず、エラーの内容と場所だけを送る
// 無料枠(エラー 月5,000件)に収めるため、性能の計測(トレース)もしない
import type { BrowserOptions } from "@sentry/nextjs";

export const sentryCommonOptions: Pick<BrowserOptions, "tracesSampleRate" | "dataCollection"> = {
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ["user-agent", "content-type", "accept"] }, response: false },
    httpBodies: [],
    urlQueryParams: false,
  },
};
