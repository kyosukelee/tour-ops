// 手配明細の登録・更新。あわせて自動タスクと案件ステータス(手配中⇔手配完了)を追従させる
import { and, eq } from "drizzle-orm";
import { arrangements, projects, statusHistory, suppliers, tasks } from "@/db/schema";
import type { Db } from "@/db/types";
import { todayInTokyo } from "@/lib/dates";
import {
  canConfirmArrangement,
  deriveProjectStatus,
  PROJECT_STATUS_LABEL,
  type ArrangementStatus,
  type ProjectStatus,
} from "@/lib/status";
import type { ArrangementInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";
import { getProjectOrThrow } from "./projects";

type Arrangement = typeof arrangements.$inferSelect;
type Project = typeof projects.$inferSelect;
type CtxWithToday = Ctx & { today?: string };

// 終了した案件の手配は、取消料・精算の記録だけを受け付ける
function assertEditable(project: Project, input: ArrangementInput, isNew: boolean) {
  const status = project.status as ProjectStatus;
  if (status === "completed") throw new AppError("INVALID", "完了した案件の手配は編集できません");
  if (status === "lost" || status === "cancelled") {
    if (isNew) throw new AppError("INVALID", `「${PROJECT_STATUS_LABEL[status]}」の案件には手配を追加できません`);
    if (input.status !== "cancelled") {
      throw new AppError("INVALID", `「${PROJECT_STATUS_LABEL[status]}」の案件の手配は「取消」のまま、取消料・精算だけ記録できます`);
    }
  }
  if (input.status === "confirmed" && !canConfirmArrangement(status)) {
    throw new AppError("INVALID", "手配を「確定」にできるのは受注(手配中)以降です", {
      status: ["受注前は「仮押さえ」までにしてください"],
    });
  }
}

export async function createArrangement(db: Db, ctx: CtxWithToday, projectId: string, input: ArrangementInput) {
  assertCan(ctx.actor, "arrangements.write");
  return db.transaction(async (tx) => {
    const project = await getProjectOrThrow(tx, projectId);
    assertEditable(project, input, true);
    const [created] = await tx.insert(arrangements).values({ ...input, projectId }).returning();
    await tx.insert(statusHistory).values({
      projectId, arrangementId: created.id, fromStatus: null, toStatus: created.status, changedBy: ctx.actor.id,
    });
    await syncAutoTasks(tx, created, project, ctx.today);
    await syncProjectStatus(tx, ctx, projectId);
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "arrangement.create", targetType: "arrangement", targetId: created.id,
      projectId, after: created, request: ctx.request,
    });
    return created;
  });
}

export async function updateArrangement(db: Db, ctx: CtxWithToday, id: string, input: ArrangementInput) {
  assertCan(ctx.actor, "arrangements.write");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(arrangements).where(eq(arrangements.id, id)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "手配明細が見つかりません");
    const project = await getProjectOrThrow(tx, before.projectId);
    assertEditable(project, input, false);

    const [after] = await tx.update(arrangements).set(input).where(eq(arrangements.id, id)).returning();
    if (before.status !== after.status) {
      await tx.insert(statusHistory).values({
        projectId: before.projectId, arrangementId: id, fromStatus: before.status, toStatus: after.status,
        changedBy: ctx.actor.id,
      });
    }
    await syncAutoTasks(tx, after, project, ctx.today);
    await syncProjectStatus(tx, ctx, before.projectId);
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "arrangement.update", targetType: "arrangement", targetId: id,
      projectId: before.projectId, before, after, request: ctx.request,
    });
    return after;
  });
}

// 手配明細の状態から、手配中⇔手配完了を自動で切り替える
export async function syncProjectStatus(db: Db, ctx: Ctx, projectId: string) {
  const project = await getProjectOrThrow(db, projectId);
  const rows = await db.select({ status: arrangements.status }).from(arrangements).where(eq(arrangements.projectId, projectId));
  const from = project.status as ProjectStatus;
  const to = deriveProjectStatus(from, rows as { status: ArrangementStatus }[]);
  if (to === from) return from;
  await db.update(projects).set({ status: to }).where(eq(projects.id, projectId));
  await db.insert(statusHistory).values({ projectId, fromStatus: from, toStatus: to, changedBy: ctx.actor.id });
  await recordAudit(db, {
    userId: ctx.actor.id, action: "project.status_auto", targetType: "project", targetId: projectId, projectId,
    before: { status: from }, after: { status: to }, request: ctx.request,
  });
  return to;
}

// 回答期限・取消料発生日のタスクを、手配明細の日付と状態に合わせる
export async function syncAutoTasks(db: Db, a: Arrangement, project: Project, today = todayInTokyo()) {
  let supplierName = "仕入先未定";
  if (a.supplierId) {
    const [sup] = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, a.supplierId)).limit(1);
    if (sup) supplierName = sup.name;
  }
  const label = `${supplierName}(${a.description})`;
  const settled = a.status === "confirmed" || a.status === "cancelled";

  const specs = [
    { type: "reply_due" as const, date: a.replyDue, title: `回答期限: ${label}`, done: settled },
    {
      type: "cancel_fee" as const,
      date: a.cancelFeeFrom,
      title: `取消料発生日: ${label}`,
      done: a.status === "cancelled" || (a.cancelFeeFrom !== null && a.cancelFeeFrom < today),
    },
  ];

  for (const spec of specs) {
    const where = and(eq(tasks.arrangementId, a.id), eq(tasks.source, "auto"), eq(tasks.autoType, spec.type));
    const [existing] = await db.select().from(tasks).where(where).limit(1);
    if (!spec.date) {
      if (existing) await db.delete(tasks).where(eq(tasks.id, existing.id));
      continue;
    }
    if (existing) {
      await db.update(tasks).set({ title: spec.title, dueDate: spec.date, done: spec.done }).where(eq(tasks.id, existing.id));
    } else {
      await db.insert(tasks).values({
        projectId: a.projectId, arrangementId: a.id, title: spec.title, dueDate: spec.date,
        assigneeUserId: project.ownerUserId, source: "auto", autoType: spec.type, done: spec.done,
      });
    }
  }
}
