// 記録済みの手配依頼の PDF
import { z } from "zod";
import { getDb } from "@/db";
import { getActor, getRequestInfo } from "@/lib/session";
import { recordAudit } from "@/server/audit";
import { AppError } from "@/server/core";
import { recordedRequestPdf } from "@/server/requests";
import { pdfResponse, textResponse } from "../../../pdf-response";

export async function GET(_req: Request, { params }: RouteContext<"/api/requests/[id]/pdf">) {
  const actor = await getActor();
  if (!actor) return textResponse(401, "ログインしてください");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return textResponse(404, "手配依頼が見つかりません");
  const db = getDb();
  try {
    const { pdf, filename, projectId } = await recordedRequestPdf(db, id);
    await recordAudit(db, {
      userId: actor.id, action: "pdf.request", targetType: "supplier_request", targetId: id, projectId,
      extra: { filename }, request: await getRequestInfo(),
    });
    return pdfResponse(pdf, filename);
  } catch (e) {
    if (e instanceof AppError) return textResponse(404, e.message);
    throw e;
  }
}
