"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  const pathname = usePathname();
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const check = () => {
      const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(mq.matches || iosStandalone);
    };
    check();
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, []);

  if (isAuthPage) {
    return (
      <footer className="border-t border-border bg-card px-4 py-4 text-center text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
          <span>
            Powered by <span className="font-medium text-foreground">Ezeilo David Chisom</span>
          </span>
          <a
            href="https://dave-s-portfolio-ten.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand transition-colors hover:border-brand hover:bg-brand hover:text-white"
          >
            Developer Portfolio
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </p>
      </footer>
    );
  }

  if (isStandalone && pathname !== "/") return null;

  return (
    <footer className="mt-20 border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-xs font-medium text-foreground">Your Campus. Your Marketplace.</p>
          <p className="text-xs text-muted-foreground">
            Connecting students with verified student entrepreneurs and local businesses around Nigerian university campuses.
          </p>
        </div>

        <div>
          <h3 className="font-display mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marketplace</h3>
          <ul className="space-y-2">
            <li><Link href="/explore" className="hover:text-brand">Explore products</Link></li>
            <li><Link href="/categories" className="hover:text-brand">All categories</Link></li>
            <li><Link href="/cart" className="hover:text-brand">Shopping cart</Link></li>
            <li><Link href="/orders" className="hover:text-brand">Track orders</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sell on cintiQ</h3>
          <ul className="space-y-2">
            <li><Link href="/become-a-seller" className="hover:text-brand">Become a seller</Link></li>
            <li><Link href="/seller" className="hover:text-brand">Seller dashboard</Link></li>
            <li><Link href="/seller/finance" className="hover:text-brand">Commissions &amp; settlements</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company &amp; Support</h3>
          <ul className="space-y-2">
            <li><Link href="/about" className="hover:text-brand">About cintiQ</Link></li>
            <li><Link href="/how-it-works" className="hover:text-brand">How it works</Link></li>
            <li><Link href="/contact" className="hover:text-brand">Customer support</Link></li>
            <li><Link href="/account/notifications" className="hover:text-brand">Notifications</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} cintiQ. All rights reserved.
      </div>
    </footer>
  );
}
