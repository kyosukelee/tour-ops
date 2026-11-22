"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { replyInput, requestInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { createMailer } from "@/server/mailer";
import { recordReply, sendRequest } from "@/server/requests";

const uuid = z.uuid();

export async function sendRequestAction(projectId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(requestInput, formToObject(formData), async (db, ctx, input) => {
    const r = await sendRequest(db, ctx, uuid.parse(projectId), input, { mailer: createMailer() });
    return {
      id: r.requestId,
      requestNo: r.requestNo,
      method: input.method,
      mailTo: r.mail?.deliveredTo ?? null,
      mailRedirected: r.mail?.redirected ?? false,
      mailLogged: r.mail?.transport === "log",
    };
  });
  if (result.ok) refresh();
  return result;
}

// フォームの「result:<手配ID>」「confirmationNo:<手配ID>」「unitCost:<手配ID>」を手配ごとにまとめる
function replyFromForm(formData: FormData) {
  const ids = formData.getAll("arrangementId").map(String);
  return {
    items: ids.map((id) => ({
      arrangementId: id,
      result: formData.get(`result:${id}`),
      confirmationNo: formData.get(`confirmationNo:${id}`),
      unitCost: formData.get(`unitCost:${id}`),
    })),
  };
}

export async function recordReplyAction(requestId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(replyInput, replyFromForm(formData), async (db, ctx, input) => ({
    id: requestId,
    ...(await recordReply(db, ctx, uuid.parse(requestId), input)),
  }));
  if (result.ok) refresh();
  return result;
}
