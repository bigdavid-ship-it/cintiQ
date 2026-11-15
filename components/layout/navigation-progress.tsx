"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Branded top progress bar + subtle transition pill when navigating between routes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || anchor.target === "_blank") return;
      if (href === pathname) return;
      setNavigating(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);

  if (!navigating) return null;

  return (
    <div aria-live="polite" aria-label="Loading page" className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="h-0.5 w-full overflow-hidden bg-brand-soft">
        <div className="nav-progress-bar h-full bg-gradient-to-r from-brand via-accent to-brand" />
      </div>
      <div className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-xs font-medium shadow-md backdrop-blur">
        <span className="inline-block size-2 animate-ping rounded-full bg-brand" />
        <span>cintiQ</span>
      </div>
    </div>
  );
}
