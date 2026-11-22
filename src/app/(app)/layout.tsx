// ログイン後の画面の共通枠(左メニュー + 本文)。スマホでは上部の横並びメニューになる
import { Suspense } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { NavLinks, type NavItem } from "@/components/app/nav-links";
import { Button } from "@/components/ui/button";
import { requireActor } from "@/lib/session";
import { can } from "@/server/core";

const BASE_ITEMS: NavItem[] = [
  { href: "/", label: "ダッシュボード" },
  { href: "/projects", label: "案件" },
  { href: "/tasks", label: "タスク", ready: false },
  { href: "/agencies", label: "依頼元", ready: false },
  { href: "/suppliers", label: "仕入先", ready: false },
];
const ADMIN_ITEMS: NavItem[] = [
  { href: "/users", label: "担当者", ready: false },
  { href: "/audit", label: "操作ログ", ready: false },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <aside className="border-b bg-muted/30 md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
          <Link href="/" className="block">
            <span className="block text-xs text-muted-foreground">tour-ops</span>
            <span className="font-semibold">観光手配案件管理</span>
          </Link>
        </div>
        <Suspense fallback={<NavFallback />}>
          <Navigation />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

async function Navigation() {
  const actor = await requireActor();
  const items = can(actor, "users.manage") ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;
  return (
    <div className="flex flex-col gap-3 px-2 pb-3 md:h-[calc(100dvh-5rem)] md:justify-between md:pb-5">
      <div className="hidden md:block">
        <NavLinks items={items} orientation="vertical" />
      </div>
      <div className="md:hidden">
        <NavLinks items={items} orientation="horizontal" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-2 pt-3 text-sm md:block md:space-y-2">
        <p>
          {actor.name}
          <span className="ml-2 text-xs text-muted-foreground">{actor.role === "admin" ? "管理者" : "手配担当"}</span>
        </p>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            ログアウト
          </Button>
        </form>
      </div>
    </div>
  );
}

function NavFallback() {
  return <div className="h-10 px-4 md:h-64" aria-hidden />;
}
