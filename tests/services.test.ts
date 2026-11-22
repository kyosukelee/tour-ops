// 業務処理(サーバー側)のテスト。PGlite 上で実際にSQLを流して確かめる
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { arrangementInput, projectInput } from "@/lib/validation";
import { createArrangement, updateArrangement } from "@/server/arrangements";
import { AppError } from "@/server/core";
import { changeProjectStatus, createProject } from "@/server/projects";
import { createUser, resetPassword, updateUser } from "@/server/users";
import { createTestDb, projectByTitle } from "./helpers";

type T = Awaited<ReturnType<typeof createTestDb>>;
let t: T;

beforeAll(async () => {
  t = await createTestDb();
});

const latestAudit = async (action: string) => {
  const [row] = await t.db.select().from(s.auditLogs).where(eq(s.auditLogs.action, action)).orderBy(desc(s.auditLogs.createdAt)).limit(1);
  return row;
};

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(code));
}

function arrInput(overrides: Record<string, unknown> = {}) {
  return arrangementInput.parse({
    category: "meal", serviceDate: "2026-12-01", description: "夕食", quantity: "10",
    unitCost: "3000", unitPrice: "3600", status: "pending", ...overrides,
  });
}

describe("案件", () => {
  it("登録すると番号が採番され、引合から始まり、履歴と操作ログが残る", async () => {
    const [agency] = await t.db.select().from(s.agencies).limit(1);
    const input = projectInput.parse({
      title: "テスト案件", agencyId: agency.id, startDate: "2027-01-10", endDate: "2027-01-11",
      paxAdult: "20", paxChild: "0", language: "日本語",
    });
    const p = await createProject(t.db, t.staffCtx, input);
    expect(p.code).toBe("T-2026-0013");
    expect(p.status).toBe("inquiry");
    expect(p.ownerUserId).toBe(t.staff.id);

    const history = await t.db.select().from(s.statusHistory).where(eq(s.statusHistory.projectId, p.id));
    expect(history.map((h) => h.toStatus)).toEqual(["inquiry"]);
    const log = await latestAudit("project.create");
    expect(log.targetId).toBe(p.id);
    expect(log.userId).toBe(t.staff.id);
  });

  it("許可されていない遷移は拒否し、許可された遷移は履歴に残す", async () => {
    const p = await projectByTitle(t.db, "社員旅行 1泊2日"); // 引合
    await expectAppError(changeProjectStatus(t.db, t.staffCtx, p.id, "arranging"), "INVALID");
    const after = await changeProjectStatus(t.db, t.staffCtx, p.id, "quoting");
    expect(after.status).toBe("quoting");
    const log = await latestAudit("project.status_change");
    expect(log.changes).toMatchObject({ before: { status: "inquiry" }, after: { status: "quoting" } });
  });

  it("帰着日が出発日より前なら入力チェックで止める", () => {
    const r = projectInput.safeParse({
      title: "x", agencyId: "00000000-0000-4000-8000-000000000000", startDate: "2027-01-10", endDate: "2027-01-09",
      paxAdult: 1, paxChild: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("手配明細", () => {
  it("受注前の案件では「確定」にできない", async () => {
    const p = await projectByTitle(t.db, "海外団体 3日間 歴史と食のツアー"); // 見積提出
    await expectAppError(createArrangement(t.db, t.staffCtx, p.id, arrInput({ status: "confirmed" })), "INVALID");
  });

  it("全手配が確定すると手配完了に進み、未確定が出ると手配中に戻る", async () => {
    const p = await projectByTitle(t.db, "中学校 校外学習"); // 手配中
    const arrs = await t.db.select().from(s.arrangements).where(eq(s.arrangements.projectId, p.id));
    for (const a of arrs.filter((x) => x.status !== "confirmed")) {
      await updateArrangement(t.db, t.staffCtx, a.id, arrangementInput.parse({ ...a, status: "confirmed" }));
    }
    expect((await projectByTitle(t.db, "中学校 校外学習")).status).toBe("arranged");

    await createArrangement(t.db, t.staffCtx, p.id, arrInput({ status: "pending" }));
    expect((await projectByTitle(t.db, "中学校 校外学習")).status).toBe("arranging");

    const autoLog = await latestAudit("project.status_auto");
    expect(autoLog.projectId).toBe(p.id);
  });

  it("回答期限のタスクを自動で作り、日付の変更に追従し、確定で完了にする", async () => {
    const p = await projectByTitle(t.db, "韓国団体 2泊3日 温泉と街歩き");
    const a = await createArrangement(t.db, t.staffCtx, p.id, arrInput({ replyDue: "2026-11-25", cancelFeeFrom: "2026-11-28" }));
    const taskOf = async (type: "reply_due" | "cancel_fee") =>
      (await t.db.select().from(s.tasks).where(and(eq(s.tasks.arrangementId, a.id), eq(s.tasks.autoType, type))))[0];

    expect((await taskOf("reply_due")).dueDate).toBe("2026-11-25");
    expect((await taskOf("cancel_fee")).done).toBe(false);

    await updateArrangement(t.db, t.staffCtx, a.id, arrInput({ replyDue: "2026-11-26", cancelFeeFrom: "2026-11-28" }));
    expect((await taskOf("reply_due")).dueDate).toBe("2026-11-26");

    await updateArrangement(t.db, t.staffCtx, a.id, arrInput({ status: "confirmed", replyDue: "2026-11-26", cancelFeeFrom: "2026-11-28" }));
    expect((await taskOf("reply_due")).done).toBe(true);

    await updateArrangement(t.db, t.staffCtx, a.id, arrInput({ status: "confirmed", cancelFeeFrom: "2026-11-28" }));
    expect(await taskOf("reply_due")).toBeUndefined();
  });

  it("キャンセルした案件では手配を追加できず、取消料の記録だけできる", async () => {
    const p = await projectByTitle(t.db, "インセンティブ旅行 2泊3日");
    await expectAppError(createArrangement(t.db, t.staffCtx, p.id, arrInput()), "INVALID");

    const [a] = await t.db.select().from(s.arrangements).where(eq(s.arrangements.projectId, p.id)).limit(1);
    await expectAppError(
      updateArrangement(t.db, t.staffCtx, a.id, arrangementInput.parse({ ...a, status: "confirmed" })),
      "INVALID",
    );
    const updated = await updateArrangement(t.db, t.staffCtx, a.id, arrangementInput.parse({ ...a, cancelFee: "50000" }));
    expect(updated.cancelFee).toBe(50000);
  });

  it("操作ログには変わった項目だけが残る", async () => {
    const p = await projectByTitle(t.db, "親子体験ツアー 2泊3日");
    const [a] = await t.db.select().from(s.arrangements).where(eq(s.arrangements.projectId, p.id)).limit(1);
    await updateArrangement(t.db, t.staffCtx, a.id, arrangementInput.parse({ ...a, note: "雨天時は屋内プログラム" }));
    const log = await latestAudit("arrangement.update");
    expect(log.changes).toEqual({ before: { note: null }, after: { note: "雨天時は屋内プログラム" } });
  });
});

describe("担当者管理", () => {
  it("手配担当は担当者を登録できない", async () => {
    await expectAppError(
      createUser(t.db, t.staffCtx, { name: "新人", email: "new@tour-ops.example", role: "staff", password: "password-1234" }),
      "FORBIDDEN",
    );
  });

  it("管理者は登録でき、同じメールアドレスは重複させない", async () => {
    const u = await createUser(t.db, t.adminCtx, { name: "新人 太郎", email: "New@Tour-ops.example", role: "staff", password: "password-1234" });
    expect(u.email).toBe("new@tour-ops.example");
    await expectAppError(
      createUser(t.db, t.adminCtx, { name: "重複", email: "new@tour-ops.example", role: "staff", password: "password-1234" }),
      "CONFLICT",
    );
  });

  it("自分自身は利用停止にできない", async () => {
    await expectAppError(updateUser(t.db, t.adminCtx, t.admin.id, { name: t.admin.name, role: "admin", active: false }), "INVALID");
  });

  it("利用停止にするとセッションを消す", async () => {
    await t.db.insert(s.sessions).values({ id: "sess-1", token: "tok-1", userId: t.staff.id, expiresAt: new Date(Date.now() + 86_400_000) });
    await updateUser(t.db, t.adminCtx, t.staff.id, { name: t.staff.name, role: "staff", active: false });
    const rest = await t.db.select().from(s.sessions).where(eq(s.sessions.userId, t.staff.id));
    expect(rest).toHaveLength(0);
  });

  it("パスワードの再設定は操作ログに残るが、パスワードそのものは残さない", async () => {
    await resetPassword(t.db, t.adminCtx, t.staff.id, "new-password-5678");
    const log = await latestAudit("user.password_reset");
    expect(JSON.stringify(log)).not.toContain("new-password-5678");
    expect(log.ipAddress).toBe("127.0.0.1");
  });
});
