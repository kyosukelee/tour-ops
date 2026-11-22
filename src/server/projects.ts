// 案件の登録・更新・ステータス変更
import { and, desc, eq, like } from "drizzle-orm";
import { projects, statusHistory } from "@/db/schema";
import type { Db } from "@/db/types";
import { canTransitionProject, PROJECT_STATUS_LABEL, TERMINAL_STATUSES, type ProjectStatus } from "@/lib/status";
import { todayInTokyo } from "@/lib/dates";
import type { ProjectInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";

export async function getProjectOrThrow(db: Db, id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "案件が見つかりません");
  return row;
}

// 案件番号: T-年-連番(4桁)
export async function nextProjectCode(db: Db, year: string): Promise<string> {
  const [last] = await db
    .select({ code: projects.code })
    .from(projects)
    .where(like(projects.code, `T-${year}-%`))
    .orderBy(desc(projects.code))
    .limit(1);
  const n = last ? Number(last.code.slice(-4)) + 1 : 1;
  return `T-${year}-${String(n).padStart(4, "0")}`;
}

export async function createProject(db: Db, ctx: Ctx & { today?: string }, input: ProjectInput) {
  assertCan(ctx.actor, "projects.write");
  const year = (ctx.today ?? todayInTokyo()).slice(0, 4);

  return db.transaction(async (tx) => {
    const code = await nextProjectCode(tx, year);
    const [created] = await tx
      .insert(projects)
      .values({ ...input, code, status: "inquiry", ownerUserId: input.ownerUserId ?? ctx.actor.id })
      .returning();
    await tx.insert(statusHistory).values({
      projectId: created.id, fromStatus: null, toStatus: "inquiry", changedBy: ctx.actor.id,
    });
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "project.create", targetType: "project", targetId: created.id,
      projectId: created.id, after: created, request: ctx.request,
    });
    return created;
  });
}

export async function updateProject(db: Db, ctx: Ctx, id: string, input: ProjectInput) {
  assertCan(ctx.actor, "projects.write");
  return db.transaction(async (tx) => {
    const before = await getProjectOrThrow(tx, id);
    if (TERMINAL_STATUSES.includes(before.status as ProjectStatus)) {
      throw new AppError("INVALID", `「${PROJECT_STATUS_LABEL[before.status as ProjectStatus]}」の案件は編集できません`);
    }
    const [after] = await tx
      .update(projects)
      .set({ ...input, ownerUserId: input.ownerUserId ?? before.ownerUserId })
      .where(eq(projects.id, id))
      .returning();
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "project.update", targetType: "project", targetId: id,
      projectId: id, before, after, request: ctx.request,
    });
    return after;
  });
}

// 人が操作して進めるステータス変更(手配中⇔手配完了は手配明細から自動で決まる)
export async function changeProjectStatus(db: Db, ctx: Ctx, id: string, to: ProjectStatus) {
  assertCan(ctx.actor, "projects.write");
  return db.transaction(async (tx) => {
    const before = await getProjectOrThrow(tx, id);
    const from = before.status as ProjectStatus;
    if (!canTransitionProject(from, to)) {
      throw new AppError(
        "INVALID",
        `「${PROJECT_STATUS_LABEL[from]}」から「${PROJECT_STATUS_LABEL[to]}」には変更できません`,
      );
    }
    const [after] = await tx
      .update(projects)
      .set({ status: to })
      .where(and(eq(projects.id, id), eq(projects.status, from))) // 同時更新の取りこぼしを防ぐ
      .returning();
    if (!after) throw new AppError("CONFLICT", "ほかの人が先に更新しました。画面を更新してやり直してください");
    await tx.insert(statusHistory).values({ projectId: id, fromStatus: from, toStatus: to, changedBy: ctx.actor.id });
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "project.status_change", targetType: "project", targetId: id,
      projectId: id, before: { status: from }, after: { status: to }, request: ctx.request,
    });
    return after;
  });
}
