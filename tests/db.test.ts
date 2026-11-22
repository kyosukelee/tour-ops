// マイグレーションとデモデータを、メモリ上の PostgreSQL(PGlite)で検証する
// Neon に接続しなくても CI で動く
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import * as s from "@/db/schema";
import { resetAll, seedDemoData, type SeedDb } from "@/db/seed";
import { canConfirmArrangement, isArrangementComplete, type ProjectStatus } from "@/lib/status";

const TODAY = "2026-11-22";
let db: ReturnType<typeof drizzle<typeof s>>;

beforeAll(async () => {
  db = drizzle({ client: new PGlite(), schema: s });
  await migrate(db, { migrationsFolder: "drizzle" });
  await seedDemoData(db as unknown as SeedDb, { today: TODAY, password: "test-password" });
});

describe("マイグレーション", () => {
  it("設計書の12テーブルと認証用3テーブルがある", async () => {
    const res = await db.execute<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    const names = res.rows.map((r) => r.table_name).filter((n) => !n.startsWith("__drizzle"));
    expect(names).toHaveLength(15);
    expect(Object.keys(s.appTables)).toHaveLength(12);
  });
});

describe("デモデータ", () => {
  it("件数", async () => {
    const [[p], [u], [a], [sup]] = await Promise.all([
      db.select({ n: count() }).from(s.projects),
      db.select({ n: count() }).from(s.users),
      db.select({ n: count() }).from(s.agencies),
      db.select({ n: count() }).from(s.suppliers),
    ]);
    expect(p.n).toBe(12);
    expect(u.n).toBe(3);
    expect(a.n).toBe(3);
    expect(sup.n).toBe(13);
  });

  it("全ステータスの案件がそろっている", async () => {
    const rows = await db.select({ status: s.projects.status }).from(s.projects);
    expect(new Set(rows.map((r) => r.status)).size).toBe(10);
  });

  it("業務ルールに沿っている(確定は受注後だけ、手配完了は全手配が確定)", async () => {
    const projects = await db.select().from(s.projects);
    for (const p of projects) {
      const arrs = await db.select().from(s.arrangements).where(eq(s.arrangements.projectId, p.id));
      const status = p.status as ProjectStatus;
      if (!canConfirmArrangement(status) && !["completed", "cancelled"].includes(status)) {
        expect(arrs.some((x) => x.status === "confirmed"), p.title).toBe(false);
      }
      if (status === "arranged") expect(isArrangementComplete(arrs), p.title).toBe(true);
      if (status === "arranging") expect(isArrangementComplete(arrs), p.title).toBe(false);
    }
  });

  it("手配依頼は手配明細と結び付いている", async () => {
    const [[reqs], [items]] = await Promise.all([
      db.select({ n: count() }).from(s.supplierRequests),
      db.select({ n: count() }).from(s.requestItems),
    ]);
    expect(reqs.n).toBeGreaterThan(0);
    expect(items.n).toBeGreaterThanOrEqual(reqs.n);
  });

  it("期限切れの回答待ちが少なくとも1件ある(ダッシュボードで見せるため)", async () => {
    const overdue = await db.select().from(s.tasks).where(eq(s.tasks.done, false));
    expect(overdue.some((t) => t.dueDate < TODAY)).toBe(true);
  });

  it("デモ用アカウントのパスワードが検証できる", async () => {
    const [acc] = await db.select().from(s.accounts).limit(1);
    expect(await verifyPassword({ hash: acc.password!, password: "test-password" })).toBe(true);
  });

  it("入れ直し(毎朝の初期化)ができる", async () => {
    await resetAll(db as unknown as SeedDb);
    const [[p]] = await Promise.all([db.select({ n: count() }).from(s.projects)]);
    expect(p.n).toBe(0);
    await seedDemoData(db as unknown as SeedDb, { today: TODAY, password: "test-password" });
    const [[p2]] = await Promise.all([db.select({ n: count() }).from(s.projects)]);
    expect(p2.n).toBe(12);
  });
});
