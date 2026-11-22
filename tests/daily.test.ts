// 毎朝の処理: 通知メールの中身、自動タスクの完了、1日1回、デモの作り直し
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { addDays } from "@/lib/dates";
import type { Mailer, MailMessage } from "@/server/mailer";
import { buildDigests, digestMail, runDailyJob } from "@/server/daily";
import { createTestDb, TODAY } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  t = await createTestDb();
});

function fakeMailer(failTo?: string) {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(m) {
      if (m.to === failTo) throw new Error("bounce");
      sent.push(m);
      return { id: null, deliveredTo: m.to, redirected: false, transport: "log" };
    },
  };
  return { mailer, sent };
}

describe("通知の中身", () => {
  it("担当者ごとに、期限切れ・今日・3日以内のタスクと、出発が近いのに未確定の手配をまとめる", async () => {
    const digests = await buildDigests(t.db, TODAY);
    expect(digests.length).toBeGreaterThan(0);
    for (const d of digests) {
      expect(d.overdue.every((x) => x.dueDate < TODAY)).toBe(true);
      expect(d.today.every((x) => x.dueDate === TODAY)).toBe(true);
      expect(d.soon.every((x) => x.dueDate > TODAY && x.dueDate <= addDays(TODAY, 3))).toBe(true);
    }
    // 「中学校 校外学習」は5日後出発で、未確定の手配がある(担当: デモ 太郎)
    const staff1 = digests.find((d) => d.email === "staff1@tour-ops.example")!;
    expect(staff1.departures.map((p) => p.title)).toContain("中学校 校外学習");

    const mail = digestMail(staff1, TODAY, "https://example.com");
    expect(mail.to).toBe("staff1@tour-ops.example");
    expect(mail.text).toContain("https://example.com/tasks");
    expect(mail.text).toContain("中学校 校外学習");
  });

  it("利用停止の担当者には送らない", async () => {
    await t.db.update(s.users).set({ active: false }).where(eq(s.users.id, t.staff.id));
    const digests = await buildDigests(t.db, TODAY);
    expect(digests.some((d) => d.userId === t.staff.id)).toBe(false);
  });
});

describe("runDailyJob", () => {
  it("取消料発生日を過ぎた自動タスクを完了にし、メールを送り、記録する。同じ日の2回目は何もしない", async () => {
    const { mailer, sent } = fakeMailer();
    const r = await runDailyJob(t.db, { today: TODAY, mailer, appUrl: "https://example.com" });
    expect(r.skipped).toBe(false);
    expect(sent.length).toBeGreaterThan(0);
    const passed = await t.db
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.autoType, "cancel_fee"), eq(s.tasks.done, false)));
    expect(passed.every((x) => x.dueDate >= TODAY)).toBe(true);
    const [log] = await t.db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "system.daily"));
    expect(log.changes).toMatchObject({ trigger: "自動(毎朝)", mailsSent: sent.length });

    const again = await runDailyJob(t.db, { today: TODAY, mailer, appUrl: "" });
    expect(again.skipped).toBe(true);
    // 手動(force)なら同じ日でも送る
    const forced = await runDailyJob(t.db, { today: TODAY, mailer, appUrl: "", force: true, triggeredBy: { userId: t.admin.id } });
    expect(forced.skipped).toBe(false);
  });

  it("1人に送れなくても、ほかの人には送る", async () => {
    const { mailer, sent } = fakeMailer("staff1@tour-ops.example");
    const r = await runDailyJob(t.db, { today: TODAY, mailer, appUrl: "" });
    if (r.skipped) throw new Error("skipped");
    expect(r.mails.find((m) => m.to === "staff1@tour-ops.example")?.ok).toBe(false);
    expect(sent.length).toBe(r.mails.length - 1);
  });

  it("デモ公開中は、データを今日の日付で作り直してから通知する", async () => {
    const tomorrow = addDays(TODAY, 1);
    await t.db.insert(s.comments).values({ projectId: (await t.db.select().from(s.projects).limit(1))[0].id, body: "消えるはず" });
    const { mailer } = fakeMailer();
    const r = await runDailyJob(t.db, { today: tomorrow, mailer, appUrl: "", demoReset: { password: "test-password" } });
    if (r.skipped) throw new Error("skipped");
    expect(r.reset).toBe(true);
    expect(await t.db.select().from(s.comments).where(eq(s.comments.body, "消えるはず"))).toHaveLength(0);
    const [seed] = await t.db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "system.seed"));
    expect(seed.changes).toMatchObject({ today: tomorrow });
  });
});
