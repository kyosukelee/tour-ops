"use client";
// 依頼元・仕入先の追加・編集モーダル
import type { ReactNode } from "react";
import { Field } from "@/components/form/field";
import { FormDialog, type FormAction } from "@/components/form/form-dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ARRANGEMENT_CATEGORIES, CATEGORY_LABEL, type ArrangementCategory } from "@/lib/status";

type Contact = {
  contactName: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  active: boolean;
};

export type AgencyValues = Contact & { name: string; note: string | null };
export type SupplierValues = Contact & { name: string; category: ArrangementCategory; cancelPolicyNote: string | null };

function ContactFields({ errors, d }: { errors?: Record<string, string[]>; d: Partial<Contact> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="担当者名" name="contactName" errors={errors}>
          <Input defaultValue={d.contactName ?? ""} maxLength={100} />
        </Field>
        <Field label="メールアドレス" name="email" errors={errors}>
          <Input type="email" defaultValue={d.email ?? ""} />
        </Field>
        <Field label="電話" name="phone" errors={errors}>
          <Input type="tel" defaultValue={d.phone ?? ""} />
        </Field>
        <Field label="FAX" name="fax" errors={errors} hint="手配依頼書をFAXで送る相手は必須です">
          <Input type="tel" defaultValue={d.fax ?? ""} />
        </Field>
      </div>
    </>
  );
}

// 削除はせず「利用停止」にする(過去の案件から参照されているため)
function ActiveField({ errors, d }: { errors?: Record<string, string[]>; d: Partial<Contact> }) {
  return (
    <Field label="状態" name="active" errors={errors} hint="利用停止にすると、新しい案件・手配の選択肢に出なくなります">
      <NativeSelect defaultValue={d.active === false ? "false" : "true"}>
        <option value="true">利用中</option>
        <option value="false">利用停止</option>
      </NativeSelect>
    </Field>
  );
}

export function AgencyDialog({ trigger, title, action, defaults = {} }: { trigger: ReactNode; title: string; action: FormAction; defaults?: Partial<AgencyValues> }) {
  return (
    <FormDialog trigger={trigger} title={title} action={action}>
      {(errors) => (
        <>
          <Field label="会社名" name="name" errors={errors} required>
            <Input defaultValue={defaults.name} maxLength={200} />
          </Field>
          <ContactFields errors={errors} d={defaults} />
          <Field label="メモ" name="note" errors={errors}>
            <Textarea rows={2} defaultValue={defaults.note ?? ""} maxLength={2000} />
          </Field>
          <ActiveField errors={errors} d={defaults} />
        </>
      )}
    </FormDialog>
  );
}

export function SupplierDialog({ trigger, title, action, defaults = {} }: { trigger: ReactNode; title: string; action: FormAction; defaults?: Partial<SupplierValues> }) {
  return (
    <FormDialog trigger={trigger} title={title} action={action}>
      {(errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field label="仕入先名" name="name" errors={errors} required>
              <Input defaultValue={defaults.name} maxLength={200} />
            </Field>
            <Field label="種別" name="category" errors={errors} required>
              <NativeSelect defaultValue={defaults.category ?? "lodging"}>
                {ARRANGEMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <ContactFields errors={errors} d={defaults} />
          <Field label="取消規定" name="cancelPolicyNote" errors={errors} hint="例: 14日前から20%、7日前から50%">
            <Textarea rows={2} defaultValue={defaults.cancelPolicyNote ?? ""} maxLength={2000} />
          </Field>
          <ActiveField errors={errors} d={defaults} />
        </>
      )}
    </FormDialog>
  );
}
