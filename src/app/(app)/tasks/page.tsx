// タスク一覧: すべての案件のタスクを期限ごとにまとめて見る
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { setTaskDoneAction } from "@/app/actions/tasks";
import { Loading, PageHeader } from "@/components/app/page-header";
import { ActionButton } from "@/components/form/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { getDb } from "@/db";
import { addDays, todayInTokyo } from "@/lib/dates";
import { requireActor } from "@/lib/session";
import { cn, formatDate } from "@/lib/utils";
import { listTasks, listUserOptions } from "@/server/queries";

export const metadata: Metadata = { title: "タスク | tour-ops" };

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <>
      <PageHeader title="タスク" description="期限のある作業の一覧。案件ごとのタスクは案件詳細から追加します。" />
      <Suspense fallback={<Loading />}>
        <TaskList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Row = Awaited<ReturnType<typeof listTasks>>[number];

async function TaskList({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const show = one(sp.show) === "done" ? "done" : "open";
  const assignee = one(sp.assignee);
  const today = todayInTokyo();
  const db = getDb();
  const [rows, users] = await Promise.all([
    listTasks(db, { show, assignee, today, userId: actor.id }),
    listUserOptions(db),
  ]);

  const week = addDays(today, 7);
  const groups: { key: string; label: string; rows: Row[]; tone?: "alert" }[] =
    show === "done"
      ? [{ key: "done", label: "完了したタスク(新しい順・最大100件)", rows }]
      : [
          { key: "overdue", label: "期限切れ", rows: rows.filter((r) => r.dueDate < today), tone: "alert" },
          { key: "today", label: "今日", rows: rows.filter((r) => r.dueDate === today) },
          { key: "week", label: "7日以内", rows: rows.filter((r) => r.dueDate > today && r.dueDate <= week) },
          { key: "later", label: "それ以降", rows: rows.filter((r) => r.dueDate > week) },
        ];

  const href = (next: Record<string, string>) => {
    const q = new URLSearchParams({ show, assignee, ...next });
    for (const [k, v] of [...q.entries()]) if (!v || (k === "show" && v === "open")) q.delete(k);
    const str = q.toString();
    return str ? `/tasks?${str}` : "/tasks";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-md border p-0.5 text-sm" role="group" aria-label="表示するタスク">
          {[
            { v: "open", label: "未完了" },
            { v: "done", label: "完了" },
          ].map((o) => (
            <Link
              key={o.v}
              href={href({ show: o.v })}
              aria-current={show === o.v ? "true" : undefined}
              className={cn("rounded px-3 py-1", show === o.v ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60")}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-end gap-2">
          {show === "done" && <input type="hidden" name="show" value="done" />}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">担当</span>
            <NativeSelect name="assignee" defaultValue={assignee} className="w-40">
              <option value="">全員</option>
              <option value="me">自分</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" variant="secondary">
            表示
          </Button>
        </form>
      </div>

      {rows.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">該当するタスクはありません。</p>}

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`}>
            <h2 id={`g-${g.key}`} className={cn("mb-2 text-sm font-semibold", g.tone === "alert" && "text-destructive")}>
              {g.label} <span className="font-normal text-muted-foreground">{g.rows.length}件</span>
            </h2>
            <ul className="divide-y rounded-lg border text-sm">
              {g.rows.map((t) => (
                <li key={t.id} className={cn("flex items-start gap-3 px-4 py-2", t.done && "text-muted-foreground")}>
                  <span className={cn("w-16 shrink-0 pt-0.5 tabular-nums sm:w-20", !t.done && t.dueDate < today && "font-medium text-destructive")}>
                    {formatDate(t.dueDate)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={cn("block", t.done && "line-through")}>{t.title}</span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Link href={`/projects/${t.projectId}?tab=tasks`} className="hover:underline">
                        {t.projectCode} {t.projectTitle}
                      </Link>
                      <span>担当: {t.assigneeName ?? "未定"}</span>
                      {t.source === "auto" && (
                        <Badge variant="outline" className="text-[10px]">
                          自動
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {t.source === "manual" ? (
                      <ActionButton
                        action={setTaskDoneAction.bind(null, t.id)}
                        fields={{ done: t.done ? "false" : "true" }}
                        size="sm"
                        variant={t.done ? "ghost" : "outline"}
                        aria-label={`${t.title} を${t.done ? "未完了に戻す" : "完了にする"}`}
                      >
                        {t.done ? "戻す" : "完了"}
                      </ActionButton>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.done ? "完了" : "自動で完了"}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
