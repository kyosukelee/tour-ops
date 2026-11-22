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
import { cn, formatDate, formatDateRange, formatDateTime, formatYen } from "@/lib/utils";
import { runDailyJobAction } from "@/app/actions/system";
import { ActionButton } from "@/components/form/action-button";
import { can } from "@/server/core";
import { getArrangementAlerts, getDashboard, lastDailyRun } from "@/server/queries";

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
  const db = getDb();
  const isAdmin = can(actor, "system.run");
  const [data, alerts, lastRun] = await Promise.all([
    getDashboard(db, { today, userId: allTasks ? undefined : actor.id }),
    getArrangementAlerts(db, { today }),
    isAdmin ? lastDailyRun(db) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <section aria-label="案件の件数" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="進行中の案件" value={data.openCount} href="/projects" />
        <Stat label="期限切れのタスク" value={data.overdueTasks.length} tone={data.overdueTasks.length ? "alert" : undefined} href="/tasks" />
        <Stat label="回答期限切れの手配" value={alerts.overdueReplies.length} tone={alerts.overdueReplies.length ? "alert" : undefined} />
        <Stat
          label={`今月出発の粗利見込み(${Number(alerts.monthStart.slice(5, 7))}月・${alerts.monthProjectCount}件)`}
          value={formatYen(alerts.monthProfit)}
          sub={`売上 ${formatYen(alerts.monthSales)}`}
        />
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

      {(alerts.overdueReplies.length > 0 || alerts.unarranged.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>手配の注意</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <AlertList
              title="回答期限を過ぎても回答がない手配"
              empty="ありません"
              rows={alerts.overdueReplies.map((a) => ({ ...a, note: `回答期限 ${formatDate(a.replyDue)}`, alert: true }))}
            />
            <AlertList
              title="受注済みなのに、まだ依頼していない手配"
              empty="ありません"
              rows={alerts.unarranged.map((a) => ({ ...a, note: `利用日 ${formatDate(a.serviceDate)}`, alert: false }))}
            />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>毎朝の通知メール</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              毎朝6時ごろ、期限切れ・3日以内のタスクと、出発が近いのに確定していない手配を担当者に知らせます。
              <span className="mt-1 block">
                前回:{" "}
                {lastRun
                  ? `${formatDateTime(lastRun.at)}(${lastRun.trigger ?? "—"}・${lastRun.mailsSent ?? 0}通${lastRun.mailsFailed ? `、失敗${lastRun.mailsFailed}通` : ""})`
                  : "まだ実行していません"}
              </span>
            </p>
            <ActionButton action={runDailyJobAction} variant="outline" size="sm" confirm="担当者全員に通知メールを送ります。よろしいですか?">
              今すぐ送る
            </ActionButton>
          </CardContent>
        </Card>
      )}

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

function Stat({ label, value, href, tone, sub }: { label: string; value: number | string; href?: string; tone?: "alert"; sub?: string }) {
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/50")}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "alert" && "text-destructive")}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
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

function AlertList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; description: string; supplierName: string | null; projectId: string; projectCode: string; projectTitle: string; note: string; alert: boolean }[];
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
        {title}({rows.length}件)
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block">
                  {a.supplierName ?? "仕入先未定"} ・ {a.description}
                </span>
                <Link href={`/projects/${a.projectId}?tab=requests`} className="text-xs text-muted-foreground hover:underline">
                  {a.projectCode} {a.projectTitle}
                </Link>
              </span>
              <span className={cn("shrink-0 text-xs tabular-nums", a.alert && "font-medium text-destructive")}>{a.note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
