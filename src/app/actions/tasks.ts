"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { commentInput, taskDoneInput, taskInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { addComment, createTask, deleteTask, setTaskDone } from "@/server/tasks";

const uuid = z.uuid();

export async function createTaskAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(taskInput, formToObject(formData), async (db, ctx, input) => ({
    id: (await createTask(db, ctx, uuid.parse(projectId), input)).id,
  }));
  if (result.ok) refresh();
  return result;
}

export async function setTaskDoneAction(taskId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(taskDoneInput, formToObject(formData), async (db, ctx, input) => {
    await setTaskDone(db, ctx, uuid.parse(taskId), input.done);
    return { id: taskId };
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteTaskAction(taskId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(z.object({}), formToObject(formData), async (db, ctx) => {
    await deleteTask(db, ctx, uuid.parse(taskId));
    return { id: taskId };
  });
  if (result.ok) refresh();
  return result;
}

export async function addCommentAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(commentInput, formToObject(formData), async (db, ctx, input) => ({
    id: (await addComment(db, ctx, uuid.parse(projectId), input)).id,
  }));
  if (result.ok) refresh();
  return result;
}
