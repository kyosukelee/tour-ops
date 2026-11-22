// 案件詳細: 基本情報・金額のまとめ・ステータス操作と、タブ(手配明細 / タスク / 履歴)
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import { changeProjectStatusAction, createArrangementAction, updateArrangementAction } from "@/app/actions/projects";
import { addCommentAction, createTaskAction, deleteTaskAction, setTaskDoneAction } from "@/app/actions/tasks";
import { ActionButton } from "@/components/form/action-button";
import { CommentForm, TaskAddForm } from "@/components/projects/task-parts";
import { Loading } from "@/components/app/page-header";
import { ArrangementDialog, type SupplierOption } from "@/components/projects/arrangement-dialog";
import { StatusActions } from "@/components/projects/status-actions";
import { ArrangementStatusBadge, ProjectStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { todayInTokyo } from "@/lib/dates";
import { requireActor } from "@/lib/session";
import {
  ARRANGEMENT_STATUS_LABEL,
  canConfirmArrangement,
  CATEGORY_LABEL,
  nextProjectStatuses,
  PROJECT_STATUS_LABEL,
  TERMINAL_STATUSES,
  type ArrangementStatus,
  type ProjectStatus,
} from "@/lib/status";
import { cn, formatDate, formatDateRange, formatDateTime, formatYen } from "@/lib/utils";
import { getProjectDetail, listSupplierOptions, listUserOptions, type ProjectDetail } from "@/server/queries";

export const metadata: Metadata = { title: "案件詳細 | tour-ops" };

const TABS = [
  { key: "arrangements", label: "手配明細" },
  { key: "tasks", label: "タスク" },
  { key: "comments", label: "コメント" },
  { key: "history", label: "履歴" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <ProjectView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectView({
  params,
  searchParams,
}: {
  params: PageProps<"/projects/[id]">["params"];
  searchParams: PageProps<"/projects/[id]">["searchParams"];
}) {
  await requireActor();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [project, suppliers, users] = await Promise.all([getProjectDetail(db, id), listSupplierOptions(db), listUserOptions(db)]);
  if (!project) notFound();

  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "arrangements";
  const terminal = TERMINAL_STATUSES.includes(project.status);
  const openTasks = project.tasks.filter((t) => !t.done).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← 案件一覧
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{project.code}</p>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold md:text-2xl">
              {project.title}
              <ProjectStatusBadge status={project.status} className="text-sm" />
            </h1>
          </div>
          {!terminal && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${id}/edit`}>
                <PencilIcon className="size-4" />
                編集
              </Link>
            </Button>
          )}
        </div>
      </div>

      <StatusGuide status={project.status} />
      <StatusActions next={nextProjectStatuses(project.status)} action={changeProjectStatusAction.bind(null, id)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[6rem_1fr_6rem_1fr]">
              <dt className="text-muted-foreground">依頼元</dt>
              <dd>
                {project.agencyName}
                {project.agencyContact && <span className="block text-xs text-muted-foreground">{project.agencyContact} 様</span>}
              </dd>
              <dt className="text-muted-foreground">日程</dt>
              <dd>{formatDateRange(project.startDate, project.endDate)}</dd>
              <dt className="text-muted-foreground">人数</dt>
              <dd>
                大人 {project.paxAdult}名
                {project.paxChild > 0 && ` ・ 子ども ${project.paxChild}名`}
              </dd>
              <dt className="text-muted-foreground">案内言語</dt>
              <dd>{project.language ?? "—"}</dd>
              <dt className="text-muted-foreground">担当者</dt>
              <dd>{project.ownerName ?? "—"}</dd>
              <dt className="text-muted-foreground">依頼元連絡先</dt>
              <dd className="text-xs">
                {project.agencyFax && <span className="block">FAX {project.agencyFax}</span>}
                {project.agencyEmail && <span className="block break-all">{project.agencyEmail}</span>}
              </dd>
            </dl>
            {project.note && (
              <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">{project.note}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="売上見込み" value={formatYen(project.totals.sales)} />
              <Row label="原価見込み" value={formatYen(project.totals.cost)} />
              <Row label="粗利見込み" value={formatYen(project.totals.profit)} strong />
              <Row
                label="粗利率"
                value={project.totals.sales > 0 ? `${((project.totals.profit / project.totals.sales) * 100).toFixed(1)}%` : "—"}
              />
              <Row
                label="手配の確定"
                value={project.totals.activeCount ? `${project.totals.confirmedCount} / ${project.totals.activeCount}件` : "—"}
              />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">取消の手配は含めません。精算額が入っている手配は精算額で計算します。</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <nav aria-label="案件の内容" className="flex gap-1 border-b">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "arrangements" ? `/projects/${id}` : `/projects/${id}?tab=${t.key}`}
              scroll={false}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
                tab === t.key && "border-foreground font-medium text-foreground",
              )}
            >
              {t.label}
              {t.key === "arrangements" && <span className="ml-1 text-xs">({project.arrangements.length})</span>}
              {t.key === "tasks" && openTasks > 0 && <span className="ml-1 text-xs">({openTasks})</span>}
              {t.key === "comments" && project.comments.length > 0 && <span className="ml-1 text-xs">({project.comments.length})</span>}
            </Link>
          ))}
        </nav>
        <div className="pt-4">
          {tab === "arrangements" && <ArrangementsTab project={project} suppliers={suppliers as SupplierOption[]} />}
          {tab === "tasks" && <TasksTab project={project} users={users.filter((u) => u.active)} />}
          {tab === "comments" && <CommentsTab project={project} />}
          {tab === "history" && <HistoryTab project={project} />}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

// 今のステータスで次にすること
const GUIDE: Partial<Record<ProjectStatus, string>> = {
  inquiry: "依頼内容を確認し、仕入先への照会(仮押さえ)を始めます。",
  quoting: "手配明細に原価・販売単価を入れて見積を作ります。",
  quoted: "依頼元の回答待ちです。受注したら「受注して手配を始める」を押します。",
  arranging: "すべての手配が「確定」になると、自動で「手配完了」になります。",
  arranged: "すべての手配が確定しています。出発日になったら「催行を始める」を押します。",
  operating: "催行中です。終わったら精算に進みます。",
  settling: "仕入先からの請求を確認し、手配明細に精算額を入れます。",
};

function StatusGuide({ status }: { status: ProjectStatus }) {
  const text = GUIDE[status];
  if (!text) return null;
  return <p className="text-sm text-muted-foreground">次にすること: {text}</p>;
}

function ArrangementsTab({ project, suppliers }: { project: ProjectDetail; suppliers: SupplierOption[] }) {
  const status = project.status;
  const canAdd = !TERMINAL_STATUSES.includes(status);
  const cancelledOnly = status === "lost" || status === "cancelled";
  const canEdit = status !== "completed";
  const canConfirm = canConfirmArrangement(status);
  const editButton = (a: ProjectDetail["arrangements"][number]) => (
    <ArrangementDialog
      title="手配を編集"
      trigger={
        <Button size="sm" variant="ghost" aria-label={`${a.description} を編集`}>
          <PencilIcon className="size-4" />
        </Button>
      }
      action={updateArrangementAction.bind(null, a.id)}
      defaults={a}
      suppliers={suppliers}
      canConfirm={canConfirm}
      cancelledOnly={cancelledOnly}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {Object.entries(countBy(project.arrangements.map((a) => a.status)))
            .map(([st, n]) => `${ARRANGEMENT_STATUS_LABEL[st as ArrangementStatus]} ${n}`)
            .join(" ・ ") || "手配はまだありません"}
        </p>
        {canAdd && (
          <ArrangementDialog
            title="手配を追加"
            trigger={
              <Button size="sm">
                <PlusIcon className="size-4" />
                手配を追加
              </Button>
            }
            action={createArrangementAction.bind(null, project.id)}
            defaults={{ serviceDate: project.startDate, quantity: 1, status: "pending" }}
            suppliers={suppliers}
            canConfirm={canConfirm}
          />
        )}
      </div>

      {/* スマホ: カード表示 */}
      {project.arrangements.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {project.arrangements.map((a) => {
            const cancelled = a.status === "cancelled";
            return (
              <li key={a.id} className={cn("rounded-lg border p-3 text-sm", cancelled && "text-muted-foreground")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {formatDate(a.serviceDate)} {a.serviceTime?.slice(0, 5)} ・ {CATEGORY_LABEL[a.category]} ・ {a.supplierName ?? "仕入先未定"}
                    </p>
                    <p className={cn("font-medium", cancelled && "line-through")}>{a.description}</p>
                  </div>
                  {canEdit && editButton(a)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <ArrangementStatusBadge status={a.status} />
                  <span className="tabular-nums">
                    {formatYen(a.unitPrice)} × {a.quantity}
                  </span>
                  {a.confirmationNo && <span>確認番号 {a.confirmationNo}</span>}
                  <DueDates replyDue={a.replyDue} cancelFeeFrom={a.cancelFeeFrom} settled={a.status === "confirmed" || cancelled} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* PC: 表 */}
      {project.arrangements.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>利用日</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>仕入先・内容</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">原価</TableHead>
                <TableHead className="text-right">販売</TableHead>
                <TableHead>期限</TableHead>
                <TableHead>
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.arrangements.map((a) => {
                const cancelled = a.status === "cancelled";
                return (
                  <TableRow key={a.id} className={cn(cancelled && "text-muted-foreground")}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(a.serviceDate)}
                      {a.serviceTime && <span className="block">{a.serviceTime.slice(0, 5)}</span>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{CATEGORY_LABEL[a.category]}</TableCell>
                    <TableCell className="min-w-56">
                      <span className="block text-xs text-muted-foreground">{a.supplierName ?? "仕入先未定"}</span>
                      <span className={cn("text-sm", cancelled && "line-through")}>{a.description}</span>
                      {a.confirmationNo && <span className="block text-xs text-muted-foreground">確認番号 {a.confirmationNo}</span>}
                      {cancelled && a.cancelFee != null && (
                        <span className="block text-xs">取消料 {formatYen(a.cancelFee)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ArrangementStatusBadge status={a.status} />
                      {a.invoiceReceived && (
                        <Badge variant="outline" className="mt-1 block w-fit text-[10px]">
                          請求受領
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.quantity}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums whitespace-nowrap">
                      {formatYen(a.unitCost)}
                      {a.actualCost != null && <span className="block text-xs text-muted-foreground">精算 {formatYen(a.actualCost)}</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums whitespace-nowrap">{formatYen(a.unitPrice)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <DueDates replyDue={a.replyDue} cancelFeeFrom={a.cancelFeeFrom} settled={a.status === "confirmed" || cancelled} />
                    </TableCell>
                    <TableCell>{canEdit && editButton(a)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function DueDates({ replyDue, cancelFeeFrom, settled }: { replyDue: string | null; cancelFeeFrom: string | null; settled: boolean }) {
  const today = todayInTokyo();
  return (
    <>
      {replyDue && !settled && (
        <span className={cn("block", replyDue < today && "font-medium text-destructive")}>回答 {formatDate(replyDue)}</span>
      )}
      {cancelFeeFrom && (
        <span className={cn("block", cancelFeeFrom <= today && "text-amber-700")}>取消料 {formatDate(cancelFeeFrom)}〜</span>
      )}
    </>
  );
}

function TasksTab({ project, users }: { project: ProjectDetail; users: { id: string; name: string }[] }) {
  const today = todayInTokyo();
  return (
    <div className="space-y-3">
      <TaskAddForm action={createTaskAction.bind(null, project.id)} users={users} defaultDue={today} />
      <p className="text-xs text-muted-foreground">
        「自動」のタスクは手配明細の回答期限・取消料発生日から作られ、手配が確定・取消になると自動で完了します。
      </p>
      {project.tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">タスクはありません。</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {project.tasks.map((t) => (
            <li key={t.id} className={cn("flex items-start gap-3 px-4 py-2", t.done && "text-muted-foreground")}>
              <span className={cn("w-16 shrink-0 pt-0.5 tabular-nums sm:w-24", !t.done && t.dueDate < today && "font-medium text-destructive")}>
                {formatDate(t.dueDate)}
              </span>
              <div className="min-w-0 flex-1">
                <span className={cn("block", t.done && "line-through")}>{t.title}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>担当: {t.assigneeName ?? "未定"}</span>
                  {t.source === "auto" && (
                    <Badge variant="outline" className="text-[10px]">
                      自動
                    </Badge>
                  )}
                </div>
              </div>
              {t.source === "manual" ? (
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  <ActionButton
                    action={setTaskDoneAction.bind(null, t.id)}
                    fields={{ done: t.done ? "false" : "true" }}
                    size="sm"
                    variant={t.done ? "ghost" : "outline"}
                    aria-label={`${t.title} を${t.done ? "未完了に戻す" : "完了にする"}`}
                  >
                    {t.done ? "戻す" : "完了"}
                  </ActionButton>
                  <ActionButton
                    action={deleteTaskAction.bind(null, t.id)}
                    confirm="削除しますか?"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    aria-label={`${t.title} を削除`}
                  >
                    削除
                  </ActionButton>
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{t.done ? "完了" : "自動で完了"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentsTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="max-w-3xl space-y-4">
      <CommentForm action={addCommentAction.bind(null, project.id)} />
      {project.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">コメントはまだありません。</p>
      ) : (
        <ul className="space-y-3">
          {project.comments.map((c) => (
            <li key={c.id} className="rounded-lg border px-4 py-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">
                {c.authorName ?? "不明"} ・ {formatDateTime(c.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({ project }: { project: ProjectDetail }) {
  if (project.history.length === 0) return <p className="text-sm text-muted-foreground">履歴はありません。</p>;
  return (
    <ol className="space-y-3 text-sm">
      {project.history.map((h) => {
        const isArrangement = !!h.arrangementId;
        const label = (st: string | null) =>
          st == null
            ? "—"
            : isArrangement
              ? (ARRANGEMENT_STATUS_LABEL[st as ArrangementStatus] ?? st)
              : (PROJECT_STATUS_LABEL[st as ProjectStatus] ?? st);
        return (
          <li key={h.id} className="flex flex-wrap gap-x-4 gap-y-0.5 border-l-2 pl-3">
            <span className="w-36 text-xs text-muted-foreground tabular-nums">{formatDateTime(h.changedAt)}</span>
            <span className="min-w-0 flex-1">
              {isArrangement ? (
                <>
                  手配「{h.arrangementDescription}」: {h.fromStatus ? `${label(h.fromStatus)} → ` : "登録 → "}
                  {label(h.toStatus)}
                </>
              ) : (
                <>
                  案件: {h.fromStatus ? `${label(h.fromStatus)} → ` : "登録 → "}
                  <span className="font-medium">{label(h.toStatus)}</span>
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{h.changedByName ?? "システム"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function countBy<T extends string>(items: T[]): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}
