"use client";
// 担当者の追加・編集・パスワード再設定(管理者のみ)
import type { ReactNode } from "react";
import { Field } from "@/components/form/field";
import { FormDialog, type FormAction } from "@/components/form/form-dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

function RoleField({ errors, value }: { errors?: Record<string, string[]>; value?: string }) {
  return (
    <Field label="権限" name="role" errors={errors} hint="管理者は担当者の管理と操作ログの閲覧ができます">
      <NativeSelect defaultValue={value ?? "staff"}>
        <option value="staff">手配担当</option>
        <option value="admin">管理者</option>
      </NativeSelect>
    </Field>
  );
}

function PasswordField({ errors, label }: { errors?: Record<string, string[]>; label: string }) {
  return (
    <Field label={label} name="password" errors={errors} required hint="10文字以上。本人には別の方法(口頭など)で伝えてください">
      <Input type="password" autoComplete="new-password" minLength={10} />
    </Field>
  );
}

export function UserCreateDialog({ trigger, action }: { trigger: ReactNode; action: FormAction }) {
  return (
    <FormDialog trigger={trigger} title="担当者を追加" action={action} submitLabel="追加する">
      {(errors) => (
        <>
          <Field label="氏名" name="name" errors={errors} required>
            <Input maxLength={100} />
          </Field>
          <Field label="メールアドレス(ログインID)" name="email" errors={errors} required>
            <Input type="email" autoComplete="off" />
          </Field>
          <RoleField errors={errors} />
          <PasswordField errors={errors} label="初期パスワード" />
        </>
      )}
    </FormDialog>
  );
}

export function UserEditDialog({
  trigger,
  action,
  defaults,
  isSelf,
}: {
  trigger: ReactNode;
  action: FormAction;
  defaults: { name: string; role: string; active: boolean; email: string };
  isSelf: boolean;
}) {
  return (
    <FormDialog trigger={trigger} title="担当者を編集" description={defaults.email} action={action}>
      {(errors) => (
        <>
          <Field label="氏名" name="name" errors={errors} required>
            <Input defaultValue={defaults.name} maxLength={100} />
          </Field>
          <RoleField errors={errors} value={defaults.role} />
          <Field
            label="状態"
            name="active"
            errors={errors}
            hint={isSelf ? "自分自身は利用停止にできません" : "利用停止にすると、すぐにログアウトされ、ログインできなくなります"}
          >
            <NativeSelect defaultValue={defaults.active ? "true" : "false"}>
              <option value="true">利用中</option>
              <option value="false">利用停止</option>
            </NativeSelect>
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function PasswordResetDialog({ trigger, action, name }: { trigger: ReactNode; action: FormAction; name: string }) {
  return (
    <FormDialog
      trigger={trigger}
      title="パスワードを再設定"
      description={`${name} さんの新しいパスワードを設定します。使用中の端末はすべてログアウトされます。`}
      action={action}
      submitLabel="再設定する"
    >
      {(errors) => <PasswordField errors={errors} label="新しいパスワード" />}
    </FormDialog>
  );
}
