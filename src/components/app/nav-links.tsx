"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; ready?: boolean };

// 今いる画面のメニューを強調する
export function NavLinks({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <nav aria-label="メインメニュー" className={cn(orientation === "vertical" ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto")}>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        if (item.ready === false) {
          return (
            <span
              key={item.href}
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground/60"
              title="次の更新で追加します"
            >
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-accent",
              active && "bg-accent font-medium",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
