"use client";
// 手配明細の追加・編集(モーダル)。保存に成功したら閉じて、案件詳細を描き直す
import { useEffect, useState } from "react";
import { Field, FormError } from "@/components/form/field";
import { useFormAction } from "@/components/form/use-form-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  ARRANGEMENT_CATEGORIES,
  ARRANGEMENT_STATUSES,
  ARRANGEMENT_STATUS_LABEL,
  CATEGORY_LABEL,
  type ArrangementCategory,
  type ArrangementStatus,
} from "@/lib/status";
import type { ActionResult } from "@/server/action-utils";

export type SupplierOption = { id: string; name: string; category: ArrangementCategory; active: boolean };

export type ArrangementValues = {
  category: ArrangementCategory;
  serviceDate: string;
  serviceTime: string | null;
  supplierId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  status: ArrangementStatus;
  replyDue: string | null;
  cancelFeeFrom: string | null;
  confirmationNo: string | null;
  actualCost: number | null;
  invoiceReceived: boolean;
  cancelFee: number | null;
  meetingPlace: string | null;
  supplierNote: string | null;
  note: string | null;
};

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult<unknown>>;

export function ArrangementDialog({
  trigger,
  title,
  action,
  defaults,
  suppliers,
  canConfirm,
  cancelledOnly,
}: {
  trigger: React.ReactNode;
  title: string;
  action: Action;
  defaults: Partial<ArrangementValues>;
  suppliers: SupplierOption[];
  canConfirm: boolean;
  cancelledOnly?: boolean; // 失注・キャンセルの案件: 取消料と精算だけ記録できる
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="mb-4">
          {cancelledOnly ? "終了した案件のため、取消料と精算だけ記録できます。" : "* は必須項目です。日付は回答期限・取消料発生日のタスクにも使われます。"}
        </DialogDescription>
        <ArrangementForm
          action={action}
          defaults={defaults}
          suppliers={suppliers}
          canConfirm={canConfirm}
          cancelledOnly={cancelledOnly}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// モーダルを閉じるとフォームも消えるので、開くたびに入力・エラーが初期状態に戻る
function ArrangementForm({
  action,
  defaults,
  suppliers,
  canConfirm,
  cancelledOnly,
  onDone,
}: {
  action: Action;
  defaults: Partial<ArrangementValues>;
  suppliers: SupplierOption[];
  canConfirm: boolean;
  cancelledOnly?: boolean;
  onDone: () => void;
}) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(action);
  const [category, setCategory] = useState<ArrangementCategory>(defaults.category ?? "lodging");
  const [supplierId, setSupplierId] = useState(defaults.supplierId ?? "");

  useEffect(() => {
    if (state.ok && state.data) onDone();
  }, [state, onDone]);

  // 種別に合う仕入先だけを出す(利用停止の仕入先は、今選ばれているときだけ残す)
  const options = suppliers.filter((s) => s.category === category && (s.active || s.id === defaults.supplierId));
  const statusOptions = cancelledOnly ? (["cancelled"] as const) : ARRANGEMENT_STATUSES;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="種別" name="category" errors={fieldErrors} required>
          <NativeSelect
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ArrangementCategory);
              setSupplierId("");
            }}
          >
            {ARRANGEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="利用日" name="serviceDate" errors={fieldErrors} required>
          <Input type="date" defaultValue={defaults.serviceDate} />
        </Field>
        <Field label="時刻" name="serviceTime" errors={fieldErrors}>
          <Input type="time" defaultValue={defaults.serviceTime?.slice(0, 5) ?? ""} />
        </Field>
      </div>
      <Field label="仕入先" name="supplierId" errors={fieldErrors} hint={options.length === 0 ? "この種別の仕入先はまだ登録されていません" : undefined}>
        <NativeSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">未定</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {!s.active && "(利用停止)"}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="内容" name="description" errors={fieldErrors} required>
        <Input defaultValue={defaults.description} placeholder="例: 和室 4名1室 × 5室(1泊2食)" maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="数量" name="quantity" errors={fieldErrors} required>
          <Input type="number" min={1} inputMode="numeric" defaultValue={defaults.quantity ?? 1} />
        </Field>
        <Field label="原価(単価・税込)" name="unitCost" errors={fieldErrors} required>
          <Input type="number" min={0} inputMode="numeric" defaultValue={defaults.unitCost ?? 0} />
        </Field>
        <Field label="販売単価(税込)" name="unitPrice" errors={fieldErrors} required>
          <Input type="number" min={0} inputMode="numeric" defaultValue={defaults.unitPrice ?? 0} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="状態"
          name="status"
          errors={fieldErrors}
          hint={!canConfirm && !cancelledOnly ? "「確定」は受注(手配中)になってから選べます" : undefined}
        >
          <NativeSelect defaultValue={cancelledOnly ? "cancelled" : (defaults.status ?? "pending")}>
            {statusOptions.map((st) => (
              <option key={st} value={st} disabled={st === "confirmed" && !canConfirm && defaults.status !== "confirmed"}>
                {ARRANGEMENT_STATUS_LABEL[st]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="回答期限" name="replyDue" errors={fieldErrors}>
          <Input type="date" defaultValue={defaults.replyDue ?? ""} />
        </Field>
        <Field label="取消料発生日" name="cancelFeeFrom" errors={fieldErrors}>
          <Input type="date" defaultValue={defaults.cancelFeeFrom ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="確定番号(仕入先の予約番号)" name="confirmationNo" errors={fieldErrors}>
          <Input defaultValue={defaults.confirmationNo ?? ""} maxLength={100} />
        </Field>
        <Field label="集合・受け渡し場所" name="meetingPlace" errors={fieldErrors}>
          <Input defaultValue={defaults.meetingPlace ?? ""} maxLength={200} />
        </Field>
      </div>
      <Field label="仕入先への連絡事項" name="supplierNote" errors={fieldErrors} hint="手配依頼書に載ります">
        <Textarea rows={2} defaultValue={defaults.supplierNote ?? ""} maxLength={2000} />
      </Field>
      <Field label="社内メモ" name="note" errors={fieldErrors}>
        <Textarea rows={2} defaultValue={defaults.note ?? ""} maxLength={2000} />
      </Field>

      <details open={cancelledOnly || defaults.actualCost != null || defaults.cancelFee != null} className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">精算・取消料</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="精算額(実費)" name="actualCost" errors={fieldErrors} hint="空欄なら原価×数量で計算">
            <Input type="number" min={0} inputMode="numeric" defaultValue={defaults.actualCost ?? ""} />
          </Field>
          <Field label="取消料" name="cancelFee" errors={fieldErrors}>
            <Input type="number" min={0} inputMode="numeric" defaultValue={defaults.cancelFee ?? ""} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="invoiceReceived" defaultChecked={defaults.invoiceReceived ?? false} className="size-4" />
            請求書を受け取った
          </label>
        </div>
      </details>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "保存しています…" : "保存する"}
        </Button>
      </div>
    </form>
  );
}
