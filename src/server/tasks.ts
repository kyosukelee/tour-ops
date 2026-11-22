// タスク(手動)の追加・完了・削除とコメント
// 自動タスク(回答期限・取消料発生日)は手配明細に合わせて arrangements.ts が作り・完了させる
import { eq } from "drizzle-orm";
import { comments, tasks } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CommentInput, TaskInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";
import { getProjectOrThrow } from "./projects";

async function getTaskOrThrow(db: Db, id: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "タスクが見つかりません");
  return row;
}

function assertManual(task: typeof tasks.$inferSelect) {
  if (task.source === "auto") {
    throw new AppError("INVALID", "自動タスクは、手配明細の状態(確定・取消)や日付に合わせて自動で完了・更新されます");
  }
}

export async function createTask(db: Db, ctx: Ctx, projectId: string, input: TaskInput) {
  assertCan(ctx.actor, "projects.write");
  return db.transaction(async (tx) => {
    const project = await getProjectOrThrow(tx, projectId);
    const [created] = await tx
      .insert(tasks)
      .values({ ...input, projectId, assigneeUserId: input.assigneeUserId ?? project.ownerUserId, source: "manual" })
      .returning();
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "task.create", targetType: "task", targetId: created.id, projectId,
      after: created, request: ctx.request,
    });
    return created;
  });
}

export async function setTaskDone(db: Db, ctx: Ctx, id: string, done: boolean) {
  assertCan(ctx.actor, "projects.write");
  return db.transaction(async (tx) => {
    const before = await getTaskOrThrow(tx, id);
    assertManual(before);
    if (before.done === done) return before;
    const [after] = await tx.update(tasks).set({ done }).where(eq(tasks.id, id)).returning();
    await recordAudit(tx, {
      userId: ctx.actor.id, action: done ? "task.done" : "task.reopen", targetType: "task", targetId: id,
      projectId: before.projectId, before: { done: before.done }, after: { done }, extra: { title: before.title }, request: ctx.request,
    });
    return after;
  });
}

export async function deleteTask(db: Db, ctx: Ctx, id: string) {
  assertCan(ctx.actor, "projects.write");
  return db.transaction(async (tx) => {
    const before = await getTaskOrThrow(tx, id);
    assertManual(before);
    await tx.delete(tasks).where(eq(tasks.id, id));
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "task.delete", targetType: "task", targetId: id, projectId: before.projectId,
      before, after: null, request: ctx.request,
    });
  });
}

// コメントは追記のみ(編集・削除はしない。やり取りの記録として残す)
export async function addComment(db: Db, ctx: Ctx, projectId: string, input: CommentInput) {
  assertCan(ctx.actor, "projects.write");
  return db.transaction(async (tx) => {
    await getProjectOrThrow(tx, projectId);
    const [created] = await tx.insert(comments).values({ projectId, body: input.body, authorUserId: ctx.actor.id }).returning();
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "comment.create", targetType: "comment", targetId: created.id, projectId,
      after: { body: created.body }, request: ctx.request,
    });
    return created;
  });
}
