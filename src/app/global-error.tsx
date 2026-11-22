"use client";
// 画面全体が描けないほどのエラーが起きたときの表示。エラーは Sentry に送る
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="ja">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem" }}>問題が起きたため、画面を表示できませんでした</h1>
        <p style={{ color: "#666", fontSize: "0.875rem" }}>
          時間をおいて、もう一度お試しください。{error.digest && `(エラー番号: ${error.digest})`}
        </p>
        <button type="button" onClick={reset} style={{ marginTop: "1.5rem", padding: "0.5rem 1rem" }}>
          もう一度読み込む
        </button>
      </body>
    </html>
  );
}
