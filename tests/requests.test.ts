// 手配依頼の送付(メール・FAX)、PDF、仕入先からの回答
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { requestInput, replyInput } from "@/lib/validation";
import { formToObject } from "@/lib/form";
import { AppError } from "@/server/core";
import { applyDemoRedirect, type Mailer, type MailMessage } from "@/server/mailer";
import { listRequests } from "@/server/queries";
import { previewRequestPdf, recordedRequestPdf, recordReply, sendRequest } from "@/server/requests";
import { createTestDb, projectByTitle } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});

function fakeMailer(opts: { fail?: boolean } = {}) {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(m) {
      if (opts.fail) throw new Error("SMTP down");
      sent.push(m);
      return { id: "test", deliveredTo: m.to, redirected: false, transport: "log" };
    },
  };
  return { mailer, sent };
}

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
}

async function arrangementOf(projectTitle: string, description: string) {
  const p = await projectByTitle(t.db, projectTitle);
  const [a] = await t.db.select().from(s.arrangements).where(and(eq(s.arrangements.projectId, p.id), eq(s.arrangements.description, description)));
  return { project: p, arrangement: a };
}

describe("手配依頼の送付", () => {
  it("メールで送ると PDF を添付して送り、記録して手配を「依頼中」にする", async () => {
    const { project, arrangement } = await arrangementOf("韓国団体 2泊3日 温泉と街歩き", "工芸体験");
    expect(arrangement.status).toBe("pending");
    const { mailer, sent } = fakeMailer();
    const input = requestInput.parse({
      supplierId: arrangement.supplierId, kind: "booking", method: "email", arrangementIds: arrangement.id, note: "体験の材料費込みでお願いします",
    });
    const result = await sendRequest(t.db, t.staffCtx, project.id, input, { mailer });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("reserve@akane-kobo.example");
    expect(sent[0].subject).toContain("手配依頼書");
    expect(sent[0].attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.requestNo).toMatch(new RegExp(`^${project.code}-R\\d+$`));

    const [after] = await t.db.select().from(s.arrangements).where(eq(s.arrangements.id, arrangement.id));
    expect(after.status).toBe("requested");
    const [log] = await t.db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "request.send")).orderBy(desc(s.auditLogs.createdAt)).limit(1);
    expect(log.changes).toMatchObject({ supplier: "体験工房 あかね", method: "メール", requestNo: result.requestNo });

    const list = await listRequests(t.db, project.id);
    expect(list[0]).toMatchObject({ id: result.requestId, requestNo: result.requestNo, note: "体験の材料費込みでお願いします" });
    expect(list[0].items.map((i) => i.description)).toEqual(["工芸体験"]);
  });

  it("FAX は送らずに記録だけする。メールが未登録の仕入先にメールでは送れない", async () => {
    const { project, arrangement } = await arrangementOf("中学校 校外学習", "団体入館 解説付き"); // みどり歴史資料館(FAXのみ)
    const { mailer, sent } = fakeMailer();
    const base = { supplierId: arrangement.supplierId!, kind: "change" as const, arrangementIds: [arrangement.id], note: null };
    await expectAppError(sendRequest(t.db, t.staffCtx, project.id, { ...base, method: "email" }, { mailer }), "INVALID");
    await sendRequest(t.db, t.staffCtx, project.id, { ...base, method: "fax" }, { mailer });
    expect(sent).toHaveLength(0);
  });

  it("メールが送れなかったときは何も記録しない", async () => {
    const { project, arrangement } = await arrangementOf("韓国団体 2泊3日 温泉と街歩き", "昼食 ランチコース");
    const before = (await listRequests(t.db, project.id)).length;
    const { mailer } = fakeMailer({ fail: true });
    const input = { supplierId: arrangement.supplierId!, kind: "change" as const, method: "email" as const, arrangementIds: [arrangement.id], note: null };
    await expect(sendRequest(t.db, t.staffCtx, project.id, input, { mailer })).rejects.toThrow("SMTP down");
    expect((await listRequests(t.db, project.id)).length).toBe(before);
  });

  it("受注前の案件には「手配」を送れない(照会だけ)。別の仕入先の手配は混ぜられない", async () => {
    const p = await projectByTitle(t.db, "海外団体 3日間 歴史と食のツアー"); // 見積提出
    const arrs = await t.db.select().from(s.arrangements).where(eq(s.arrangements.projectId, p.id));
    const a = arrs[0];
    const { mailer } = fakeMailer();
    await expectAppError(sendRequest(t.db, t.staffCtx, p.id, { supplierId: a.supplierId!, kind: "booking", method: "fax", arrangementIds: [a.id], note: null }, { mailer }), "INVALID");
    const other = arrs.find((x) => x.supplierId !== a.supplierId)!;
    await expectAppError(
      sendRequest(t.db, t.staffCtx, p.id, { supplierId: a.supplierId!, kind: "inquiry", method: "fax", arrangementIds: [a.id, other.id], note: null }, { mailer }),
      "INVALID",
    );
  });

  it("取消依頼を送ると手配は「取消」になる", async () => {
    const { project, arrangement } = await arrangementOf("韓国団体 2泊3日 温泉と街歩き", "観光タクシー オプショナル 2台 4時間");
    const { mailer } = fakeMailer();
    await sendRequest(t.db, t.staffCtx, project.id, { supplierId: arrangement.supplierId!, kind: "cancel", method: "email", arrangementIds: [arrangement.id], note: "参加者が集まらず中止" }, { mailer });
    const [after] = await t.db.select().from(s.arrangements).where(eq(s.arrangements.id, arrangement.id));
    expect(after.status).toBe("cancelled");
  });

  it("確認用と記録済みの PDF を作れる", async () => {
    const { project, arrangement } = await arrangementOf("中学校 校外学習", "昼食 弁当");
    const preview = await previewRequestPdf(t.db, t.staffCtx, project.id, { supplierId: arrangement.supplierId!, kind: "change", arrangementIds: [arrangement.id], note: null });
    expect(preview.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(preview.filename).toContain("確認用");
    const [req] = await listRequests(t.db, project.id);
    const recorded = await recordedRequestPdf(t.db, req.id);
    expect(recorded.filename).toContain(req.requestNo);
  }, 30_000);
});

