// 依頼元(旅行会社)マスタ
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon, PlusIcon } from "lucide-react";
import { createAgencyAction, updateAgencyAction } from "@/app/actions/masters";
import { Loading, PageHeader } from "@/components/app/page-header";
import { AgencyDialog } from "@/components/masters/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requireActor } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listAgencies } from "@/server/queries";

export const metadata: Metadata = { title: "依頼元 | tour-ops" };

export default function AgenciesPage({ searchParams }: PageProps<"/agencies">) {
  return (
    <>
      <PageHeader
        title="依頼元"
        description="手配を依頼してくる旅行会社"
        actions={
          <AgencyDialog
            title="依頼元を追加"
            action={createAgencyAction}
            trigger={
              <Button>
                <PlusIcon className="size-4" />
                依頼元を追加
              </Button>
            }
          />
        }
      />
      <Suspense fallback={<Loading />}>
        <AgencyList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AgencyList({ searchParams }: { searchParams: PageProps<"/agencies">["searchParams"] }) {
  await requireActor();
  const { inactive } = await searchParams;
  const showInactive = inactive === "1";
  const all = await listAgencies(getDb());
  const rows = showInactive ? all : all.filter((a) => a.active);
  const hidden = all.length - rows.length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {rows.length}件
        {hidden > 0 && (
          <Link href="/agencies?inactive=1" className="ml-3 underline">
            利用停止の{hidden}件も表示
          </Link>
        )}
        {showInactive && (
          <Link href="/agencies" className="ml-3 underline">
            利用中だけ表示
          </Link>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>会社名</TableHead>
              <TableHead>担当者</TableHead>
              <TableHead>連絡先</TableHead>
              <TableHead className="text-right">進行中の案件</TableHead>
              <TableHead>
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id} className={cn(!a.active && "text-muted-foreground")}>
                <TableCell>
                  <span className="font-medium">{a.name}</span>
                  {!a.active && (
                    <Badge variant="outline" className="ml-2">
                      利用停止
                    </Badge>
                  )}
                  {a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}
                </TableCell>
                <TableCell className="text-sm">{a.contactName ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {a.phone && <span className="block">TEL {a.phone}</span>}
                  {a.fax && <span className="block">FAX {a.fax}</span>}
                  {a.email && <span className="block break-all">{a.email}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.openProjects > 0 ? (
                    <Link href={`/projects?agency=${a.id}`} className="underline">
                      {a.openProjects}件
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <AgencyDialog
                    title="依頼元を編集"
                    action={updateAgencyAction.bind(null, a.id)}
                    defaults={a}
                    trigger={
                      <Button size="sm" variant="ghost" aria-label={`${a.name} を編集`}>
                        <PencilIcon className="size-4" />
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
