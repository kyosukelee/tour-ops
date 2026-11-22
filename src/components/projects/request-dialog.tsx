"use client";
// 手配依頼の作成モーダル: 仕入先 → 依頼の種類 → 手配を選び、PDF を確認してからメールで送る/FAX送付を記録する
import { useEffect, useState } from "react";
import { FileTextIcon, SendIcon } from "lucide-react";
import { Field, FormError } from "@/components/form/field";
import type { FormAction } from "@/components/form/form-dialog";
import { useFormAction } from "@/components/form/use-form-action";
import { ArrangementStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  REQUEST_KIND_LABEL,
  statusAfterRequest,
  type ArrangementStatus,
  type RequestKind,
  type RequestMethod,
} from "@/lib/status";
import { formatDate } from "@/lib/utils";

export type RequestSupplier = {
  id: string;
  name: string;
  email: string | null;
  fax: string | null;
  arrangements: { id: string; description: string; serviceDate: string; status: ArrangementStatus }[];
};

type SentData = { requestNo: string; method: RequestMethod; mailTo: string | null; mailRedirected: boolean; mailLogged: boolean };

export function RequestDialog({
  projectId,
  action,
  suppliers,
  kinds,
  unassignedCount,
  initialSupplierId,
  trigger,
}: {
  projectId: string;
  action: FormAction;
  suppliers: RequestSupplier[];
  kinds: readonly RequestKind[];
  unassignedCount: number;
  initialSupplierId?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<SentData | null>(null);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setSent(null);
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogTitle>手配依頼を作成</DialogTitle>
          <DialogDescription className="mb-4">
            仕入先ごとに依頼書(PDF)を作ります。送ると、選んだ手配は「依頼中」(取消依頼は「取消」)になります。
          </DialogDescription>
          <RequestForm
            projectId={projectId}
            action={action}
            suppliers={suppliers}
            kinds={kinds}
            unassignedCount={unassignedCount}
            initialSupplierId={initialSupplierId}
            onDone={(d) => {
              setSent(d);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
      {sent && (
        <p role="status" className="basis-full rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {sent.method === "email"
            ? `依頼 ${sent.requestNo} をメールで送りました(送信先: ${sent.mailTo}${sent.mailRedirected ? "。デモのため自分のアドレスに差し替えています" : ""})。`
            : `依頼 ${sent.requestNo} のFAX送付を記録しました。`}
          {sent.mailLogged && " ※ メール送信の設定(RESEND_API_KEY)がないため、実際には送らずサーバーのログに出しました。"}
        </p>
      )}
    </>
  );
}

function RequestForm({
  projectId,
  action,
  suppliers,
  kinds,
  unassignedCount,
  initialSupplierId,
  onDone,
}: {
  projectId: string;
  action: FormAction;
  suppliers: RequestSupplier[];
  kinds: readonly RequestKind[];
  unassignedCount: number;
  initialSupplierId?: string;
  onDone: (d: SentData) => void;
}) {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(action);
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? suppliers[0]?.id ?? "");
  const [kind, setKind] = useState<RequestKind>(kinds[0]);
  const supplier = suppliers.find((x) => x.id === supplierId);
  const [method, setMethod] = useState<RequestMethod>(supplier?.email ? "email" : "fax");
  const [note, setNote] = useState("");

  // 依頼の種類で選べる手配が変わる(取消依頼以外は、取消済みの手配を選べない)
  const eligibleOf = (sup: RequestSupplier | undefined, k: RequestKind) =>
    (sup?.arrangements ?? []).filter((a) => k === "cancel" || a.status !== "cancelled");
  // 最初は、送ると状態が進む手配(未手配など)を選んでおく
  const defaultSelection = (sup: RequestSupplier | undefined, k: RequestKind) =>
    new Set(eligibleOf(sup, k).filter((a) => statusAfterRequest(k, a.status) !== null).map((a) => a.id));
  const eligible = eligibleOf(supplier, kind);
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(supplier, kind));

  useEffect(() => {
    if (state.ok && state.data) onDone(state.data as SentData);
  }, [state, onDone]);

  const changeSupplier = (id: string) => {
    setSupplierId(id);
    const next = suppliers.find((x) => x.id === id);
    setMethod(next?.email ? "email" : "fax");
    setSelected(defaultSelection(next, kind));
  };
  const changeKind = (k: RequestKind) => {
    setKind(k);
    setSelected(defaultSelection(supplier, k));
  };

  if (suppliers.length === 0) {
    return (
      <p className="text-sm">
        仕入先が決まっている手配がありません。手配明細で仕入先を選んでから依頼してください。
      </p>
    );
  }

  const previewQuery = new URLSearchParams({ supplier: supplierId, kind, note });
  for (const id of selected) previewQuery.append("a", id);
  const ids = [...selected];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="仕入先" name="supplierId" errors={fieldErrors} required>
          <NativeSelect value={supplierId} onChange={(e) => changeSupplier(e.target.value)}>
            {suppliers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="依頼の種類" name="kind" errors={fieldErrors} required>
          <NativeSelect value={kind} onChange={(e) => changeKind(e.target.value as RequestKind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {REQUEST_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          依頼する手配<span className="ml-0.5 text-destructive">*</span>
        </legend>
        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">この仕入先に、この種類で依頼できる手配はありません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {eligible.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    name="arrangementIds"
                    value={a.id}
                    checked={selected.has(a.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(a.id);
                      else next.delete(a.id);
                      setSelected(next);
                    }}
                    className="size-4"
                  />
                  <span className="w-20 shrink-0 text-xs tabular-nums">{formatDate(a.serviceDate)}</span>
                  <span className="min-w-0 flex-1">{a.description}</span>
                  <ArrangementStatusBadge status={a.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
        {fieldErrors?.arrangementIds && <p className="text-xs text-destructive">{fieldErrors.arrangementIds[0]}</p>}
        {unassignedCount > 0 && (
          <p className="text-xs text-muted-foreground">仕入先が未定の手配が{unassignedCount}件あります。手配明細で仕入先を選ぶと、ここに出ます。</p>
        )}
      </fieldset>

      <Field label="通信欄" name="note" errors={fieldErrors} hint="依頼書の通信欄と、メールの本文に載ります">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>

      <Field label="送り方" name="method" errors={fieldErrors} required>
        <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as RequestMethod)}>
          <option value="email" disabled={!supplier?.email}>
            メール(PDFを添付){supplier?.email ? ` → ${supplier.email}` : "(メールアドレス未登録)"}
          </option>
          <option value="fax" disabled={!supplier?.fax}>
            FAX{supplier?.fax ? ` → ${supplier.fax}` : "(FAX番号未登録)"}
          </option>
        </NativeSelect>
      </Field>
      {method === "fax" && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">
          FAXはこのアプリからは送りません。「PDFを確認」で開いた依頼書を印刷するか、FAXソフトで送ったあとに記録してください。
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button asChild variant="outline" aria-disabled={ids.length === 0} className={ids.length === 0 ? "pointer-events-none opacity-50" : undefined}>
          <a href={`/api/projects/${projectId}/request-preview?${previewQuery.toString()}`} target="_blank" rel="noopener">
            <FileTextIcon className="size-4" />
            PDFを確認
          </a>
        </Button>
        <Button type="submit" disabled={pending || ids.length === 0}>
          <SendIcon className="size-4" />
          {pending ? "処理しています…" : method === "email" ? "メールで送る" : "FAXで送った記録をつける"}
        </Button>
      </div>
    </form>
  );
}
