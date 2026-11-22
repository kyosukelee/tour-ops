// 案件一覧(リスト表示)。絞り込みは URL のパラメータで持つので、そのままブックマーク・共有できる
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Loading, PageHeader } from "@/components/app/page-header";
import { ProjectStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requireActor } from "@/lib/session";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/status";
import { formatDateRange, formatYen } from "@/lib/utils";
import { listAgencyOptions, listProjects, listUserOptions } from "@/server/queries";

export const metadata: Metadata = { title: "案件 | tour-ops" };

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <>
      <PageHeader
        title="案件"
        description="旅行会社から受けた手配依頼の一覧"
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <PlusIcon className="size-4" />
              案件を登録
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Loading />}>
        <ProjectList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function ProjectList({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  await requireActor();
  const sp = await searchParams;
  const filter = { status: one(sp.status) || "open", agencyId: one(sp.agency), ownerId: one(sp.owner), q: one(sp.q) };
  const db = getDb();
  const [rows, agencies, users] = await Promise.all([
    listProjects(db, {
      ...filter,
      // 形式の違う値は無視する(不正な UUID で DB エラーにしない)
      agencyId: /^[0-9a-f-]{36}$/i.test(filter.agencyId) ? filter.agencyId : undefined,
    }),
    listAgencyOptions(db),
    listUserOptions(db),
  ]);

  return (
    <div className="space-y-4">
      <form method="get" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end" role="search">
        <label className="col-span-2 space-y-1 text-xs sm:w-56">
          <span className="text-muted-foreground">キーワード(ツアー名・案件番号)</span>
          <Input name="q" defaultValue={filter.q} placeholder="例: 宮島" />
        </label>
        <label className="space-y-1 text-xs sm:w-44">
          <span className="text-muted-foreground">ステータス</span>
          <NativeSelect name="status" defaultValue={filter.status}>
            <option value="open">進行中(終了を除く)</option>
            <option value="all">すべて</option>
            {PROJECT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {PROJECT_STATUS_LABEL[st]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-xs sm:w-48">
          <span className="text-muted-foreground">依頼元</span>
          <NativeSelect name="agency" defaultValue={filter.agencyId}>
            <option value="">すべて</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-xs sm:w-36">
          <span className="text-muted-foreground">担当者</span>
          <NativeSelect name="owner" defaultValue={filter.ownerId}>
            <option value="">すべて</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="col-span-2 flex gap-2">
          <Button type="submit" variant="secondary">
            絞り込む
          </Button>
          <Button asChild variant="ghost">
            <Link href="/projects">条件をクリア</Link>
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">{rows.length}件</p>

      {rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">条件に合う案件はありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ツアー名</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>日程</TableHead>
                <TableHead className="hidden md:table-cell">依頼元</TableHead>
                <TableHead className="hidden lg:table-cell">担当</TableHead>
                <TableHead>手配確定</TableHead>
                <TableHead className="hidden text-right sm:table-cell">粗利見込み</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/projects/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <span className="block font-mono text-xs text-muted-foreground">{r.code}</span>
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateRange(r.startDate, r.endDate)}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{r.agencyName}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{r.ownerName ?? "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {r.activeCount === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={r.confirmedCount === r.activeCount ? "text-emerald-700" : undefined}>
                        {r.confirmedCount}/{r.activeCount}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatYen(r.profit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
