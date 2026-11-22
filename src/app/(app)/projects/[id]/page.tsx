// 案件詳細: 基本情報・金額のまとめ・ステータス操作と、タブ(手配明細 / タスク / 履歴)
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileTextIcon, PencilIcon, PlusIcon, SendIcon } from "lucide-react";
import { changeProjectStatusAction, createArrangementAction, updateArrangementAction } from "@/app/actions/projects";
import { deleteAttachmentAction, uploadAttachmentAction } from "@/app/actions/attachments";
import { recordReplyAction, sendRequestAction } from "@/app/actions/requests";
import { addCommentAction, createTaskAction, deleteTaskAction, setTaskDoneAction } from "@/app/actions/tasks";
import { ActionButton } from "@/components/form/action-button";
import { AttachmentForm } from "@/components/projects/attachment-form";
import { ReplyDialog } from "@/components/projects/reply-dialog";
import { RequestDialog, type RequestSupplier } from "@/components/projects/request-dialog";
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
  allowedRequestKinds,
  ARRANGEMENT_STATUS_LABEL,
  ATTACHMENT_KIND_LABEL,
  canConfirmArrangement,
  REQUEST_KIND_LABEL,
  REQUEST_METHOD_LABEL,
  CATEGORY_LABEL,
  nextProjectStatuses,
  PROJECT_STATUS_LABEL,
  TERMINAL_STATUSES,
  type ArrangementStatus,
  type ProjectStatus,
} from "@/lib/status";
import { cn, formatDate, formatDateRange, formatDateTime, formatYen } from "@/lib/utils";
import {
  getProjectDetail,
  listAttachments,
  listRequests,
  listSupplierOptions,
  listUserOptions,
  type AttachmentRow,
  type ProjectDetail,
  type RequestRow,
} from "@/server/queries";

export const metadata: Metadata = { title: "案件詳細 | tour-ops" };

