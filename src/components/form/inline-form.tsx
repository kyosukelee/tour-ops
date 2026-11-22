"use client";
// 画面に置いたままの入力フォーム(タスク追加・コメントなど)。成功したら入力欄を空に戻す
import { useEffect, useRef, type ReactNode } from "react";
import { FormError } from "@/components/form/field";
import { useFormAction } from "@/components/form/use-form-action";
import { Button } from "@/components/ui/button";
import type { FormAction } from "./form-dialog";

export function InlineForm({
  action,
  submitLabel,
  className,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  className?: string;
  children: (fieldErrors: Record<string, string[]> | undefined) => ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const { state, onSubmit, pending, fieldErrors } = useFormAction(action);
  useEffect(() => {
    if (state.ok && state.data) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className={className} noValidate>
      <FormError state={state} />
      {children(fieldErrors)}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "保存しています…" : submitLabel}
      </Button>
    </form>
  );
}
