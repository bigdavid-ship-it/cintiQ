"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell({
  userId,
  items: initialItems,
  unreadCount: initialUnreadCount,
}: {
  userId: string;
  items: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const ref = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPerm(Notification.permission);
    }
  }, []);

  useEffect(() => {
    setItems(initialItems);
    setUnreadCount(initialUnreadCount);
  }, [initialItems, initialUnreadCount]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new as NotificationItem;
          setItems((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev].slice(0, 12)));
          setUnreadCount((c) => c + 1);
          setToast(incoming);

          if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
            navigator.serviceWorker.ready
              .then((reg) =>
                reg.showNotification(incoming.title, {
                  body: incoming.body ?? "You have a new update on cintiQ.",
                  icon: "/icon.svg",
                  badge: "/icon.svg",
                  data: { url: incoming.link || "/account/notifications" },
                }),
              )
              .catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-md hover:bg-muted"
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-brand/30 bg-card p-3.5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <Link
              href={toast.link || "/account/notifications"}
              onClick={() => setToast(null)}
              className="min-w-0 flex-1 space-y-0.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">New notification</p>
              <p className="truncate text-sm font-medium text-foreground">{toast.title}</p>
              {toast.body && <p className="line-clamp-2 text-xs text-muted-foreground">{toast.body}</p>}
            </Link>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5 text-xs">
            <span className="font-display font-semibold">Notifications</span>
            <Link href="/account/notifications" onClick={() => setOpen(false)} className="text-brand hover:underline">
              View all
            </Link>
          </div>
          {pushPerm === "default" && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-brand-soft/40 px-3 py-2 text-[11px]">
              <span className="text-foreground">Get pop-out phone alerts</span>
              <button
                type="button"
                onClick={async () => {
                  const res = await Notification.requestPermission().catch(() => "default" as const);
                  setPushPerm(res);
                }}
                className="shrink-0 rounded bg-brand px-2 py-1 font-medium text-white"
              >
                Enable
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto text-xs">
              {items.map((n) => (
                <li key={n.id} className={!n.read_at ? "bg-brand-soft/30" : ""}>
                  <Link
                    href={n.link || "/account/notifications"}
                    onClick={() => setOpen(false)}
                    className="block space-y-0.5 p-3 hover:bg-muted/60"
                  >
                    <p className="font-medium text-foreground">{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-muted-foreground">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("en-NG")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border bg-muted/30 px-3 py-2 text-center text-xs">
            <Link href="/account/notifications" onClick={() => setOpen(false)} className="font-medium text-brand hover:underline">
              Open notification center
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
