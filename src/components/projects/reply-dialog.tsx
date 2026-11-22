"use client";
// 仕入先からの回答を入力するモーダル(手配ごとに 仮押さえ / 確定 / 手配不可、確定番号、原価)
import { FormDialog, type FormAction } from "@/components/form/form-dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ArrangementStatus } from "@/lib/status";
import { formatDate, formatYen } from "@/lib/utils";

export type ReplyItem = {
  id: string;
  description: string;
  serviceDate: string;
  status: ArrangementStatus;
  confirmationNo: string | null;
  unitCost: number;
};

export function ReplyDialog({
  action,
  supplierName,
  items,
  canConfirm,
  trigger,
}: {
  action: FormAction;
  supplierName: string;
  items: ReplyItem[];
  canConfirm: boolean;
  trigger: React.ReactNode;
}) {
  const open = items.filter((i) => i.status !== "cancelled");
  return (
    <FormDialog
      trigger={trigger}
      title="回答を入力"
      description={`${supplierName} からの回答(FAX・メール)を手配明細に反映します。${canConfirm ? "" : "受注前のため「確定」は選べません。"}`}
      action={action}
      submitLabel="回答を反映する"
    >
      {() => (
        <ul className="space-y-3">
          {open.map((it) => (
            <li key={it.id} className="rounded-md border p-3">
              <input type="hidden" name="arrangementId" value={it.id} />
              <p className="mb-2 text-sm">
                <span className="mr-2 text-xs text-muted-foreground">{formatDate(it.serviceDate)}</span>
                {it.description}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">回答</span>
                  <NativeSelect name={`result:${it.id}`} defaultValue={canConfirm ? "confirmed" : "tentative"} aria-label={`${it.description} の回答`}>
                    <option value="confirmed" disabled={!canConfirm}>
                      確定
                    </option>
                    <option value="tentative">仮押さえ</option>
                    <option value="declined">手配不可(未手配に戻す)</option>
                  </NativeSelect>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">確定番号</span>
                  <Input name={`confirmationNo:${it.id}`} defaultValue={it.confirmationNo ?? ""} maxLength={100} aria-label={`${it.description} の確定番号`} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">原価(単価・税込)</span>
                  <Input
                    name={`unitCost:${it.id}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder={`今: ${formatYen(it.unitCost)}`}
                    aria-label={`${it.description} の原価`}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FormDialog>
  );
}
