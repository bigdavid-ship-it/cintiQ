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

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function syncPushSubscription() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }
    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
    }
  } catch {
    // Ignore push subscription errors on unsupported browsers
  }
}

export function NotificationBell({
  userId,
  items: initialItems,
  unreadCount: initialUnreadCount,
  showPrompt = false,
}: {
  userId: string;
  items: NotificationItem[];
  unreadCount: number;
  showPrompt?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(display-mode: standalone)");
    const standalone =
      mq.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    if ("Notification" in window) {
      setPushPerm(Notification.permission);
      if (Notification.permission === "granted") {
        void syncPushSubscription();
      }
    }

    const onInstalled = () => {
      setIsInstalled(true);
      setPromptDismissed(false);
    };
    const onDisplayModeChange = () => {
      if (mq.matches) {
        setIsInstalled(true);
        setPromptDismissed(false);
      }
    };

    window.addEventListener("appinstalled", onInstalled);
    mq.addEventListener("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener("change", onDisplayModeChange);
    };
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
                  icon: "/cintiq-logo.png",
                  badge: "/cintiq-logo.png",
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

  const enablePhoneAlerts = async () => {
    const res = await Notification.requestPermission().catch(() => "default" as const);
    setPushPerm(res);
    if (res === "granted") {
      await syncPushSubscription();
    }
  };

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

      {showPrompt && pushPerm === "default" && !promptDismissed && (
        isInstalled ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enable phone notifications"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-2xl border-2 border-brand bg-card p-6 text-center shadow-2xl">
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-md">
                <Bell className="size-7" aria-hidden />
              </div>
              <h2 className="font-display text-xl font-bold text-foreground">Enable notifications</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Get instant pop-out alerts on your phone for new orders, handover OTPs, and updates—even when cintiQ is closed.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={enablePhoneAlerts}
                  className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 active:scale-[0.99]"
                >
                  Enable notifications now
                </button>
                <button
                  type="button"
                  onClick={() => setPromptDismissed(true)}
                  className="w-full rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            role="region"
            aria-label="Enable phone notifications"
            className="fixed left-4 right-4 top-20 z-40 mx-auto max-w-sm rounded-xl border border-brand/30 bg-card p-3.5 shadow-lg md:left-auto md:right-4"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Bell className="size-4" aria-hidden />
                </div>
                <div className="space-y-0.5">
                  <p className="font-display text-sm font-semibold text-foreground">Turn on phone alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Get pop-out order &amp; delivery updates even when cintiQ is closed.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPromptDismissed(true)}
                aria-label="Dismiss notification prompt"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromptDismissed(true)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Later
              </button>
              <button
                type="button"
                onClick={enablePhoneAlerts}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
              >
                Enable alerts
              </button>
            </div>
          </div>
        )
      )}

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
          className="fixed inset-x-4 top-[4.25rem] z-40 mx-auto max-w-sm overflow-hidden rounded-lg border border-border bg-card shadow-lg md:absolute md:inset-x-auto md:right-0 md:top-auto md:mx-0 md:mt-2 md:w-80"
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
                onClick={enablePhoneAlerts}
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
