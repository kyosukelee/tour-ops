"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { attachmentInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { deleteAttachment, uploadAttachment } from "@/server/attachments";
import { createStorage } from "@/server/storage";

const uuid = z.uuid();

export async function uploadAttachmentAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(attachmentInput, formToObject(formData), async (db, ctx, input) => ({
    id: (await uploadAttachment(db, ctx, uuid.parse(projectId), input, createStorage())).id,
  }));
  if (result.ok) refresh();
  return result;
}

export async function deleteAttachmentAction(attachmentId: string, _prev: ActionResult, formData: FormData) {
  void formData;
  const result = await runAction(z.object({}), {}, async (db, ctx) => {
    await deleteAttachment(db, ctx, uuid.parse(attachmentId), createStorage());
    return { id: attachmentId };
  });
  if (result.ok) refresh();
  return result;
}
