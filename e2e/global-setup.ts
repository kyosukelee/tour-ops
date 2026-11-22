// 画面テストの前に、テスト用データベースを作り直す(マイグレーション → 全削除 → デモデータ)
// 本番のデータベースを消さないよう、E2E_DATABASE_URL が手元(localhost)以外なら止める
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { resetAll, seedDemoData } from "../src/db/seed";
import type { Db } from "../src/db/types";
import { todayInTokyo } from "../src/lib/dates";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error("E2E_DATABASE_URL を設定してください(画面テスト専用のデータベース。中身は毎回作り直します)");
  }
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(host) && process.env.E2E_ALLOW_REMOTE_DB !== "true") {
    throw new Error(
      `E2E_DATABASE_URL の接続先(${host})が手元のデータベースではありません。中身を消してよいテスト専用のデータベースなら E2E_ALLOW_REMOTE_DB=true を付けてください`,
    );
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle({ client: pool, schema }) as unknown as Db;
    await migrate(db as never, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
    await resetAll(db);
    await seedDemoData(db, { today: todayInTokyo(), password: "tour-ops-demo" });
  } finally {
    await pool.end();
  }
}
