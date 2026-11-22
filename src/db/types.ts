import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

// 本番(node-postgres)とテスト(PGlite)の両方で使える DB の型
// トランザクションの中で渡される tx もこの型で扱う
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
