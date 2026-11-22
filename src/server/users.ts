// 担当者管理(管理者のみ)。パスワードの再設定も管理者が行う
import { randomUUID } from "node:crypto";
import { and, count, eq, ne } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { accounts, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { UserCreateInput, UserUpdateInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";

export async function createUser(db: Db, ctx: Ctx, input: UserCreateInput) {
  assertCan(ctx.actor, "users.manage");
  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (dup) throw new AppError("CONFLICT", "このメールアドレスは登録済みです", { email: ["登録済みです"] });
    const id = randomUUID();
    const [created] = await tx
      .insert(users)
      .values({ id, name: input.name, email, role: input.role, emailVerified: true })
      .returning();
    await tx.insert(accounts).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash });
    await recordAudit(tx, { userId: ctx.actor.id, action: "user.create", targetType: "user", targetId: id, after: created, request: ctx.request });
    return created;
  });
}

async function activeAdminCount(db: Db, exceptUserId?: string) {
  const conds = [eq(users.role, "admin"), eq(users.active, true)];
  if (exceptUserId) conds.push(ne(users.id, exceptUserId));
  const [row] = await db.select({ n: count() }).from(users).where(and(...conds));
  return row.n;
}

export async function updateUser(db: Db, ctx: Ctx, id: string, input: UserUpdateInput) {
  assertCan(ctx.actor, "users.manage");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "担当者が見つかりません");

    if (id === ctx.actor.id && (!input.active || input.role !== "admin")) {
      throw new AppError("INVALID", "自分自身の利用停止や、管理者からの変更はできません");
    }
    const losesAdmin = before.role === "admin" && before.active && (input.role !== "admin" || !input.active);
    if (losesAdmin && (await activeAdminCount(tx, id)) === 0) {
      throw new AppError("INVALID", "管理者が1人もいなくなるため変更できません");
    }

    const [after] = await tx.update(users).set(input).where(eq(users.id, id)).returning();
    // 利用停止にしたら、すぐにログアウトさせる
    if (!input.active) await tx.delete(sessions).where(eq(sessions.userId, id));
    await recordAudit(tx, { userId: ctx.actor.id, action: "user.update", targetType: "user", targetId: id, before, after, request: ctx.request });
    return after;
  });
}

export async function resetPassword(db: Db, ctx: Ctx, id: string, newPassword: string) {
  assertCan(ctx.actor, "users.manage");
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) throw new AppError("NOT_FOUND", "担当者のログイン情報が見つかりません");
    await tx.delete(sessions).where(eq(sessions.userId, id)); // 再設定したら全端末でログアウト
    await recordAudit(tx, { userId: ctx.actor.id, action: "user.password_reset", targetType: "user", targetId: id, request: ctx.request });
  });
}
