// 案件の PDF(案件票・行程表)を作る
import type { Db } from "@/db/types";
import { AppError } from "./core";
import { projectPdfFilename, renderProjectPdf, type ProjectPdfType } from "./pdf/project-pdf";
import { getProjectDetail } from "./queries";

export async function projectPdf(db: Db, projectId: string, type: ProjectPdfType, now = new Date()) {
  const p = await getProjectDetail(db, projectId);
  if (!p) throw new AppError("NOT_FOUND", "案件が見つかりません");
  const pdf = await renderProjectPdf(type, {
    issuedAt: now,
    project: {
      code: p.code,
      title: p.title,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      paxAdult: p.paxAdult,
      paxChild: p.paxChild,
      language: p.language,
      note: p.note,
      ownerName: p.ownerName,
      agencyName: p.agencyName,
      agencyContact: p.agencyContact,
      agencyFax: p.agencyFax,
      agencyEmail: p.agencyEmail,
    },
    arrangements: p.arrangements,
    tasks: p.tasks.filter((t) => !t.done),
    totals: p.totals,
  });
  return { pdf, filename: projectPdfFilename(type, p.code) };
}
