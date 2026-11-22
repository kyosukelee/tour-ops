// ラベル・入力欄・エラーをまとめた入力項目
import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  name,
  errors,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  name: string;
  errors?: Record<string, string[]>;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<{ id?: string; name?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
}) {
  const message = errors?.[name]?.[0];
  const describedBy = message ? `${name}-error` : hint ? `${name}-hint` : undefined;
  const control = React.cloneElement(children, {
    id: children.props.id ?? name,
    name: children.props.name ?? name,
    "aria-invalid": !!message || undefined,
    "aria-describedby": describedBy,
  });
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={children.props.id ?? name}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {control}
      {message ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {message}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ state }: { state: { ok: boolean; error?: string } }) {
  if (state.ok || !state.error) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {state.error}
    </p>
  );
}
