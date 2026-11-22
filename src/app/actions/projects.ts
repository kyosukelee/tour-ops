"use server";

import { z } from "zod";
import { arrangementInput, projectInput, projectStatusInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { createArrangement, updateArrangement } from "@/server/arrangements";
import { changeProjectStatus, createProject, updateProject } from "@/server/projects";

const id = z.uuid();

export async function createProjectAction(_prev: ActionResult, formData: FormData) {
  return runAction(projectInput, formToObject(formData), async (db, ctx, input) => {
    const p = await createProject(db, ctx, input);
    return { id: p.id, code: p.code };
  });
}

export async function updateProjectAction(projectId: string, _prev: ActionResult, formData: FormData) {
  return runAction(projectInput, formToObject(formData), async (db, ctx, input) => {
    await updateProject(db, ctx, id.parse(projectId), input);
    return { id: projectId };
  });
}

export async function changeProjectStatusAction(projectId: string, _prev: ActionResult, formData: FormData) {
  return runAction(projectStatusInput, formToObject(formData), async (db, ctx, input) => {
    const p = await changeProjectStatus(db, ctx, id.parse(projectId), input.to);
    return { id: p.id, status: p.status };
  });
}

export async function createArrangementAction(projectId: string, _prev: ActionResult, formData: FormData) {
  return runAction(arrangementInput, formToObject(formData), async (db, ctx, input) => {
    const a = await createArrangement(db, ctx, id.parse(projectId), input);
    return { id: a.id };
  });
}

export async function updateArrangementAction(arrangementId: string, _prev: ActionResult, formData: FormData) {
  return runAction(arrangementInput, formToObject(formData), async (db, ctx, input) => {
    await updateArrangement(db, ctx, id.parse(arrangementId), input);
    return { id: arrangementId };
  });
}
