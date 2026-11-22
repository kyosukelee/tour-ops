// 案件の PDF: internal(案件票・社内控え)/ agency(案件票・依頼元向け)/ itinerary(行程表)
import { z } from "zod";
import { getDb } from "@/db";
import { getActor, getRequestInfo } from "@/lib/session";
import { recordAudit } from "@/server/audit";
import { AppError } from "@/server/core";
import { PROJECT_PDF_TYPES } from "@/server/pdf/project-pdf";
import { projectPdf } from "@/server/project-pdfs";
import { pdfResponse, textResponse } from "@/app/api/pdf-response";

export async function GET(_req: Request, { params }: RouteContext<"/api/projects/[id]/pdf/[type]">) {
  const actor = await getActor();
  if (!actor) return textResponse(401, "ログインしてください");
  const { id, type } = await params;
  const parsedType = z.enum(PROJECT_PDF_TYPES).safeParse(type);
  if (!z.uuid().safeParse(id).success || !parsedType.success) return textResponse(404, "見つかりません");
  const db = getDb();
  try {
    const { pdf, filename } = await projectPdf(db, id, parsedType.data);
    await recordAudit(db, {
      userId: actor.id, action: "pdf.project", targetType: "project", targetId: id, projectId: id,
      extra: { filename }, request: await getRequestInfo(),
    });
    return pdfResponse(pdf, filename);
  } catch (e) {
    if (e instanceof AppError) return textResponse(404, e.message);
    throw e;
  }
}
