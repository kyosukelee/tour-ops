import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="mt-1 text-xl font-semibold">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-muted-foreground">URL が間違っているか、案件が削除された可能性があります。</p>
      <Link href="/projects" className="mt-6 inline-block text-sm underline">
        案件一覧に戻る
      </Link>
    </div>
  );
}
