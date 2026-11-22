"use client";
// 案件ステータスを進めるボタン。失注・キャンセルは押したあとにもう一度確認する
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DESTRUCTIVE_STATUSES,
  PROJECT_ACTION_LABEL,
  PROJECT_STATUS_LABEL,
  type ProjectStatus,
} from "@/lib/status";
import type { ActionResult } from "@/server/action-utils";

export function StatusActions({
  next,
  action,
}: {
  next: readonly ProjectStatus[];
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult<unknown>>;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult<unknown>, FormData>(action, { ok: true });
  const [confirming, setConfirming] = useState<ProjectStatus | null>(null);

  if (next.length === 0) return null;

  const submit = (to: ProjectStatus) => {
    const fd = new FormData();
    fd.set("to", to);
    setConfirming(null);
    startTransition(() => dispatch(fd));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {next.map((to) => {
          const destructive = DESTRUCTIVE_STATUSES.includes(to);
          return (
            <Button
              key={to}
              type="button"
              size="sm"
              variant={destructive ? "outline" : "default"}
              className={destructive ? "text-destructive" : undefined}
              disabled={pending}
              onClick={() => (destructive ? setConfirming(to) : submit(to))}
            >
              {PROJECT_ACTION_LABEL[to] ?? PROJECT_STATUS_LABEL[to]}
            </Button>
          );
        })}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="確認" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <span>
            「{PROJECT_STATUS_LABEL[confirming]}」にすると元に戻せません。よろしいですか?
          </span>
          <Button type="button" size="sm" variant="destructive" onClick={() => submit(confirming)}>
            {PROJECT_STATUS_LABEL[confirming]}にする
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
            やめる
          </Button>
        </div>
      )}
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
