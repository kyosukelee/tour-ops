// 担当者管理(管理者のみ)
import { Suspense } from "react";
import type { Metadata } from "next";
import { KeyRoundIcon, PencilIcon, PlusIcon } from "lucide-react";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/app/actions/users";
import { Forbidden } from "@/components/app/forbidden";
import { Loading, PageHeader } from "@/components/app/page-header";
import { PasswordResetDialog, UserCreateDialog, UserEditDialog } from "@/components/users/user-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requireActor } from "@/lib/session";
import { cn, formatDateTime } from "@/lib/utils";
import { can } from "@/server/core";
import { listUsers } from "@/server/queries";

export const metadata: Metadata = { title: "担当者 | tour-ops" };

export default function UsersPage() {
  return (
    <>
      <PageHeader title="担当者" description="このアプリを使う社員。ログインはメールアドレスとパスワードで行います。" />
      <Suspense fallback={<Loading />}>
        <UserList />
      </Suspense>
    </>
  );
}

async function UserList() {
  const actor = await requireActor();
  if (!can(actor, "users.manage")) return <Forbidden />;
  const users = await listUsers(getDb());

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <UserCreateDialog
          action={createUserAction}
          trigger={
            <Button>
              <PlusIcon className="size-4" />
              担当者を追加
            </Button>
          }
        />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>権限</TableHead>
              <TableHead>最終ログイン</TableHead>
              <TableHead>
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={cn(!u.active && "text-muted-foreground")}>
                <TableCell>
                  <span className="font-medium">{u.name}</span>
                  {u.id === actor.id && <span className="ml-2 text-xs text-muted-foreground">(自分)</span>}
                  {!u.active && (
                    <Badge variant="outline" className="ml-2">
                      利用停止
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm break-all">{u.email}</TableCell>
                <TableCell className="text-sm">{u.role === "admin" ? "管理者" : "手配担当"}</TableCell>
                <TableCell className="text-xs tabular-nums">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <UserEditDialog
                    action={updateUserAction.bind(null, u.id)}
                    defaults={{ name: u.name, role: u.role, active: u.active, email: u.email }}
                    isSelf={u.id === actor.id}
                    trigger={
                      <Button size="sm" variant="ghost" aria-label={`${u.name} を編集`}>
                        <PencilIcon className="size-4" />
                      </Button>
                    }
                  />
                  <PasswordResetDialog
                    action={resetPasswordAction.bind(null, u.id)}
                    name={u.name}
                    trigger={
                      <Button size="sm" variant="ghost" aria-label={`${u.name} のパスワードを再設定`}>
                        <KeyRoundIcon className="size-4" />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
