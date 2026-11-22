"use client";
// フォーム入りのモーダル。保存に成功したら閉じる(一覧は Server Action の refresh で描き直される)
import { useEffect, useState, type ReactNode } from "react";
import { FormError } from "@/components/form/field";
import { useFormAction } from "@/components/form/use-form-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/server/action-utils";

export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult<unknown>>;

export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "保存する",
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  action: FormAction;
  submitLabel?: string;
  children: (fieldErrors: Record<string, string[]> | undefined) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="mb-4">{description ?? "* は必須項目です。"}</DialogDescription>
        <DialogForm action={action} submitLabel={submitLabel} onDone={() => setOpen(false)}>
          {children}
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function DialogForm({
  action,
  submitLabel,
  onDone,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  onDone: () => void;
  children: (fieldErrors: Record<string, string[]> | undefined) => ReactNode;
}) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(action);
  useEffect(() => {
    if (state.ok && state.data) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError state={state} />
      {children(fieldErrors)}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "保存しています…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
