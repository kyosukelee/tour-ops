// テスト用: メモリ上の PostgreSQL(PGlite)にマイグレーションとデモデータを入れる
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as s from "@/db/schema";
import { seedDemoData } from "@/db/seed";
import type { Db } from "@/db/types";
import type { Ctx } from "@/server/core";

export const TODAY = "2026-11-22";

export async function createTestDb() {
  const pg = drizzle({ client: new PGlite(), schema: s });
  await migrate(pg, { migrationsFolder: "drizzle" });
  const db = pg as unknown as Db;
  await seedDemoData(db, { today: TODAY, password: "test-password" });

  const [admin] = await db.select().from(s.users).where(eq(s.users.email, "admin@tour-ops.example"));
  const [staff] = await db.select().from(s.users).where(eq(s.users.email, "staff1@tour-ops.example"));
  const adminCtx: Ctx & { today: string } = {
    actor: { id: admin.id, name: admin.name, role: "admin" },
    request: { ipAddress: "127.0.0.1", userAgent: "vitest" },
    today: TODAY,
  };
  const staffCtx: Ctx & { today: string } = {
    actor: { id: staff.id, name: staff.name, role: "staff" },
    today: TODAY,
  };
  return { db, admin, staff, adminCtx, staffCtx };
}

export async function projectByTitle(db: Db, title: string) {
  const [p] = await db.select().from(s.projects).where(eq(s.projects.title, title));
  return p;
}
