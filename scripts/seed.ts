// デモデータを入れ直す: npm run db:seed
// すべてのテーブルを空にしてから、今日を基準にした架空データを入れる
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { resetAll, seedDemoData, type SeedDb } from "../src/db/seed";
import { todayInTokyo } from "../src/lib/dates";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が設定されていません(.env.local を確認してください)");
  const password = process.env.SEED_DEMO_PASSWORD ?? "tour-ops-demo";

  const db = drizzle({ client: neon(url), schema }) as unknown as SeedDb;
  const today = todayInTokyo();

  await resetAll(db);
  const result = await seedDemoData(db, { today, password });

  console.log(`デモデータを入れました(基準日: ${today})`);
  for (const u of result.users) console.log(`  ${u.role === "admin" ? "管理者" : "手配担当"}: ${u.email}`);
  console.log(`  パスワード: ${password}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