const TABS = [
  { key: "arrangements", label: "手配明細" },
  { key: "requests", label: "手配依頼" },
  { key: "attachments", label: "添付書類" },
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
  const [project, suppliers, users, requests, attachments] = await Promise.all([
    getProjectDetail(db, id),
    listSupplierOptions(db),
    listUserOptions(db),
    listRequests(db, id),
    listAttachments(db, id),
  ]);
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
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["internal", "案件票(社内)"],
                ["agency", "案件票(依頼元向け)"],
                ["itinerary", "行程表"],
              ] as const
            ).map(([type, label]) => (
              <Button key={type} asChild variant="outline" size="sm">
                <a href={`/api/projects/${id}/pdf/${type}`} target="_blank" rel="noopener">
                  <FileTextIcon className="size-4" />
                  {label}
                </a>
              </Button>
            ))}
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
              {t.key === "requests" && requests.length > 0 && <span className="ml-1 text-xs">({requests.length})</span>}
              {t.key === "attachments" && attachments.length > 0 && <span className="ml-1 text-xs">({attachments.length})</span>}
              {t.key === "comments" && project.comments.length > 0 && <span className="ml-1 text-xs">({project.comments.length})</span>}
            </Link>
          ))}
        </nav>
        <div className="pt-4">
          {tab === "arrangements" && <ArrangementsTab project={project} suppliers={suppliers as SupplierOption[]} />}
          {tab === "requests" && <RequestsTab project={project} suppliers={suppliers} requests={requests} />}
          {tab === "attachments" && <AttachmentsTab project={project} requests={requests} attachments={attachments} />}
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
        <div className="flex flex-wrap gap-2">
        {allowedRequestKinds(status).length > 0 && project.arrangements.length > 0 && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${project.id}?tab=requests`} scroll={false}>
              <SendIcon className="size-4" />
              手配依頼へ
            </Link>
          </Button>
        )}
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
                  {a.confirmationNo && <span>確定番号 {a.confirmationNo}</span>}
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
                      {a.confirmationNo && <span className="block text-xs text-muted-foreground">確定番号 {a.confirmationNo}</span>}
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

type SupplierOpt = Awaited<ReturnType<typeof listSupplierOptions>>[number];

function RequestsTab({ project, suppliers, requests }: { project: ProjectDetail; suppliers: SupplierOpt[]; requests: RequestRow[] }) {
  const kinds = allowedRequestKinds(project.status);
  const canConfirm = canConfirmArrangement(project.status);
  // 仕入先ごとに、この案件の手配をまとめる
  const groups: RequestSupplier[] = [];
  for (const a of project.arrangements) {
    if (!a.supplierId) continue;
    let g = groups.find((x) => x.id === a.supplierId);
    if (!g) {
      const sup = suppliers.find((x) => x.id === a.supplierId);
      g = { id: a.supplierId, name: sup?.name ?? a.supplierName ?? "", email: sup?.email ?? null, fax: sup?.fax ?? null, arrangements: [] };
      groups.push(g);
    }
    g.arrangements.push({ id: a.id, description: a.description, serviceDate: a.serviceDate, status: a.status });
  }
  const unassigned = project.arrangements.filter((a) => !a.supplierId && a.status !== "cancelled").length;
  // 依頼中のまま回答がない手配(仕入先ごと)
  const waiting = project.arrangements.filter((a) => a.status === "requested");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {waiting.length > 0 ? `回答待ち ${waiting.length}件` : "回答待ちの手配はありません"}
          {kinds.length === 0 && " ・ 完了した案件には依頼を送れません"}
        </p>
        {kinds.length > 0 && (
          <RequestDialog
            projectId={project.id}
            action={sendRequestAction.bind(null, project.id)}
            suppliers={groups}
            kinds={kinds}
            unassignedCount={unassigned}
            trigger={
              <Button size="sm">
                <SendIcon className="size-4" />
                手配依頼を作成
              </Button>
            }
          />
        )}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">まだ手配依頼を送っていません。</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            // 回答待ち(依頼中・仮押さえ・未手配)の手配があるときだけ、回答の入力を出す
            const replyable =
              r.kind !== "cancel" && project.status !== "completed" && r.items.some((i) => i.status !== "cancelled" && i.status !== "confirmed");
            return (
              <li key={r.id} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.supplierName}</span>
                      <Badge variant="outline">{REQUEST_KIND_LABEL[r.kind]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {REQUEST_METHOD_LABEL[r.method]} ・ {formatDateTime(r.sentAt)} ・ {r.senderName ?? "—"}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{r.requestNo}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/requests/${r.id}/pdf`} target="_blank" rel="noopener" aria-label={`${r.requestNo} のPDFを開く`}>
                        <FileTextIcon className="size-4" />
                        PDF
                      </a>
                    </Button>
                    {replyable && (
                      <ReplyDialog
                        action={recordReplyAction.bind(null, r.id)}
                        supplierName={r.supplierName}
                        items={r.items}
                        canConfirm={canConfirm}
                        trigger={
                          <Button size="sm" aria-label={`${r.requestNo} の回答を入力`}>
                            回答を入力
                          </Button>
                        }
                      />
                    )}
                  </div>
                </div>
                <ul className="mt-2 space-y-1">
                  {r.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="w-16 tabular-nums text-muted-foreground">{formatDate(i.serviceDate)}</span>
                      <span className="min-w-0 flex-1">{i.description}</span>
                      {i.confirmationNo && <span className="text-muted-foreground">確定番号 {i.confirmationNo}</span>}
                      <ArrangementStatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
                {r.note && <p className="mt-2 rounded bg-muted/50 px-2 py-1 text-xs whitespace-pre-wrap">{r.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        手配ステータスは各手配の今の状態です。PDFは送ったときの依頼内容に、今の手配明細の内容を差し込んで作ります。
      </p>
    </div>
  );
}

function AttachmentsTab({ project, requests, attachments }: { project: ProjectDetail; requests: RequestRow[]; attachments: AttachmentRow[] }) {
  const requestLabel = new Map(requests.map((r) => [r.id, `${r.requestNo} ${r.supplierName}`]));
  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
  return (
    <div className="space-y-4">
      <AttachmentForm
        action={uploadAttachmentAction.bind(null, project.id)}
        requests={requests.filter((r) => r.kind !== "cancel").map((r) => ({ id: r.id, label: requestLabel.get(r.id)! }))}
        today={todayInTokyo()}
      />
      <p className="text-xs text-muted-foreground">
        FAXで届いた依頼書・変更依頼や、仕入先からの回答の原本をPDFや写真で残します。開いた記録も操作ログに残ります。
      </p>
      {attachments.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">添付書類はまだありません。</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              {a.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- ログインが必要な画像なので next/image の最適化は使わない
                <img src={`/api/attachments/${a.id}`} alt="" className="size-14 shrink-0 rounded border object-cover" loading="lazy" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded border text-xs text-muted-foreground">PDF</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ATTACHMENT_KIND_LABEL[a.kind]}</Badge>
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="font-medium break-all hover:underline">
                    {a.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground">{kb(a.sizeBytes)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.receivedAt && `受取 ${formatDate(todayOf(a.receivedAt))} ・ `}
                  追加 {formatDateTime(a.createdAt)} {a.uploaderName ?? ""}
                  {a.requestId && requestLabel.has(a.requestId) && ` ・ 回答元: ${requestLabel.get(a.requestId)}`}
                </p>
                {a.note && <p className="mt-1 text-xs">{a.note}</p>}
              </div>
              <ActionButton
                action={deleteAttachmentAction.bind(null, a.id)}
                confirm="削除しますか?"
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label={`${a.fileName} を削除`}
              >
                削除
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 日時を日本時間の YYYY-MM-DD にする
function todayOf(d: Date) {
  return todayInTokyo(d);
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
