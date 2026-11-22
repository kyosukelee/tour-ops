// 業務処理の共通部分: 操作する人(Actor)、権限、エラー
// 画面や Server Action に依存しないので、テストから直接呼べる

export type Role = "admin" | "staff";

export type Actor = {
  id: string;
  name: string;
  role: Role;
};

// 操作ログに残すリクエストの情報
export type RequestInfo = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type Ctx = { actor: Actor; request?: RequestInfo };

export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// 権限の一覧(設計書: 担当者管理と操作ログの閲覧は管理者のみ)
const PERMISSIONS = {
  "projects.write": ["admin", "staff"],
  "arrangements.write": ["admin", "staff"],
  "masters.write": ["admin", "staff"],
  "users.manage": ["admin"],
  "audit.view": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(actor: Actor, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(actor.role);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new AppError("FORBIDDEN", "この操作を行う権限がありません");
  }
}
