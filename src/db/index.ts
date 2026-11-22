// DB接続(node-postgres)。サーバー側からだけ使う
// 標準の PostgreSQL ドライバなので、Neon 以外(AWS RDS・Azure など)にもそのまま移せる
import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

let cached: Db | undefined;

// ビルド時に DATABASE_URL がなくても落ちないよう、最初に使うときに接続を作る
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL が設定されていません(.env.local を確認してください)");
    }
    // サーバーレスでは接続を少なめに持つ(Neon は接続文字列の -pooler で接続をまとめる)
    const pool = new Pool({ connectionString: url, max: 5 });
    cached = drizzle({ client: pool, schema }) as unknown as Db;
  }
  return cached;
}

export { schema };
