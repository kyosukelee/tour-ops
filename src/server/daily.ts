// 毎朝の処理(Vercel Cron から1日1回呼ばれる。管理者が画面から手動でも実行できる)
// 1. デモ公開中ならデータを今日の日付で作り直す
// 2. 日付が過ぎた自動タスク(取消料発生日)を完了にする
// 3. 担当者ごとに「期限切れ・今日・3日以内のタスク」「出発が近いのに未確定の手配」をメールで知らせる
import { and, asc, eq, gte, inArray, lt, lte, notInArray } from "drizzle-orm";
import * as s from "@/db/schema";
import { resetAll, seedDemoData } from "@/db/seed";
import type { Db } from "@/db/types";
import { addDays, tokyoDateTime } from "@/lib/dates";
import { TERMINAL_STATUSES } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { recordAudit } from "./audit";
import { ATTACHMENT_PREFIX } from "./attachments";
import type { Mailer } from "./mailer";
import type { FileStorage } from "./storage";

type TaskLine = { title: string; dueDate: string; projectCode: string; projectTitle: string };
type ProjectLine = { code: string; title: string; startDate: string; unconfirmed: string[] };

export type Digest = {
  userId: string;
  name: string;
  email: string;
  overdue: TaskLine[];
  today: TaskLine[];
  soon: TaskLine[];
  departures: ProjectLine[];
};

const SOON_DAYS = 3; // タスクは3日先まで
const DEPARTURE_DAYS = 7; // 出発7日以内で未確定の手配を知らせる

