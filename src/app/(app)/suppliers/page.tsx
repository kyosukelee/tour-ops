// 仕入先マスタ(宿・バス・観光タクシー・ガイド・食事・施設)
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon, PlusIcon } from "lucide-react";
import { createSupplierAction, updateSupplierAction } from "@/app/actions/masters";
import { Loading, PageHeader } from "@/components/app/page-header";
import { SupplierDialog } from "@/components/masters/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requireActor } from "@/lib/session";
import { ARRANGEMENT_CATEGORIES, CATEGORY_LABEL, type ArrangementCategory } from "@/lib/status";
import { cn } from "@/lib/utils";
import { listSuppliers } from "@/server/queries";

export const metadata: Metadata = { title: "仕入先 | tour-ops" };

export default function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  return (
    <>
      <PageHeader
        title="仕入先"
        description="手配を依頼する宿・バス会社・観光タクシー・ガイドなど"
        actions={
          <SupplierDialog
            title="仕入先を追加"
            action={createSupplierAction}
            trigger={
              <Button>
                <PlusIcon className="size-4" />
                仕入先を追加
              </Button>
            }
          />
        }
      />
      <Suspense fallback={<Loading />}>
        <SupplierList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SupplierList({ searchParams }: { searchParams: PageProps<"/suppliers">["searchParams"] }) {
  await requireActor();
  const sp = await searchParams;
  const category = ARRANGEMENT_CATEGORIES.includes(sp.category as ArrangementCategory) ? (sp.category as ArrangementCategory) : undefined;
  const showInactive = sp.inactive === "1";
  const all = await listSuppliers(getDb());
  const inCategory = all.filter((x) => !category || x.category === category);
  const rows = showInactive ? inCategory : inCategory.filter((x) => x.active);
  const hidden = inCategory.length - rows.length;

  const href = (c?: string, inactive = showInactive) => {
    const q = new URLSearchParams();
    if (c) q.set("category", c);
    if (inactive) q.set("inactive", "1");
    const s = q.toString();
    return s ? `/suppliers?${s}` : "/suppliers";
  };

  return (
    <div className="space-y-3">
      <nav aria-label="種別" className="flex flex-wrap gap-1 text-sm">
        {[undefined, ...ARRANGEMENT_CATEGORIES].map((c) => (
          <Link
            key={c ?? "all"}
            href={href(c)}
            aria-current={category === c ? "true" : undefined}
            className={cn("rounded-md border px-3 py-1", category === c ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60")}
          >
            {c ? CATEGORY_LABEL[c] : "すべて"}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        {rows.length}件
        {hidden > 0 && (
          <Link href={href(category, true)} className="ml-3 underline">
            利用停止の{hidden}件も表示
          </Link>
        )}
        {showInactive && (
          <Link href={href(category, false)} className="ml-3 underline">
            利用中だけ表示
          </Link>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>仕入先名</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>連絡先</TableHead>
              <TableHead>取消規定</TableHead>
              <TableHead className="text-right">手配件数</TableHead>
              <TableHead>
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.id} className={cn(!x.active && "text-muted-foreground")}>
                <TableCell>
                  <span className="font-medium">{x.name}</span>
                  {!x.active && (
                    <Badge variant="outline" className="ml-2">
                      利用停止
                    </Badge>
                  )}
                  {x.contactName && <span className="block text-xs text-muted-foreground">{x.contactName}</span>}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{CATEGORY_LABEL[x.category]}</TableCell>
                <TableCell className="text-xs">
                  {x.phone && <span className="block">TEL {x.phone}</span>}
                  {x.fax && <span className="block">FAX {x.fax}</span>}
                  {x.email && <span className="block break-all">{x.email}</span>}
                  {!x.fax && !x.email && <span className="text-destructive">FAX・メールが未登録</span>}
                </TableCell>
                <TableCell className="max-w-64 text-xs">{x.cancelPolicyNote ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{x.arrangementCount || "—"}</TableCell>
                <TableCell>
                  <SupplierDialog
                    title="仕入先を編集"
                    action={updateSupplierAction.bind(null, x.id)}
                    defaults={x}
                    trigger={
                      <Button size="sm" variant="ghost" aria-label={`${x.name} を編集`}>
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
