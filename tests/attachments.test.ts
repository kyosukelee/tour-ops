// 添付書類: 種類の判定、保存・表示・削除、保管場所(手元のフォルダ・R2)、毎朝のデモ作り直しでの削除
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { attachmentInput } from "@/lib/validation";
import { deleteAttachment, detectFileType, readAttachment, uploadAttachment } from "@/server/attachments";
import { AppError } from "@/server/core";
import { runDailyJob } from "@/server/daily";
import { listAttachments } from "@/server/queries";
import { createLocalStorage, createR2Storage, type FileStorage } from "@/server/storage";
import { createTestDb, projectByTitle, TODAY } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
let storage: FileStorage;
let root: string;
beforeAll(async () => {
  t = await createTestDb();
  root = await mkdtemp(path.join(tmpdir(), "tour-ops-"));
  storage = createLocalStorage(root);
});

const PDF = new TextEncoder().encode("%PDF-1.4\n% test\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const fileOf = (bytes: Uint8Array, name: string, type = "application/octet-stream") => new File([bytes as BlobPart], name, { type });

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
}

describe("ファイルの種類", () => {
  it("中身の先頭で判断する(拡張子や送られてきた種類は見ない)", () => {
    expect(detectFileType(PDF)?.contentType).toBe("application/pdf");
    expect(detectFileType(PNG)?.ext).toBe("png");
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(detectFileType(new TextEncoder().encode("<html><script>"))).toBeNull();
  });

  it("空のファイルと4MBを超えるファイルは入力チェックで止める", () => {
    expect(attachmentInput.safeParse({ kind: "request", file: fileOf(new Uint8Array(), "a.pdf") }).success).toBe(false);
    const big = fileOf(new Uint8Array(4 * 1024 * 1024 + 1), "big.pdf");
    expect(attachmentInput.safeParse({ kind: "request", file: big }).success).toBe(false);
  });
});

describe("添付書類の保存・表示・削除", () => {
  it("PDFを保存し、一覧に出て、開くと同じ中身が返り、削除するとファイルも消える", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    const input = attachmentInput.parse({ kind: "change_request", receivedAt: TODAY, note: "人数変更", file: fileOf(PDF, "変更依頼.pdf", "application/pdf"), requestId: "" });
    const created = await uploadAttachment(t.db, t.staffCtx, p.id, input, storage);
    expect(created).toMatchObject({ fileName: "変更依頼.pdf", contentType: "application/pdf", sizeBytes: PDF.length });
    expect(created.filePath).toBe(`projects/${p.id}/${created.id}.pdf`);

    const list = await listAttachments(t.db, p.id);
    expect(list[0]).toMatchObject({ id: created.id, uploaderName: t.staff.name });

    const { body } = await readAttachment(t.db, t.staffCtx, created.id, storage);
    expect(new TextDecoder().decode(body)).toBe(new TextDecoder().decode(PDF));
    const [viewLog] = await t.db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "attachment.view")).orderBy(desc(s.auditLogs.createdAt)).limit(1);
    expect(viewLog.targetId).toBe(created.id);

    await deleteAttachment(t.db, t.staffCtx, created.id, storage);
    expect(await listAttachments(t.db, p.id)).toHaveLength(0);
    expect(await storage.get(created.filePath)).toBeNull();
  });

  it("PDF・画像以外は保存しない(ファイル名が .pdf でも中身で判断)", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    const input = attachmentInput.parse({ kind: "other", file: fileOf(new TextEncoder().encode("<html>"), "fake.pdf", "application/pdf") });
    await expectAppError(uploadAttachment(t.db, t.staffCtx, p.id, input, storage), "INVALID");
  });

  it("ほかの案件の手配依頼にはひも付けられない", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    const other = await projectByTitle(t.db, "韓国団体 2泊3日 温泉と街歩き");
    const [req] = await t.db.select().from(s.supplierRequests).where(eq(s.supplierRequests.projectId, other.id)).limit(1);
    const input = attachmentInput.parse({ kind: "supplier_reply", requestId: req.id, file: fileOf(PNG, "reply.png") });
    await expectAppError(uploadAttachment(t.db, t.staffCtx, p.id, input, storage), "INVALID");
  });

  it("手元のフォルダの保管場所は、キーに .. があってもフォルダの外に出ない", async () => {
    await expect(storage.put("../escape.txt", PDF, "text/plain")).rejects.toThrow();
  });

  it("毎朝のデモ作り直しで、添付ファイルもまとめて消す", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習");
    await uploadAttachment(t.db, t.staffCtx, p.id, attachmentInput.parse({ kind: "request", file: fileOf(PNG, "fax.png") }), storage);
    expect(await readdir(path.join(root, "projects"))).not.toHaveLength(0);
    const mailer = { send: async (m: { to: string }) => ({ id: null, deliveredTo: m.to, redirected: false, transport: "log" as const }) };
    await runDailyJob(t.db, { today: "2026-11-23", mailer, appUrl: "", demoReset: { password: "test-password", storage } });
    await expect(readdir(path.join(root, "projects"))).rejects.toThrow();
    expect(await t.db.select().from(s.attachments)).toHaveLength(0);
  });
});

describe("R2(S3 互換 API)", () => {
  it("署名付きの PUT・GET・DELETE と、一覧からの一括削除を正しい URL に送る", async () => {
    const calls: { method: string; url: string; auth: string | null }[] = [];
    const fakeFetch = (async (req: Request) => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.get("authorization") });
      if (req.method === "GET" && req.url.includes("list-type=2")) {
        return new Response("<ListBucketResult><Contents><Key>projects/a/1.pdf</Key></Contents><Contents><Key>projects/b/2.png</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>");
      }
      if (req.method === "GET") return new Response(PDF);
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const r2 = createR2Storage({ accountId: "acc", accessKeyId: "key", secretAccessKey: "secret", bucket: "tour-ops" }, fakeFetch);

    await r2.put("projects/p1/x.pdf", PDF, "application/pdf");
    expect(calls[0]).toMatchObject({ method: "PUT", url: "https://acc.r2.cloudflarestorage.com/tour-ops/projects/p1/x.pdf" });
    expect(calls[0].auth).toMatch(/^AWS4-HMAC-SHA256 Credential=key\//);
    expect((await r2.get("projects/p1/x.pdf"))?.length).toBe(PDF.length);
    expect(await r2.deletePrefix("projects/")).toBe(2);
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([
      "https://acc.r2.cloudflarestorage.com/tour-ops/projects/a/1.pdf",
      "https://acc.r2.cloudflarestorage.com/tour-ops/projects/b/2.png",
    ]);
  });
});
