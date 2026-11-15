"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";

export function MobileMenu({
  signedIn,
  dashboardHref,
  unreadCount,
}: {
  signedIn: boolean;
  dashboardHref: string;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex size-10 items-center justify-center rounded-md hover:bg-muted"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open && (
        <nav
          className="absolute right-0 z-40 mt-2 flex w-60 flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-lg"
          aria-label="Mobile menu"
        >
          <Link href="/explore" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Explore marketplace
          </Link>
          <Link href="/categories" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Categories
          </Link>
          <Link href="/sellers" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Verified sellers
          </Link>
          <Link href="/how-it-works" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            How it works
          </Link>
          <Link href="/become-a-seller" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium text-brand hover:bg-muted">
            Become a seller
          </Link>
          <Link href="/about" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            About cintiQ
          </Link>
          <Link href="/contact" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Support
          </Link>
          <div className="my-1 border-t border-border" />
          {signedIn ? (
            <>
              <Link href="/account/notifications" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
                Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Link>
              <Link href="/account/saved" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
                Saved products
              </Link>
              <Link href={dashboardHref} onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
                Dashboard
              </Link>
              <form action={logoutAction} onSubmit={close}>
                <Button variant="outline" type="submit" className="mt-1 w-full">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
                Sign in
              </Link>
              <Button asChild className="mt-1">
                <Link href="/register" onClick={close}>
                  Create account
                </Link>
              </Button>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
