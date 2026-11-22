// 添付書類の表示(ログインした担当者だけ。表示したことも操作ログに残す)
import { z } from "zod";
import { textResponse } from "@/app/api/pdf-response";
import { getDb } from "@/db";
import { getActor, getRequestInfo } from "@/lib/session";
import { readAttachment } from "@/server/attachments";
import { AppError } from "@/server/core";
import { createStorage } from "@/server/storage";

export async function GET(_req: Request, { params }: RouteContext<"/api/attachments/[id]">) {
  const actor = await getActor();
  if (!actor) return textResponse(401, "ログインしてください");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return textResponse(404, "添付書類が見つかりません");
  try {
    const { row, body } = await readAttachment(getDb(), { actor, request: await getRequestInfo() }, id, createStorage());
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": row.contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        "Cache-Control": "private, no-store",
        // 保存した種類以外として解釈させない(中身は保存時に PDF・画像だと確かめている)
        "X-Content-Type-Options": "nosniff",
        // 画像は何も実行させない。PDF にこれを付けるとブラウザの PDF 表示が止まるので付けない
        ...(row.contentType.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; sandbox" } : {}),
      },
    });
  } catch (e) {
    if (e instanceof AppError) return textResponse(404, e.message);
    throw e;
  }
}
