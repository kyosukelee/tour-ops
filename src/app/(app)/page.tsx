// ダッシュボード: 期限の近いタスクと、出発の近い案件をまとめて見る
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Loading, PageHeader } from "@/components/app/page-header";
import { ProjectStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { todayInTokyo } from "@/lib/dates";
import { requireActor } from "@/lib/session";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, TERMINAL_STATUSES } from "@/lib/status";
import { cn, formatDate, formatDateRange } from "@/lib/utils";
import { getDashboard } from "@/server/queries";

export const metadata: Metadata = { title: "ダッシュボード | tour-ops" };

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader title="ダッシュボード" description="期限の近いタスクと、出発の近い案件" />
      <Suspense fallback={<Loading />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const actor = await requireActor();
  const { scope } = await searchParams;
  // 既定は全員分(少人数のチームで互いの期限を見られるように)。「自分」で自分の担当だけにする
  const allTasks = scope !== "mine";
  const today = todayInTokyo();
  const data = await getDashboard(getDb(), { today, userId: allTasks ? undefined : actor.id });

  return (
    <div className="space-y-6">
      <section aria-label="案件の件数" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="進行中の案件" value={data.openCount} href="/projects" />
        <Stat label="手配中" value={data.statusCounts.arranging} href="/projects?status=arranging" />
        <Stat label="期限切れのタスク" value={data.overdueTasks.length} tone={data.overdueTasks.length ? "alert" : undefined} />
        <Stat label="14日以内に出発" value={data.departures.length} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>期限が近いタスク(7日以内)</CardTitle>
            <div className="flex gap-1 text-xs">
              <ScopeLink href="/" active={allTasks}>
                全員
              </ScopeLink>
              <ScopeLink href="/?scope=mine" active={!allTasks}>
                自分
              </ScopeLink>
            </div>
          </CardHeader>
          <CardContent>
            {data.overdueTasks.length + data.upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">期限が近いタスクはありません。</p>
            ) : (
              <ul className="divide-y text-sm">
                {[...data.overdueTasks, ...data.upcomingTasks].map((t) => {
                  const overdue = t.dueDate < today;
                  return (
                    <li key={t.id} className="flex items-start gap-3 py-2">
                      <span className={cn("w-20 shrink-0 tabular-nums", overdue ? "font-medium text-destructive" : t.dueDate === today && "font-medium")}>
                        {formatDate(t.dueDate)}
                        {overdue && <span className="block text-xs">期限切れ</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block">{t.title}</span>
                        <Link href={`/projects/${t.projectId}?tab=tasks`} className="text-xs text-muted-foreground hover:underline">
                          {t.projectCode} {t.projectTitle}
                        </Link>
                        {allTasks && t.assigneeName && <span className="ml-2 text-xs text-muted-foreground">担当: {t.assigneeName}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>出発が近い案件(14日以内)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.departures.length === 0 ? (
              <p className="text-sm text-muted-foreground">14日以内に出発する案件はありません。</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.departures.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateRange(p.startDate, p.endDate)} ・ {p.agencyName}
                      </span>
                    </span>
                    <ProjectStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ステータス別の件数</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PROJECT_STATUSES.map((st) => (
            <Link
              key={st}
              href={`/projects?status=${st}`}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm hover:bg-accent",
                TERMINAL_STATUSES.includes(st) && "text-muted-foreground",
              )}
            >
              {PROJECT_STATUS_LABEL[st]} <span className="ml-1 font-semibold tabular-nums">{data.statusCounts[st]}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "alert" }) {
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/50")}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "alert" && "text-destructive")}>{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function ScopeLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("rounded px-2 py-1 hover:bg-accent", active && "bg-accent font-medium")}>
      {children}
    </Link>
  );
}
