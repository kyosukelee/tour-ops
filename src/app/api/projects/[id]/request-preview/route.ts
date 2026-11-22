// 送る前の確認用 PDF(記録はしない)。手配依頼の作成モーダルの「PDFを確認」から開く
import { z } from "zod";
import { getDb } from "@/db";
import { getActor } from "@/lib/session";
import { requestInput } from "@/lib/validation";
import { AppError } from "@/server/core";
import { previewRequestPdf } from "@/server/requests";
import { pdfResponse, textResponse } from "@/app/api/pdf-response";

export async function GET(req: Request, { params }: RouteContext<"/api/projects/[id]/request-preview">) {
  const actor = await getActor();
  if (!actor) return textResponse(401, "ログインしてください");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return textResponse(404, "案件が見つかりません");

  const q = new URL(req.url).searchParams;
  const parsed = requestInput.safeParse({
    supplierId: q.get("supplier"),
    kind: q.get("kind"),
    method: "fax", // 確認用なので送り方は関係ない
    arrangementIds: q.getAll("a"),
    note: q.get("note") ?? "",
  });
  if (!parsed.success) return textResponse(400, "仕入先・依頼の種類・手配を選んでから開いてください");
  try {
    const { pdf, filename } = await previewRequestPdf(getDb(), { actor }, id, parsed.data);
    return pdfResponse(pdf, filename);
  } catch (e) {
    if (e instanceof AppError) return textResponse(400, e.message);
    throw e;
  }
}