describe("仕入先からの回答", () => {
  it("確定と確定番号を入れると手配が確定し、全手配が確定すれば案件は手配完了になる", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    const reqs = await listRequests(t.db, p.id);
    for (const r of reqs.filter((x) => x.kind !== "cancel")) {
      const items = r.items.filter((i) => i.status !== "confirmed" && i.status !== "cancelled");
      if (items.length === 0) continue;
      await recordReply(t.db, t.staffCtx, r.id, replyInput.parse({
        items: items.map((i) => ({ arrangementId: i.id, result: "confirmed", confirmationNo: `OK-${i.description.length}`, unitCost: "" })),
      }));
    }
    const [after] = await t.db.select().from(s.projects).where(eq(s.projects.id, p.id));
    expect(after.status).toBe("arranged");
    const [bento] = await t.db.select().from(s.arrangements).where(and(eq(s.arrangements.projectId, p.id), eq(s.arrangements.description, "昼食 弁当")));
    expect(bento).toMatchObject({ status: "confirmed", confirmationNo: "OK-5", unitCost: 1000 });
  });

  it("手配不可は「未手配」に戻し、原価の回答は原価に入る", async () => {
    const p = await projectByTitle(t.db, "高校2年 修学旅行(平和学習コース)"); // 見積中: 照会の回答
    const reqs = await listRequests(t.db, p.id);
    const r = reqs.find((x) => x.items.length >= 1 && x.kind === "inquiry")!;
    const [first, ...rest] = r.items;
    await recordReply(t.db, t.staffCtx, r.id, {
      items: [
        { arrangementId: first.id, result: "declined", confirmationNo: null, unitCost: null },
        ...rest.map((i) => ({ arrangementId: i.id, result: "tentative" as const, confirmationNo: null, unitCost: 12345 })),
      ],
    });
    const [a] = await t.db.select().from(s.arrangements).where(eq(s.arrangements.id, first.id));
    expect(a.status).toBe("pending");
    // 受注前は「確定」にできない
    await expectAppError(recordReply(t.db, t.staffCtx, r.id, { items: [{ arrangementId: first.id, result: "confirmed", confirmationNo: null, unitCost: null }] }), "INVALID");
  });
});

describe("部品", () => {
  it("デモ用の宛先差し替えは本来の宛先を本文と件名に残す", () => {
    const m = applyDemoRedirect({ to: "hotel@example.com", subject: "手配依頼書", text: "本文" }, "me@example.com");
    expect(m).toMatchObject({ to: "me@example.com", subject: "[デモ] 手配依頼書", redirected: true });
    expect(m.text).toContain("hotel@example.com");
    expect(applyDemoRedirect({ to: "a@example.com", subject: "x", text: "y" }, undefined).to).toBe("a@example.com");
  });

  it("複数選択のチェックボックスは配列、1件だけなら文字列で届き、どちらも配列にそろえる", () => {
    const fd = new FormData();
    fd.append("arrangementIds", "00000000-0000-4000-8000-000000000001");
    fd.append("arrangementIds", "00000000-0000-4000-8000-000000000002");
    fd.append("supplierId", "00000000-0000-4000-8000-000000000003");
    fd.append("kind", "booking");
    fd.append("method", "fax");
    expect(requestInput.parse(formToObject(fd)).arrangementIds).toHaveLength(2);
    const one = requestInput.safeParse({ supplierId: "00000000-0000-4000-8000-000000000003", kind: "booking", method: "fax", arrangementIds: "00000000-0000-4000-8000-000000000001" });
    expect(one.success && one.data.arrangementIds).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(requestInput.safeParse({ supplierId: "00000000-0000-4000-8000-000000000003", kind: "booking", method: "fax" }).success).toBe(false);
  });
});
