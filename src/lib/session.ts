// ログイン中の担当者を取り出す(データアクセスの入口)
// 画面でも Server Action でも、毎回ここでセッションと利用停止を確かめる
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import type { Actor, RequestInfo, Role } from "@/server/core";

export async function getActor(): Promise<Actor | null> {
  // 先にリクエストを読む(ビルド時はここで止まり、DB接続を作りに行かない)
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: h });
  if (!session) return null;
  const user = session.user as typeof session.user & { role?: Role; active?: boolean };
  if (user.active === false) return null;
  return { id: user.id, name: user.name, role: user.role === "admin" ? "admin" : "staff" };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function getRequestInfo(): Promise<RequestInfo> {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}
