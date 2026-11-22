"use client";

import { login } from "@/app/actions/auth";
import { useFormAction } from "@/components/form/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const { state, onSubmit, pending, fieldErrors } = useFormAction(login);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required aria-invalid={!!fieldErrors?.email} />
        {fieldErrors?.email && <p className="text-xs text-destructive">{fieldErrors.email[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">パスワード</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!fieldErrors?.password} />
        {fieldErrors?.password && <p className="text-xs text-destructive">{fieldErrors.password[0]}</p>}
      </div>
      {!state.ok && !fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
    </form>
  );
}
