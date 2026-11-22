// 添付書類(FAXで届いた依頼書・変更依頼、仕入先の回答など)の登録・表示・削除
// ファイルは保管場所(R2 または手元のフォルダ)に置き、DB には場所と情報だけを持つ
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { ATTACHMENT_KIND_LABEL } from "@/lib/status";
import type { AttachmentInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";
import { getProjectOrThrow } from "./projects";
import type { FileStorage } from "./storage";

// 中身の先頭のバイトで種類を判断する(ブラウザが送ってくる種類やファイル名は信用しない)
export function detectFileType(b: Uint8Array): { contentType: string; ext: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 5) === "%PDF-") return { contentType: "application/pdf", ext: "pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return { contentType: "image/png", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { contentType: "image/webp", ext: "webp" };
  return null;
}

// 保管場所のキー。毎朝のデモの作り直しでは "projects/" の下をまとめて消す
export const ATTACHMENT_PREFIX = "projects/";

export async function uploadAttachment(db: Db, ctx: Ctx, projectId: string, input: AttachmentInput, storage: FileStorage) {
  assertCan(ctx.actor, "projects.write");
  await getProjectOrThrow(db, projectId);
  if (input.requestId) {
    const [req] = await db
      .select({ id: s.supplierRequests.id })
      .from(s.supplierRequests)
      .where(and(eq(s.supplierRequests.id, input.requestId), eq(s.supplierRequests.projectId, projectId)))
      .limit(1);
    if (!req) throw new AppError("INVALID", "選んだ手配依頼はこの案件のものではありません");
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const type = detectFileType(bytes);
  if (!type) {
    throw new AppError("INVALID", "PDF・JPEG・PNG・WebP のファイルだけ添付できます", { file: ["PDFか写真(JPEG・PNG・WebP)を選んでください"] });
  }

  const id = randomUUID();
  const key = `${ATTACHMENT_PREFIX}${projectId}/${id}.${type.ext}`;
  const fileName = (input.file.name || `添付.${type.ext}`).slice(0, 200);
  await storage.put(key, bytes, type.contentType);

  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(s.attachments)
        .values({
          id,
          projectId,
          requestId: input.requestId,
          kind: input.kind,
          filePath: key,
          fileName,
          contentType: type.contentType,
          sizeBytes: bytes.length,
          receivedAt: input.receivedAt ? new Date(`${input.receivedAt}T00:00:00+09:00`) : null,
          note: input.note,
          uploadedBy: ctx.actor.id,
        })
        .returning();
      await recordAudit(tx, {
        userId: ctx.actor.id, action: "attachment.create", targetType: "attachment", targetId: id, projectId,
        extra: { fileName, kind: ATTACHMENT_KIND_LABEL[input.kind], sizeBytes: bytes.length },
        request: ctx.request,
      });
      return created;
    });
  } catch (e) {
    // 記録できなかったら、置いたファイルも消す
    await storage.delete(key).catch(() => undefined);
    throw e;
  }
}

export async function readAttachment(db: Db, ctx: Ctx, id: string, storage: FileStorage) {
  const [row] = await db.select().from(s.attachments).where(eq(s.attachments.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "添付書類が見つかりません");
  const body = await storage.get(row.filePath);
  if (!body) throw new AppError("NOT_FOUND", "ファイルが見つかりません(保管場所から消えています)");
  await recordAudit(db, {
    userId: ctx.actor.id, action: "attachment.view", targetType: "attachment", targetId: id, projectId: row.projectId,
    extra: { fileName: row.fileName }, request: ctx.request,
  });
  return { row, body };
}

export async function deleteAttachment(db: Db, ctx: Ctx, id: string, storage: FileStorage) {
  assertCan(ctx.actor, "projects.write");
  const row = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.attachments).where(eq(s.attachments.id, id)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "添付書類が見つかりません");
    await tx.delete(s.attachments).where(eq(s.attachments.id, id));
    await recordAudit(tx, {
      userId: ctx.actor.id, action: "attachment.delete", targetType: "attachment", targetId: id, projectId: before.projectId,
      extra: { fileName: before.fileName, kind: ATTACHMENT_KIND_LABEL[before.kind] }, request: ctx.request,
    });
    return before;
  });
  // 記録を消したあとにファイルを消す(失敗してもログに残すだけ)
  await storage.delete(row.filePath).catch((e) =>
    console.error(JSON.stringify({ level: "error", msg: "attachment file delete failed", key: row.filePath, error: String(e) })),
  );
}
