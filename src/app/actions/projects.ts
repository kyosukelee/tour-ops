"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { arrangementInput, projectInput, projectStatusInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { createArrangement, updateArrangement } from "@/server/arrangements";
import { changeProjectStatus, createProject, updateProject } from "@/server/projects";

const id = z.uuid();

// 登録・更新に成功したら案件詳細へ移る(失敗したときはエラーを画面に返す)
export async function createProjectAction(_prev: ActionResult, formData: FormData) {
  const result = await runAction(projectInput, formToObject(formData), async (db, ctx, input) => {
    const p = await createProject(db, ctx, input);
    return { id: p.id, code: p.code };
  });
  if (result.ok && result.data) redirect(`/projects/${result.data.id}`);
  return result;
}

export async function updateProjectAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(projectInput, formToObject(formData), async (db, ctx, input) => {
    await updateProject(db, ctx, id.parse(projectId), input);
    return { id: projectId };
  });
  if (result.ok) redirect(`/projects/${projectId}`);
  return result;
}

// ステータス変更・手配明細の保存は、今の画面を最新の内容で描き直す
export async function changeProjectStatusAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(projectStatusInput, formToObject(formData), async (db, ctx, input) => {
    const p = await changeProjectStatus(db, ctx, id.parse(projectId), input.to);
    return { id: p.id, status: p.status };
  });
  if (result.ok) refresh();
  return result;
}

export async function createArrangementAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(arrangementInput, formToObject(formData), async (db, ctx, input) => {
    const a = await createArrangement(db, ctx, id.parse(projectId), input);
    return { id: a.id };
  });
  if (result.ok) refresh();
  return result;
}

export async function updateArrangementAction(arrangementId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(arrangementInput, formToObject(formData), async (db, ctx, input) => {
    await updateArrangement(db, ctx, id.parse(arrangementId), input);
    return { id: arrangementId };
  });
  if (result.ok) refresh();
  return result;
}
