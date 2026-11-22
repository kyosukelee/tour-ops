import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン | tour-ops" };

// デモ公開のときだけ、デモ用アカウントを画面に出す
const demoMode = process.env.DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm text-muted-foreground">tour-ops</p>
        <h1 className="mb-6 text-2xl font-semibold">観光手配案件管理</h1>
        <LoginForm />
        {demoMode && (
          <div className="mt-6 rounded-md border p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">デモ用アカウント</p>
            <p>管理者: admin@tour-ops.example</p>
            <p>手配担当: staff1@tour-ops.example</p>
            <p className="mt-2">パスワード: {process.env.SEED_DEMO_PASSWORD ?? "tour-ops-demo"}</p>
            <p className="mt-2">データは毎朝初期化されます。会社名・人名はすべて架空です(人名は「デモ ◯◯」)。</p>
          </div>
        )}
      </div>
    </main>
  );
}
