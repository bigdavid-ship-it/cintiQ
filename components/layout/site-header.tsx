import Link from "next/link";
import { Menu, Search, ShoppingCart } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { NotificationBell, type NotificationItem } from "@/components/layout/notification-bell";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/lib/auth/actions";
import { homeForRoles } from "@/lib/auth/roles";

export async function SiteHeader() {
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const user = configured ? await getSessionUser() : null;

  let cartCount = 0;
  let unreadCount = 0;
  let recentNotifications: NotificationItem[] = [];

  if (configured && user) {
    const supabase = await createClient();
    const [{ data: cart }, { count: unread }, { data: notes }] = await Promise.all([
      supabase.from("carts").select("id, cart_items(quantity)").eq("user_id", user.id).maybeSingle(),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    const items = (cart as { cart_items?: { quantity: number }[] } | null)?.cart_items ?? [];
    cartCount = items.reduce((sum, i) => sum + i.quantity, 0);
    unreadCount = unread ?? 0;
    recentNotifications = (notes ?? []) as NotificationItem[];
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />

        <form action="/explore" className="hidden max-w-sm flex-1 lg:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              name="q"
              type="search"
              placeholder="Search campus products..."
              aria-label="Search products"
              className="h-9 w-full rounded-full border border-border bg-muted/40 pl-9 pr-3 text-sm focus:bg-card"
            />
          </div>
        </form>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <Link href="/explore" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Explore</Link>
          <Link href="/categories" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Categories</Link>
          {!user?.roles.includes("seller") && (
            <Link href="/become-a-seller" className="rounded-md px-3 py-2 text-sm font-medium text-brand hover:bg-brand-soft/60">Sell</Link>
          )}
          {user ? (
            <>
              <NotificationBell userId={user.id} items={recentNotifications} unreadCount={unreadCount} />
              <Link href="/cart" aria-label="Shopping cart" className="relative inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium hover:bg-muted">
                <ShoppingCart className="size-4" aria-hidden />
                {cartCount > 0 && (
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              <Link href={homeForRoles(user.roles)} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Dashboard</Link>
              <form action={logoutAction}><Button variant="outline" type="submit" className="h-9 px-3 text-xs">Sign out</Button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Sign in</Link>
              <Button asChild className="h-9"><Link href="/register">Get started</Link></Button>
            </>
          )}
        </nav>

        {/* Mobile right-side actions: Notifications + Cart near hamburger menu */}
        <div className="flex items-center gap-1 md:hidden">
          {user && <NotificationBell userId={user.id} items={recentNotifications} unreadCount={unreadCount} />}
          <Link
            href="/cart"
            aria-label={`Shopping cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
            className="relative flex size-10 items-center justify-center rounded-md hover:bg-muted"
          >
            <ShoppingCart className="size-5" aria-hidden />
            {cartCount > 0 && (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>

          <details className="relative">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted" aria-label="Open menu">
              <Menu className="size-5" />
            </summary>
            <nav className="absolute right-0 mt-2 flex w-60 flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-lg" aria-label="Mobile menu">
              <Link href="/explore" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Explore marketplace</Link>
              <Link href="/categories" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Categories</Link>
              <Link href="/become-a-seller" className="rounded-md px-3 py-2 text-sm font-medium text-brand hover:bg-muted">Become a seller</Link>
              <Link href="/about" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">About cintiQ</Link>
              <Link href="/contact" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Support</Link>
              <div className="my-1 border-t border-border" />
              {user ? (
                <>
                  <Link href="/account/notifications" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
                    Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
                  </Link>
                  <Link href="/account/saved" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Saved products</Link>
                  <Link href={homeForRoles(user.roles)} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Dashboard</Link>
                  <form action={logoutAction}><Button variant="outline" type="submit" className="mt-1 w-full">Sign out</Button></form>
                </>
              ) : (
                <>
                  <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">Sign in</Link>
                  <Button asChild className="mt-1"><Link href="/register">Create account</Link></Button>
                </>
              )}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
