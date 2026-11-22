// Server Action の共通処理: ログイン確認 → 入力チェック → 業務処理 → 結果を画面向けに返す
import "server-only";
import { reportError } from "@/lib/report-error";
import type { z } from "zod";
import { getDb } from "@/db";
import type { Db } from "@/db/types";
import { getRequestInfo, requireActor } from "@/lib/session";
import { fieldErrorsOf } from "@/lib/validation";
import { AppError, type Ctx } from "./core";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const initialActionState: ActionResult = { ok: true };

export { formToObject } from "@/lib/form";

// ログイン確認は try の外で行う(未ログインなら /login へリダイレクトさせるため)
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  fn: (db: Db, ctx: Ctx, input: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const actor = await requireActor();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const data = await fn(getDb(), { actor, request: await getRequestInfo() }, parsed.data);
    return { ok: true, data, message: "保存しました" };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    reportError("action failed", e, { userId: actor.id });
    return { ok: false, error: "保存できませんでした。時間をおいてもう一度お試しください" };
  }
}
