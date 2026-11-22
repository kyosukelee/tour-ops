// 画面表示用の読み取り処理(案件一覧・案件詳細・ダッシュボード)
import { beforeAll, describe, expect, it } from "vitest";
import { TERMINAL_STATUSES } from "@/lib/status";
import { getDashboard, getProjectDetail, listProjects } from "@/server/queries";
import { createTestDb, projectByTitle, TODAY } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});

describe("listProjects", () => {
  it("既定では終了した案件(完了・失注・キャンセル)を除く", async () => {
    const rows = await listProjects(t.db);
    expect(rows.length).toBe(9);
    expect(rows.some((r) => TERMINAL_STATUSES.includes(r.status))).toBe(false);
  });

  it("all ですべて、ステータス指定でそのステータスだけを返す", async () => {
    expect((await listProjects(t.db, { status: "all" })).length).toBe(12);
    const lost = await listProjects(t.db, { status: "lost" });
    expect(lost.length).toBe(1);
    expect(lost[0].status).toBe("lost");
  });

  it("キーワードはツアー名と案件番号の部分一致。% などの記号はそのまま文字として探す", async () => {
    const rows = await listProjects(t.db, { status: "all", q: "修学旅行" });
    expect(rows.map((r) => r.title)).toEqual(["高校2年 修学旅行(平和学習コース)"]);
    expect((await listProjects(t.db, { status: "all", q: rows[0].code })).length).toBe(1);
    expect((await listProjects(t.db, { status: "all", q: "%" })).length).toBe(0);
  });

  it("担当者で絞り込み、手配の確定件数を数える", async () => {
    const rows = await listProjects(t.db, { status: "all", ownerId: t.staff.id });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.ownerName === t.staff.name)).toBe(true);
    for (const r of rows) expect(r.confirmedCount).toBeLessThanOrEqual(r.activeCount);
  });
});

describe("getProjectDetail", () => {
  it("手配明細・タスク・履歴と金額のまとめを返す", async () => {
    const p = await projectByTitle(t.db, "韓国団体 2泊3日 温泉と街歩き");
    const d = await getProjectDetail(t.db, p.id);
    expect(d).not.toBeNull();
    expect(d!.agencyName).toBeTruthy();
    expect(d!.arrangements.length).toBeGreaterThan(0);
    expect(d!.history.length).toBeGreaterThan(0);
    expect(d!.totals.sales - d!.totals.cost).toBe(d!.totals.profit);
    // 利用日の順に並ぶ
    const dates = d!.arrangements.map((a) => a.serviceDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it("存在しない案件は null", async () => {
    expect(await getProjectDetail(t.db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("getDashboard", () => {
  it("未完了で期限が7日以内のタスクを、期限切れと今後に分ける", async () => {
    const d = await getDashboard(t.db, { today: TODAY });
    expect(d.overdueTasks.every((x) => x.dueDate < TODAY)).toBe(true);
    expect(d.upcomingTasks.every((x) => x.dueDate >= TODAY)).toBe(true);
    expect(d.overdueTasks.length + d.upcomingTasks.length).toBeGreaterThan(0);
    expect(Object.values(d.statusCounts).reduce((a, b) => a + b, 0)).toBe(12);
    expect(d.openCount).toBe(9);
  });

  it("担当者を指定すると、その人のタスクだけになる", async () => {
    const all = await getDashboard(t.db, { today: TODAY });
    const mine = await getDashboard(t.db, { today: TODAY, userId: t.staff.id });
    const count = (x: typeof all) => x.overdueTasks.length + x.upcomingTasks.length;
    expect(count(mine)).toBeLessThanOrEqual(count(all));
    expect([...mine.overdueTasks, ...mine.upcomingTasks].every((x) => x.assigneeName === t.staff.name)).toBe(true);
  });
});
