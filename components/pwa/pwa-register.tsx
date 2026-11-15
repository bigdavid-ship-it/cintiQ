"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showManualHint, setShowManualHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const mq = window.matchMedia("(display-mode: standalone)");
    const isStandalone =
      mq.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setVisible(false);
      return;
    }

    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    setVisible(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setDeferred(null);
      setVisible(false);
    };

    const onDisplayModeChange = () => {
      if (mq.matches) setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mq.addEventListener("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener("change", onDisplayModeChange);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
  };

  return (
    <div className="fixed bottom-20 right-4 left-4 z-40 mx-auto max-w-sm rounded-xl border border-border bg-card p-3.5 text-sm shadow-lg md:left-auto md:bottom-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            {isIos ? <Share className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
          </div>
          <div className="space-y-1">
            <p className="font-display font-semibold text-foreground">Install cintiQ App</p>
            {isIos ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Tap <strong>Share</strong> in Safari, then choose <strong>Add to Home Screen</strong> for quick access &amp; notifications.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Get faster campus shopping and real-time order alerts on your home screen.
                </p>
                {showManualHint && !deferred && (
                  <p className="rounded bg-muted px-2 py-1 text-[11px] text-foreground">
                    Open your browser menu (<strong>⋮</strong>) and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Remove install banner"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {!isIos && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={async () => {
              if (deferred) {
                await deferred.prompt();
                const choice = await deferred.userChoice;
                if (choice.outcome === "accepted") {
                  setVisible(false);
                }
                setDeferred(null);
              } else {
                setShowManualHint(true);
              }
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
          >
            Install app
          </button>
        </div>
      )}
    </div>
  );
}
