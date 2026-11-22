// 操作ログ(管理者のみ)。誰が・いつ・何を変えたかを確認する
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden } from "@/components/app/forbidden";
import { Loading, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { AUDIT_ACTION_LABEL, AUDIT_KINDS, FIELD_LABEL, HIDDEN_FIELDS, type AuditKind } from "@/lib/audit-labels";
import { requireActor } from "@/lib/session";
import { ARRANGEMENT_STATUS_LABEL, CATEGORY_LABEL, PROJECT_STATUS_LABEL } from "@/lib/status";
import { cn, formatDateTime } from "@/lib/utils";
import { can } from "@/server/core";
import { listAgencies, listAuditLogs, listSupplierOptions, listUserOptions } from "@/server/queries";

export const metadata: Metadata = { title: "操作ログ | tour-ops" };

export default function AuditPage({ searchParams }: PageProps<"/audit">) {
  return (
    <>
      <PageHeader title="操作ログ" description="ログインと、データの登録・変更の記録(追記のみで、消したり書き換えたりはできません)" />
      <Suspense fallback={<Loading />}>
        <AuditList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function AuditList({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  const actor = await requireActor();
  if (!can(actor, "audit.view")) return <Forbidden />;
  const sp = await searchParams;
  const kind = one(sp.kind) in AUDIT_KINDS ? (one(sp.kind) as AuditKind) : "";
  const userId = one(sp.user);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : "";
  const page = Number(one(sp.page)) || 1;
  const db = getDb();
  const [result, users, agencies, suppliers] = await Promise.all([
    listAuditLogs(db, { kind: kind || undefined, userId: userId || undefined, date: date || undefined, page }),
    listUserOptions(db),
    listAgencies(db), // 利用停止の依頼元も名前を出すため全件
    listSupplierOptions(db),
  ]);
  // 変更内容の ID を名前に置き換えて表示する
  const names: Names = {
    user: new Map(users.map((u) => [u.id, u.name])),
    agency: new Map(agencies.map((a) => [a.id, a.name])),
    supplier: new Map(suppliers.map((x) => [x.id, x.name])),
  };

  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (kind) q.set("kind", kind);
    if (userId) q.set("user", userId);
    if (date) q.set("date", date);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/audit?${s}` : "/audit";
  };

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">種類</span>
          <NativeSelect name="kind" defaultValue={kind} className="w-36">
            <option value="">すべて</option>
            {Object.entries(AUDIT_KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">操作した人</span>
          <NativeSelect name="user" defaultValue={userId} className="w-36">
            <option value="">全員</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">日付</span>
          <Input type="date" name="date" defaultValue={date} className="w-40" />
        </label>
        <Button type="submit" variant="secondary">
          絞り込む
        </Button>
        <Button asChild variant="ghost">
          <Link href="/audit">条件をクリア</Link>
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {result.total}件 ・ {result.page} / {result.pageCount}ページ
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>操作した人</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>対象・変更内容</TableHead>
              <TableHead className="hidden lg:table-cell">接続元</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell className="text-xs whitespace-nowrap tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{r.userName ?? (r.userId ? "(削除済み)" : "—")}</TableCell>
                <TableCell className={cn("text-sm whitespace-nowrap", r.action === "auth.login_failed" && "text-destructive")}>
                  {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                </TableCell>
                <TableCell className="min-w-72 text-xs">
                  {r.projectId && (
                    <Link href={`/projects/${r.projectId}`} className="mb-1 block underline">
                      {r.projectCode} {r.projectTitle}
                    </Link>
                  )}
                  <Changes changes={r.changes} names={names} />
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{r.ipAddress ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {result.pageCount > 1 && (
        <nav aria-label="ページ" className="flex items-center gap-2 text-sm">
          {result.page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(result.page - 1)}>← 新しいログ</Link>
            </Button>
          )}
          {result.page < result.pageCount && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(result.page + 1)}>古いログ →</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}

type Json = Record<string, unknown>;
type Names = { user: Map<string, string>; agency: Map<string, string>; supplier: Map<string, string> };

const ID_FIELDS: Record<string, keyof Names> = {
  ownerUserId: "user",
  assigneeUserId: "user",
  agencyId: "agency",
  supplierId: "supplier",
};

function formatValue(key: string, v: unknown, names?: Names): string {
  if (v === null || v === undefined || v === "") return "(空欄)";
  if (names && key in ID_FIELDS && typeof v === "string") return names[ID_FIELDS[key]].get(v) ?? "(不明)";
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  if (key === "status" && typeof v === "string") {
    return PROJECT_STATUS_LABEL[v as keyof typeof PROJECT_STATUS_LABEL] ?? ARRANGEMENT_STATUS_LABEL[v as keyof typeof ARRANGEMENT_STATUS_LABEL] ?? v;
  }
  if (key === "category" && typeof v === "string") return CATEGORY_LABEL[v as keyof typeof CATEGORY_LABEL] ?? v;
  if (key === "role") return v === "admin" ? "管理者" : "手配担当";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  // 一覧(依頼した手配、回答など)は読点でつなぐ
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("、");
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

// { before, after } は変わった項目を「前 → 後」で、それ以外の情報(メールアドレスなど)はそのまま出す
function Changes({ changes, names }: { changes: unknown; names: Names }) {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Json;
  const before = (c.before ?? null) as Json | null;
  const after = (c.after ?? null) as Json | null;
  const extra = Object.entries(c).filter(([k]) => k !== "before" && k !== "after");
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !HIDDEN_FIELDS.has(k));
  const isCreate = !before && after;
  const isDelete = before && !after;
  // 登録・削除のときは、空欄の項目を省いて短くする
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (isCreate) keys.splice(0, keys.length, ...keys.filter((k) => !empty(after![k])));
  if (isDelete) keys.splice(0, keys.length, ...keys.filter((k) => !empty(before![k])));
  const shown = keys.slice(0, 8);

  return (
    <dl className="space-y-0.5">
      {shown.map((k) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">{FIELD_LABEL[k] ?? k}:</dt>
          <dd>
            {isCreate
              ? formatValue(k, after![k], names)
              : isDelete
                ? formatValue(k, before![k], names)
                : `${formatValue(k, before?.[k], names)} → ${formatValue(k, after?.[k], names)}`}
          </dd>
        </div>
      ))}
      {keys.length > shown.length && <p className="text-muted-foreground">ほか{keys.length - shown.length}項目</p>}
      {extra.map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">{FIELD_LABEL[k] ?? (k === "today" ? "基準日" : k)}:</dt>
          <dd>{formatValue(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}
