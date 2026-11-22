// ログイン(Better Auth)。メールアドレスとパスワードだけを使い、新規登録は管理者が行う
import "server-only";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";

function createAuth() {
  const db = getDb();
  return betterAuth({
    appName: "tour-ops",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // 自分で登録はできない(担当者管理から管理者が登録する)
      minPasswordLength: 10,
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, required: false, defaultValue: "staff" },
        active: { type: "boolean", input: false, required: false, defaultValue: true },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7日
      updateAge: 60 * 60 * 24, // 1日ごとに延長
    },
    databaseHooks: {
      session: {
        create: {
          // 利用停止の担当者はログインさせない
          before: async (session) => {
            const [u] = await db.select({ active: users.active }).from(users).where(eq(users.id, session.userId)).limit(1);
            if (!u?.active) {
              throw new APIError("FORBIDDEN", { message: "この担当者は利用停止になっています" });
            }
          },
        },
      },
    },
    plugins: [nextCookies()], // Server Action からのログインで Cookie を設定する
  });
}

type Auth = ReturnType<typeof createAuth>;
let cached: Auth | undefined;

// ビルド時に DATABASE_URL がなくても落ちないよう、最初に使うときに作る
export function getAuth(): Auth {
  cached ??= createAuth();
  return cached;
}
