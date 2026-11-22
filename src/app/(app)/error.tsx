"use client";
// ログイン後の画面でエラーが起きたときの表示(メニューは残したまま、本文だけ差し替える)
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">問題が起きたため、表示できませんでした</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        時間をおいて、もう一度お試しください。{error.digest && `(エラー番号: ${error.digest})`}
      </p>
      <Button className="mt-6" onClick={reset}>
        もう一度読み込む
      </Button>
    </div>
  );
}
