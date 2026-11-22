// 公開デモのデータが今日の日付になっているかを確かめ、古ければその場で作り直す(DEMO_RESET=true のときだけ)
// 毎朝の Cron が止まっても、何か月後に見た人が「案件がすべて期限切れ」の画面を見ないようにするための予備
import "server-only";
import { getDb } from "@/db";
import { todayInTokyo } from "@/lib/dates";
import { reportError } from "@/lib/report-error";
import { ensureDemoFresh } from "./daily";
import { createMailer } from "./mailer";
import { createStorage } from "./storage";

// 同じサーバーで同じ日に何度も DB を見に行かないよう、確かめた日を覚えておく
let checkedFor: string | null = null;

export async function ensureDemoIsFresh() {
  if (process.env.DEMO_RESET !== "true") return;
  const today = todayInTokyo();
  if (checkedFor === today) return;
  try {
    const reset = await ensureDemoFresh(getDb(), {
      today,
      mailer: createMailer(),
      appUrl: process.env.BETTER_AUTH_URL ?? "",
      demoReset: { password: process.env.SEED_DEMO_PASSWORD ?? "tour-ops-demo", storage: createStorage() },
    });
    checkedFor = today;
    if (reset) reportError("demo data was stale: reset on first access (daily cron did not run)", new Error("daily cron missed"), { today });
  } catch (e) {
    // ここで失敗しても画面は出す(古いデータのまま表示し、エラーは記録する)
    reportError("demo freshness check failed", e, { today });
  }
}
