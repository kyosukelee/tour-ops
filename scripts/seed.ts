// デモデータを入れ直す: npm run db:seed
// すべてのテーブルを空にしてから、今日を基準にした架空データを入れる
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { resetAll, seedDemoData } from "../src/db/seed";
import type { Db } from "../src/db/types";
import { todayInTokyo } from "../src/lib/dates";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が設定されていません(.env.local を確認してください)");
  const password = process.env.SEED_DEMO_PASSWORD ?? "tour-ops-demo";

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle({ client: pool, schema }) as unknown as Db;
  const today = todayInTokyo();

  try {
    await resetAll(db);
    const result = await seedDemoData(db, { today, password });
    console.log(`デモデータを入れました(基準日: ${today})`);
    for (const u of result.users) console.log(`  ${u.role === "admin" ? "管理者" : "手配担当"}: ${u.email}`);
    console.log(`  パスワード: ${password}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
