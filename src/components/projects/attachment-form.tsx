"use client";
// 添付書類の追加フォーム(PDF・写真、4MBまで)
import { Field } from "@/components/form/field";
import type { FormAction } from "@/components/form/form-dialog";
import { InlineForm } from "@/components/form/inline-form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ATTACHMENT_KINDS, ATTACHMENT_KIND_LABEL } from "@/lib/status";

export function AttachmentForm({
  action,
  requests,
  today,
}: {
  action: FormAction;
  requests: { id: string; label: string }[];
  today: string;
}) {
  return (
    <InlineForm action={action} submitLabel="添付する" className="space-y-3 rounded-lg border p-3">
      {(errors) => (
        <>
          <Field label="ファイル(PDF・JPEG・PNG・WebP、4MBまで)" name="file" errors={errors} required>
            <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="h-auto py-1.5" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="書類の種類" name="kind" errors={errors} required>
              <NativeSelect defaultValue="request">
                {ATTACHMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ATTACHMENT_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="受け取った日" name="receivedAt" errors={errors}>
              <Input type="date" defaultValue={today} />
            </Field>
            <Field label="どの手配依頼への回答か" name="requestId" errors={errors} hint="仕入先の回答のとき">
              <NativeSelect defaultValue="">
                <option value="">(指定しない)</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="メモ" name="note" errors={errors}>
            <Input maxLength={500} placeholder="例: 人数変更(32名→30名)のFAX" />
          </Field>
        </>
      )}
    </InlineForm>
  );
}
