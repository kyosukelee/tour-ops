// 操作ログ(追記のみ)。更新・削除の関数はあえて作らない
import { auditLogs } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RequestInfo } from "./core";

// 記録しない項目(秘密の値)
const SECRET_KEYS = new Set(["password", "token", "accessToken", "refreshToken", "idToken"]);

type Plain = Record<string, unknown>;

function clean(obj: Plain | null | undefined): Plain | null {
  if (!obj) return null;
  const out: Plain = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.has(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

// 変わった項目だけを { before, after } にする
export function diff(before: Plain | null | undefined, after: Plain | null | undefined) {
  const b = clean(before);
  const a = clean(after);
  if (!b || !a) return { before: b, after: a };
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changedBefore: Plain = {};
  const changedAfter: Plain = {};
  for (const k of keys) {
    if (k === "updatedAt" || k === "createdAt") continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      changedBefore[k] = b[k];
      changedAfter[k] = a[k];
    }
  }
  return { before: changedBefore, after: changedAfter };
}

export type AuditEntry = {
  userId: string | null;
  action: string; // 例: project.create
  targetType?: string;
  targetId?: string;
  projectId?: string | null;
  before?: Plain | null;
  after?: Plain | null;
  extra?: Plain;
  request?: RequestInfo;
};

export async function recordAudit(db: Db, e: AuditEntry) {
  const changes = e.before || e.after ? { ...diff(e.before, e.after), ...(e.extra ?? {}) } : (e.extra ?? null);
  await db.insert(auditLogs).values({
    userId: e.userId,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    projectId: e.projectId ?? null,
    changes,
    ipAddress: e.request?.ipAddress ?? null,
    userAgent: e.request?.userAgent ?? null,
  });
}
