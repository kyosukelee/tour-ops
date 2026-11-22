// 確認用トップページ: ログインした担当者と、DBのデモデータを表示する
// (ステップ3で案件一覧・ダッシュボードに置き換える)
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb, schema as s } from "@/db";
import {
  ARRANGEMENT_STATUSES,
  grossProfit,
  PROJECT_STATUS_LABEL,
  TERMINAL_STATUSES,
  type ProjectStatus,
} from "@/lib/status";
import { formatYen } from "@/lib/utils";
import { requireActor } from "@/lib/session";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">tour-ops</p>
        <h1 className="text-2xl font-semibold">観光手配案件管理(開発中)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          確認用ページです。ログインとデータベースの接続、デモデータを確認できます。
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">読み込んでいます…</p>}>
        <UserBar />
        <ProjectList />
      </Suspense>
    </main>
  );
}

async function UserBar() {
  const actor = await requireActor(); // 未ログインなら /login へ
  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
      <p>
        {actor.name} さん <span className="ml-2 text-xs text-muted-foreground">{actor.role === "admin" ? "管理者" : "手配担当"}</span>
      </p>
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm">
          ログアウト
        </Button>
      </form>
    </div>
  );
}

async function ProjectList() {
  await requireActor(); // 毎回のアクセス時に、ログインを確かめてからDBを読む

  let rows;
  try {
    const db = getDb();
    const [projects, arrangements] = await Promise.all([
      db
        .select({
          id: s.projects.id,
          code: s.projects.code,
          title: s.projects.title,
          status: s.projects.status,
          startDate: s.projects.startDate,
          endDate: s.projects.endDate,
          agency: s.agencies.name,
        })
        .from(s.projects)
        .innerJoin(s.agencies, eq(s.projects.agencyId, s.agencies.id))
        .orderBy(asc(s.projects.startDate)),
      db.select().from(s.arrangements),
    ]);
    rows = projects.map((p) => {
      const arrs = arrangements.filter((a) => a.projectId === p.id);
      const counts = Object.fromEntries(
        ARRANGEMENT_STATUSES.map((st) => [st, arrs.filter((a) => a.status === st).length]),
      ) as Record<(typeof ARRANGEMENT_STATUSES)[number], number>;
      return { ...p, counts, total: arrs.length, profit: grossProfit(arrs) };
    });
  } catch (e) {
    return (
      <div className="rounded-lg border border-destructive/40 p-4 text-sm">
        <p className="font-medium">データベースに接続できませんでした。</p>
        <p className="mt-1 text-muted-foreground">
          .env.local の DATABASE_URL と、マイグレーション・デモデータの投入(README の手順)を確認してください。
        </p>
        <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{String(e)}</pre>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">案件がありません。npm run db:seed でデモデータを入れてください。</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>案件番号</TableHead>
          <TableHead>ツアー名</TableHead>
          <TableHead>依頼元</TableHead>
          <TableHead>ステータス</TableHead>
          <TableHead>日程</TableHead>
          <TableHead>手配(確定/全体)</TableHead>
          <TableHead className="text-right">粗利見込み</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const status = r.status as ProjectStatus;
          const active = r.total - r.counts.cancelled;
          return (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.code}</TableCell>
              <TableCell className="font-medium">{r.title}</TableCell>
              <TableCell>{r.agency}</TableCell>
              <TableCell>
                <Badge variant={TERMINAL_STATUSES.includes(status) ? "outline" : "secondary"}>
                  {PROJECT_STATUS_LABEL[status]}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">
                {r.startDate}〜{r.endDate}
              </TableCell>
              <TableCell>
                {r.counts.confirmed}/{active}
                {r.counts.cancelled > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">(取消{r.counts.cancelled})</span>
                )}
              </TableCell>
              <TableCell className="text-right">{formatYen(r.profit)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
