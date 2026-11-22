// タスク・コメントの業務処理と、タスク一覧・マスタ・担当者・操作ログの読み取り
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { taskInput } from "@/lib/validation";
import { AppError } from "@/server/core";
import { listAgencies, listAuditLogs, listSuppliers, listTasks, listUsers, getProjectDetail, AUDIT_PAGE_SIZE } from "@/server/queries";
import { addComment, createTask, deleteTask, setTaskDone } from "@/server/tasks";
import { createTestDb, projectByTitle, TODAY } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
}

describe("タスク", () => {
  it("担当者を空欄にすると案件の担当者になり、完了・戻し・削除が操作ログに残る", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    const task = await createTask(t.db, t.adminCtx, p.id, taskInput.parse({ title: "バス会社へ座席表を送る", dueDate: TODAY, assigneeUserId: "" }));
    expect(task.assigneeUserId).toBe(p.ownerUserId);
    expect(task.source).toBe("manual");

    await setTaskDone(t.db, t.staffCtx, task.id, true);
    await setTaskDone(t.db, t.staffCtx, task.id, false);
    await deleteTask(t.db, t.staffCtx, task.id);
    expect(await t.db.select().from(s.tasks).where(eq(s.tasks.id, task.id))).toHaveLength(0);

    const logs = await t.db.select({ action: s.auditLogs.action }).from(s.auditLogs).where(eq(s.auditLogs.targetId, task.id));
    expect(logs.map((l) => l.action).sort()).toEqual(["task.create", "task.delete", "task.done", "task.reopen"]);
  });

  it("自動タスクは手で完了・削除できない", async () => {
    const [auto] = await t.db.select().from(s.tasks).where(eq(s.tasks.source, "auto")).limit(1);
    await expectAppError(setTaskDone(t.db, t.staffCtx, auto.id, true), "INVALID");
    await expectAppError(deleteTask(t.db, t.staffCtx, auto.id), "INVALID");
  });

  it("タスク一覧: 未完了は期限の近い順、「自分」は自分の担当だけ", async () => {
    const open = await listTasks(t.db, { today: TODAY, userId: t.staff.id });
    expect(open.every((x) => !x.done)).toBe(true);
    const dues = open.map((x) => x.dueDate);
    expect([...dues].sort()).toEqual(dues);
    const mine = await listTasks(t.db, { today: TODAY, userId: t.staff.id, assignee: "me" });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((x) => x.assigneeUserId === t.staff.id)).toBe(true);
    const done = await listTasks(t.db, { today: TODAY, userId: t.staff.id, show: "done" });
    expect(done.every((x) => x.done)).toBe(true);
  });
});

describe("コメント", () => {
  it("追記すると案件詳細に新しい順で出る", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    await addComment(t.db, t.staffCtx, p.id, { body: "1件目" });
    await addComment(t.db, t.adminCtx, p.id, { body: "2件目" });
    const d = await getProjectDetail(t.db, p.id);
    expect(d!.comments[0]).toMatchObject({ body: "2件目", authorName: t.admin.name });
    const [log] = await t.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "comment.create"), eq(s.auditLogs.projectId, p.id))).orderBy(desc(s.auditLogs.createdAt)).limit(1);
    expect(log).toBeTruthy();
  });

  it("存在しない案件にはコメントできない", async () => {
    await expectAppError(addComment(t.db, t.staffCtx, "00000000-0000-0000-0000-000000000000", { body: "x" }), "NOT_FOUND");
  });
});

describe("マスタ・担当者・操作ログの読み取り", () => {
  it("依頼元は進行中の案件数、仕入先は取消以外の手配件数を持つ", async () => {
    const agencies = await listAgencies(t.db);
    expect(agencies.length).toBe(3);
    expect(agencies.reduce((n, a) => n + a.openProjects, 0)).toBe(9);
    const suppliers = await listSuppliers(t.db);
    expect(suppliers.length).toBe(13);
    expect(suppliers.some((x) => x.arrangementCount > 0)).toBe(true);
  });

  it("担当者一覧", async () => {
    const users = await listUsers(t.db);
    expect(users.map((u) => u.email)).toContain("admin@tour-ops.example");
  });

  it("操作ログは種類・担当者で絞り込め、ページに分かれる", async () => {
    const all = await listAuditLogs(t.db);
    expect(all.rows.length).toBeLessThanOrEqual(AUDIT_PAGE_SIZE);
    expect(all.total).toBeGreaterThan(0);
    const tasks = await listAuditLogs(t.db, { kind: "task" });
    expect(tasks.rows.length).toBeGreaterThan(0);
    expect(tasks.rows.every((r) => r.action.startsWith("task."))).toBe(true);
    const byStaff = await listAuditLogs(t.db, { userId: t.staff.id });
    expect(byStaff.rows.every((r) => r.userId === t.staff.id)).toBe(true);
    expect(byStaff.rows[0].userName).toBe(t.staff.name);
    const far = await listAuditLogs(t.db, { page: 999 });
    expect(far.rows).toHaveLength(0);
  });
});
