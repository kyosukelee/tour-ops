"use client";
// 案件詳細のタスク追加フォームとコメント入力欄
import { Field } from "@/components/form/field";
import type { FormAction } from "@/components/form/form-dialog";
import { InlineForm } from "@/components/form/inline-form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function TaskAddForm({
  action,
  users,
  defaultDue,
}: {
  action: FormAction;
  users: { id: string; name: string }[];
  defaultDue: string;
}) {
  return (
    <InlineForm action={action} submitLabel="タスクを追加" className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
      {(errors) => (
        <>
          <Field label="内容" name="title" errors={errors} required>
            <Input placeholder="例: 依頼元へ最終行程表を送る" maxLength={200} />
          </Field>
          <Field label="期限" name="dueDate" errors={errors} required>
            <Input type="date" defaultValue={defaultDue} />
          </Field>
          <Field label="担当" name="assigneeUserId" errors={errors}>
            <NativeSelect defaultValue="">
              <option value="">案件の担当者</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      )}
    </InlineForm>
  );
}

export function CommentForm({ action }: { action: FormAction }) {
  return (
    <InlineForm action={action} submitLabel="コメントを残す" className="space-y-2">
      {(errors) => (
        <Field label="コメント" name="body" errors={errors} hint="依頼元・仕入先とのやり取りや、引き継ぎのメモ。あとから編集・削除はできません">
          <Textarea rows={3} maxLength={2000} />
        </Field>
      )}
    </InlineForm>
  );
}
