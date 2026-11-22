"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { getDb } from "@/db";
import { getAuth } from "@/lib/auth";
import { getActor, getRequestInfo } from "@/lib/session";
import { loginInput, fieldErrorsOf } from "@/lib/validation";
import { recordAudit } from "@/server/audit";
import type { ActionResult } from "@/server/action-utils";

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginInput.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, error: "入力内容を確認してください", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const { email, password } = parsed.data;
  const request = await getRequestInfo();

  try {
    const res = await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
    await recordAudit(getDb(), { userId: res.user.id, action: "auth.login", targetType: "user", targetId: res.user.id, request });
  } catch (e) {
    // ログインの失敗も記録する(入力されたメールアドレスだけを残し、パスワードは残さない)
    await recordAudit(getDb(), { userId: null, action: "auth.login_failed", extra: { email }, request });
    if (e instanceof APIError && e.status === "FORBIDDEN") {
      return { ok: false, error: "この担当者は利用停止になっています。管理者に連絡してください" };
    }
    return { ok: false, error: "メールアドレスまたはパスワードが違います" };
  }
  redirect("/");
}

export async function logout(): Promise<void> {
  const actor = await getActor();
  await getAuth().api.signOut({ headers: await headers() });
  if (actor) {
    await recordAudit(getDb(), { userId: actor.id, action: "auth.logout", targetType: "user", targetId: actor.id, request: await getRequestInfo() });
  }
  redirect("/login");
}
