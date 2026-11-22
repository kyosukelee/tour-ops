// DB接続(Neon の HTTP ドライバ)。サーバー側からだけ使う
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

function createDb(url: string) {
  return drizzle({ client: neon(url), schema });
}

let cached: Db | undefined;

// ビルド時に DATABASE_URL がなくても落ちないよう、最初に使うときに接続を作る
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL が設定されていません(.env.local を確認してください)");
    }
    cached = createDb(url);
  }
  return cached;
}

export { schema };