// 担当者ごとの通知内容を作る(何もない人は含めない)
export async function buildDigests(db: Db, today: string): Promise<Digest[]> {
  const users = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email })
    .from(s.users)
    .where(eq(s.users.active, true))
    .orderBy(asc(s.users.name));

  const tasks = await db
    .select({
      title: s.tasks.title,
      dueDate: s.tasks.dueDate,
      assignee: s.tasks.assigneeUserId,
      projectCode: s.projects.code,
      projectTitle: s.projects.title,
    })
    .from(s.tasks)
    .innerJoin(s.projects, eq(s.tasks.projectId, s.projects.id))
    .where(
      and(
        eq(s.tasks.done, false),
        lte(s.tasks.dueDate, addDays(today, SOON_DAYS)),
        notInArray(s.projects.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(asc(s.tasks.dueDate), asc(s.projects.code));

  const projects = await db
    .select({ id: s.projects.id, code: s.projects.code, title: s.projects.title, startDate: s.projects.startDate, owner: s.projects.ownerUserId })
    .from(s.projects)
    .where(
      and(
        gte(s.projects.startDate, today),
        lte(s.projects.startDate, addDays(today, DEPARTURE_DAYS)),
        notInArray(s.projects.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(asc(s.projects.startDate));
  const arrs = projects.length
    ? await db
        .select({ projectId: s.arrangements.projectId, description: s.arrangements.description, status: s.arrangements.status })
        .from(s.arrangements)
        .where(and(inArray(s.arrangements.projectId, projects.map((p) => p.id)), notInArray(s.arrangements.status, ["confirmed", "cancelled"])))
    : [];

  const digests: Digest[] = [];
  for (const u of users) {
    const mine = tasks.filter((t) => t.assignee === u.id);
    const departures = projects
      .filter((p) => p.owner === u.id)
      .map((p) => ({ code: p.code, title: p.title, startDate: p.startDate, unconfirmed: arrs.filter((a) => a.projectId === p.id).map((a) => a.description) }))
      .filter((p) => p.unconfirmed.length > 0);
    const d: Digest = {
      userId: u.id,
      name: u.name,
      email: u.email,
      overdue: mine.filter((t) => t.dueDate < today),
      today: mine.filter((t) => t.dueDate === today),
      soon: mine.filter((t) => t.dueDate > today),
      departures,
    };
    if (d.overdue.length + d.today.length + d.soon.length + d.departures.length > 0) digests.push(d);
  }
  return digests;
}

export function digestMail(d: Digest, today: string, appUrl: string) {
  const line = (t: TaskLine) => `・${formatDate(t.dueDate)} ${t.title}(${t.projectCode} ${t.projectTitle})`;
  const parts: string[] = [`${d.name} さん`, "", `${formatDate(today, { withYear: true })} の期限のお知らせです。`];
  if (d.overdue.length) parts.push("", `■ 期限切れのタスク(${d.overdue.length}件)`, ...d.overdue.map(line));
  if (d.today.length) parts.push("", `■ 今日が期限のタスク(${d.today.length}件)`, ...d.today.map(line));
  if (d.soon.length) parts.push("", `■ ${SOON_DAYS}日以内が期限のタスク(${d.soon.length}件)`, ...d.soon.map(line));
  if (d.departures.length) {
    parts.push("", `■ ${DEPARTURE_DAYS}日以内に出発するのに、確定していない手配がある案件(${d.departures.length}件)`);
    for (const p of d.departures) parts.push(`・${formatDate(p.startDate)} 出発 ${p.code} ${p.title}: ${p.unconfirmed.join("、")}`);
  }
  parts.push("", `タスク一覧: ${appUrl}/tasks`, "", "-- ", "tour-ops 観光手配案件管理(このメールは毎朝自動で送っています)");
  const count = d.overdue.length + d.today.length;
  return {
    to: d.email,
    subject: `【tour-ops】${count > 0 ? `期限切れ・今日の期限 ${count}件` : "期限のお知らせ"}(${formatDate(today)})`,
    text: parts.join("\n"),
  };
}

// 日付が過ぎた「取消料発生日」の自動タスクは、その日を過ぎたら完了にする(回答期限は確定・取消まで残す)
async function closePassedCancelFeeTasks(db: Db, today: string) {
  const rows = await db
    .update(s.tasks)
    .set({ done: true })
    .where(and(eq(s.tasks.source, "auto"), eq(s.tasks.autoType, "cancel_fee"), eq(s.tasks.done, false), lt(s.tasks.dueDate, today)))
    .returning({ id: s.tasks.id });
  return rows.length;
}

// 今日すでに実行したか(Vercel Cron は同じ日に2回呼ぶことがあるため)
async function alreadyRanToday(db: Db, today: string) {
  const [row] = await db
    .select({ id: s.auditLogs.id })
    .from(s.auditLogs)
    .where(and(eq(s.auditLogs.action, "system.daily"), gte(s.auditLogs.createdAt, tokyoDateTime(today, "00:00"))))
    .limit(1);
  return !!row;
}

export type DailyOptions = {
  today: string;
  mailer: Mailer;
  appUrl: string;
  demoReset?: { password: string; storage?: FileStorage | null } | null; // デモ公開中だけ指定する
  force?: boolean; // 今日すでに実行していても行う(管理者の手動実行)
  triggeredBy?: { userId: string } | null; // 手動実行した人(Cron のときは null)
};

export type DailyResult =
  | { skipped: true; reason: string }
  | { skipped: false; reset: boolean; closedTasks: number; mails: { to: string; ok: boolean }[] };

export async function runDailyJob(db: Db, opts: DailyOptions): Promise<DailyResult> {
  if (!opts.force && (await alreadyRanToday(db, opts.today))) {
    return { skipped: true, reason: "今日はすでに実行済みです" };
  }

  let reset = false;
  if (opts.demoReset) {
    // 添付ファイルも消す(消さないと保管場所にファイルだけがたまり続ける)
    await opts.demoReset.storage?.deletePrefix(ATTACHMENT_PREFIX);
    await resetAll(db);
    await seedDemoData(db, { today: opts.today, password: opts.demoReset.password });
    reset = true;
  }

  const closedTasks = await closePassedCancelFeeTasks(db, opts.today);

  // 1人の送信失敗で全体を止めない
  const mails: { to: string; ok: boolean }[] = [];
  for (const d of await buildDigests(db, opts.today)) {
    try {
      await opts.mailer.send(digestMail(d, opts.today, opts.appUrl));
      mails.push({ to: d.email, ok: true });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "digest mail failed", to: d.email, error: String(e) }));
      mails.push({ to: d.email, ok: false });
    }
  }

  await recordAudit(db, {
    userId: opts.triggeredBy?.userId ?? null,
    action: "system.daily",
    targetType: "system",
    extra: {
      trigger: opts.triggeredBy ? "手動" : "自動(毎朝)",
      reset,
      closedTasks,
      mailsSent: mails.filter((m) => m.ok).length,
      mailsFailed: mails.filter((m) => !m.ok).length,
    },
  });
  return { skipped: false, reset, closedTasks, mails };
}
