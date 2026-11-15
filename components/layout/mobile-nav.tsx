"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, Package, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/account", label: "Account", icon: User },
] as const;

export function MobileNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 transform-gpu border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? path === "/"
              : href === "/explore"
                ? path === "/explore" || path.startsWith("/explore/") || path === "/shop" || path === "/categories"
                : path === href || path.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors",
                  active ? "font-semibold text-brand" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {active && <span aria-hidden className="absolute top-0 h-1 w-10 rounded-b-full bg-brand" />}
                <span className={cn("flex items-center justify-center rounded-full px-3.5 py-1 transition-colors", active && "bg-brand text-white shadow-xs")}>
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
