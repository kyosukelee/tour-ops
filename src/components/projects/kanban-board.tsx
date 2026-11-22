"use client";
// 案件のカンバン(ステータスごとの列)。カードをドラッグして、許された列にだけ移せる
// 手配中⇔手配完了は手配明細から自動で決まるので、手で「手配完了」には動かせない
import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import { changeProjectStatusAction } from "@/app/actions/projects";
import { nextProjectStatuses, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/status";
import { cn, formatDateRange } from "@/lib/utils";

export type KanbanCard = {
  id: string;
  code: string;
  title: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  agencyName: string;
  ownerName: string | null;
  activeCount: number;
  confirmedCount: number;
};

const COLUMNS: ProjectStatus[] = ["inquiry", "quoting", "quoted", "arranging", "arranged", "operating", "settling"];

export function KanbanBoard({ cards }: { cards: KanbanCard[] }) {
  const [items, moveOptimistic] = useOptimistic(cards, (state, move: { id: string; to: ProjectStatus }) =>
    state.map((c) => (c.id === move.id ? { ...c, status: move.to } : c)),
  );
  const [dragging, setDragging] = useState<KanbanCard | null>(null);
  const [over, setOver] = useState<ProjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = dragging ? nextProjectStatuses(dragging.status) : [];

  const drop = (to: ProjectStatus) => {
    const card = dragging;
    setDragging(null);
    setOver(null);
    if (!card || card.status === to || !allowed.includes(to)) return;
    setError(null);
    const fd = new FormData();
    fd.set("to", to);
    startTransition(async () => {
      moveOptimistic({ id: card.id, to });
      const result = await changeProjectStatusAction(card.id, { ok: true }, fd);
      if (!result.ok) setError(`${card.title}: ${result.error}`);
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        カードをドラッグすると、ステータスを進められます(移せる列だけ色が付きます)。失注・キャンセルや細かい操作は案件詳細から行います。
      </p>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((col) => {
          const colCards = items.filter((c) => c.status === col);
          const canDrop = allowed.includes(col);
          return (
            <section
              key={col}
              aria-label={`${PROJECT_STATUS_LABEL[col]} ${colCards.length}件`}
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(col);
              }}
              className={cn(
                "flex min-w-44 flex-1 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
                dragging && canDrop && "border-blue-400 bg-blue-50/60",
                dragging && !canDrop && dragging.status !== col && "opacity-50",
                over === col && "ring-2 ring-blue-400",
              )}
            >
              <h2 className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                {PROJECT_STATUS_LABEL[col]}
                <span className="text-xs font-normal text-muted-foreground">{colCards.length}</span>
              </h2>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {colCards.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.id);
                      setDragging(c);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      "cursor-grab rounded-md border bg-background p-2.5 text-sm shadow-xs active:cursor-grabbing",
                      dragging?.id === c.id && "opacity-40",
                    )}
                  >
                    <Link href={`/projects/${c.id}`} className="font-medium hover:underline" draggable={false}>
                      {c.title}
                    </Link>
                    <p className="font-mono text-[11px] text-muted-foreground">{c.code}</p>
                    <p className="mt-1 text-xs">{formatDateRange(c.startDate, c.endDate)}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.agencyName}</p>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{c.ownerName ?? "担当未定"}</span>
                      {c.activeCount > 0 && (
                        <span className={cn("tabular-nums", c.confirmedCount === c.activeCount ? "text-emerald-700" : "text-muted-foreground")}>
                          確定 {c.confirmedCount}/{c.activeCount}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
