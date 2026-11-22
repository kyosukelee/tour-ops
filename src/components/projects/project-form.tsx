"use client";
// 案件の登録・編集フォーム(保存に成功するとサーバー側で案件詳細へ移る)
import Link from "next/link";
import { Field, FormError } from "@/components/form/field";
import { useFormAction } from "@/components/form/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/server/action-utils";

type Option = { id: string; name: string };

export type ProjectFormValues = {
  title: string;
  agencyId: string;
  startDate: string;
  endDate: string;
  paxAdult: number;
  paxChild: number;
  language: string | null;
  ownerUserId: string | null;
  note: string | null;
};

export function ProjectForm({
  action,
  defaults,
  agencies,
  users,
  cancelHref,
  submitLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult<unknown>>;
  defaults: Partial<ProjectFormValues>;
  agencies: Option[];
  users: Option[];
  cancelHref: string;
  submitLabel: string;
}) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(action);

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-5" noValidate>
      <FormError state={state} />
      <Field label="ツアー名" name="title" errors={fieldErrors} required>
        <Input defaultValue={defaults.title} placeholder="例: 秋の日帰り研修 バスツアー" maxLength={200} />
      </Field>
      <Field label="依頼元" name="agencyId" errors={fieldErrors} required>
        <NativeSelect defaultValue={defaults.agencyId ?? ""}>
          <option value="" disabled>
            選んでください
          </option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="出発日" name="startDate" errors={fieldErrors} required>
          <Input type="date" defaultValue={defaults.startDate} />
        </Field>
        <Field label="帰着日" name="endDate" errors={fieldErrors} required>
          <Input type="date" defaultValue={defaults.endDate} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="人数(大人)" name="paxAdult" errors={fieldErrors}>
          <Input type="number" min={0} inputMode="numeric" defaultValue={defaults.paxAdult ?? 0} />
        </Field>
        <Field label="人数(子ども)" name="paxChild" errors={fieldErrors}>
          <Input type="number" min={0} inputMode="numeric" defaultValue={defaults.paxChild ?? 0} />
        </Field>
        <Field label="案内言語" name="language" errors={fieldErrors} hint="例: 日本語、英語、韓国語">
          <Input defaultValue={defaults.language ?? ""} maxLength={50} />
        </Field>
      </div>
      <Field label="担当者" name="ownerUserId" errors={fieldErrors} hint="空欄のときは登録した人が担当になります">
        <NativeSelect defaultValue={defaults.ownerUserId ?? ""}>
          <option value="">(登録した人)</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="メモ" name="note" errors={fieldErrors} hint="依頼書に書かれた要望や、社内向けの注意点">
        <Textarea rows={4} defaultValue={defaults.note ?? ""} maxLength={2000} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "保存しています…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>キャンセル</Link>
        </Button>
      </div>
    </form>
  );
}
