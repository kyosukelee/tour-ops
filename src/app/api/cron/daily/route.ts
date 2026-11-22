// Vercel Cron から毎朝呼ばれる(vercel.json)。CRON_SECRET を知っている呼び出しだけ受け付ける
import { getDb } from "@/db";
import { todayInTokyo } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { runDailyJob } from "@/server/daily";
import { createMailer } from "@/server/mailer";
import { createStorage } from "@/server/storage";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // 秘密の値が未設定なら、誰からも実行できないようにする
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyJob(getDb(), {
    today: todayInTokyo(),
    mailer: createMailer(),
    appUrl: process.env.BETTER_AUTH_URL ?? "",
    demoReset:
      process.env.DEMO_RESET === "true"
        ? { password: process.env.SEED_DEMO_PASSWORD ?? "tour-ops-demo", storage: createStorage() }
        : null,
  });
  logger.info("daily job", { result });
  return Response.json(result);
}
