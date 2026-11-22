"use client";
// Server Action をフォームから呼ぶ共通フック
// React 19 の <form action> は送信後に入力欄を空に戻すため、
// エラーで入力をやり直すときに打った内容が消えないよう onSubmit から呼ぶ
import { startTransition, useActionState, type FormEvent } from "react";
import type { ActionResult } from "@/server/action-utils";

type Action<T> = (prev: ActionResult<T>, formData: FormData) => Promise<ActionResult<T>>;

export function useFormAction<T>(action: Action<T>) {
  const [state, dispatch, pending] = useActionState<ActionResult<T>, FormData>(action, { ok: true });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(formData));
  };
  const fieldErrors = state.ok ? undefined : state.fieldErrors;
  return { state, onSubmit, pending, fieldErrors, dispatch };
}
