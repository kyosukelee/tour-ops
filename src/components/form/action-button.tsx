"use client";
// 1回押すだけの操作(タスクの完了・削除など)。失敗したら理由をボタンの横に出す
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/action-utils";
import type { FormAction } from "./form-dialog";

export function ActionButton({
  action,
  fields = {},
  confirm,
  children,
  ...buttonProps
}: {
  action: FormAction;
  fields?: Record<string, string>;
  confirm?: string; // 指定すると、押したあとに確認の文言とボタンを出す
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "action" | "onClick" | "children">) {
  const [state, dispatch, pending] = useActionState<ActionResult<unknown>, FormData>(action, { ok: true });
  const [confirming, setConfirming] = useState(false);

  const run = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setConfirming(false);
    startTransition(() => dispatch(fd));
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirming ? (
        <span role="alertdialog" aria-label="確認" className="inline-flex items-center gap-1 text-xs">
          {confirm}
          <Button type="button" size="sm" variant="destructive" onClick={run}>
            はい
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            やめる
          </Button>
        </span>
      ) : (
        <Button type="button" disabled={pending} onClick={() => (confirm ? setConfirming(true) : run())} {...buttonProps}>
          {children}
        </Button>
      )}
      {!state.ok && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </span>
  );
}
