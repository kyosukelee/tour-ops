// 案件の PDF 3種と、ダッシュボードの手配の注意・今月の粗利
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PROJECT_PDF_TYPES } from "@/server/pdf/project-pdf";
import { projectPdf } from "@/server/project-pdfs";
import { getArrangementAlerts } from "@/server/queries";
import { createTestDb, projectByTitle, TODAY } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});

describe("案件の PDF", () => {
  it.each(PROJECT_PDF_TYPES)("%s を作れる", async (type) => {
    const p = await projectByTitle(t.db, "韓国団体 2泊3日 温泉と街歩き");
    const { pdf, filename } = await projectPdf(t.db, p.id, type);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(filename).toContain(p.code);
    // 見た目の確認用: PDF_OUT=フォルダ を付けて実行すると書き出す
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${type}.pdf`, pdf);
  }, 30_000);
});

describe("手配の注意", () => {
  it("回答期限切れは「依頼中」で期限が今日より前のもの、未手配は受注後の案件のもの", async () => {
    const a = await getArrangementAlerts(t.db, { today: TODAY });
    expect(a.overdueReplies.length).toBeGreaterThan(0);
    expect(a.overdueReplies.every((x) => x.status === "requested" && x.replyDue! < TODAY)).toBe(true);
    expect(a.unarranged.every((x) => x.status === "pending")).toBe(true);
    expect(a.unarranged.map((x) => x.description)).toContain("工芸体験"); // 韓国団体(手配中)
    expect(a.monthStart).toBe("2026-11-01");
    expect(a.monthProjectCount).toBeGreaterThan(0);
  });
});
