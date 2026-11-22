"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { todayInTokyo } from "@/lib/dates";
import { runAction, type ActionResult } from "@/server/action-utils";
import { assertCan } from "@/server/core";
import { runDailyJob } from "@/server/daily";
import { createMailer } from "@/server/mailer";

// 管理者が「通知メールを今すぐ送る」を押したとき。デモデータの作り直しはしない(操作中の人がログアウトされるため)
export async function runDailyJobAction(_prev: ActionResult, formData: FormData) {
  void formData;
  const result = await runAction(z.object({}), {}, async (db, ctx) => {
    assertCan(ctx.actor, "system.run");
    const r = await runDailyJob(db, {
      today: todayInTokyo(),
      mailer: createMailer(),
      appUrl: process.env.BETTER_AUTH_URL ?? "",
      force: true,
      triggeredBy: { userId: ctx.actor.id },
    });
    return r.skipped ? { mailsSent: 0, closedTasks: 0 } : { mailsSent: r.mails.filter((m) => m.ok).length, closedTasks: r.closedTasks };
  });
  if (result.ok) refresh();
  return result;
}
