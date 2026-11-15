"use client";

import { useEffect, useState } from "react";

/**
 * Branded cintiQ launch splash screen.
 * Plays once per browser session (or PWA launch) and fades out smoothly.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("gone");

  useEffect(() => {
    try {
      if (sessionStorage.getItem("cintiq_splashed")) return;
      sessionStorage.setItem("cintiq_splashed", "1");
    } catch {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    setPhase("show");
    const t1 = window.setTimeout(() => setPhase("fade"), 650);
    const t2 = window.setTimeout(() => setPhase("gone"), 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand text-white transition-opacity duration-350 ${
        phase === "fade" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="splash-pop flex flex-col items-center gap-4">
        <svg width="64" height="64" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="#ffffff" fillOpacity="0.12" />
          <path
            d="M16 7.5C11.3056 7.5 7.5 11.3056 7.5 16C7.5 20.6944 11.3056 24.5 16 24.5C18.08 24.5 19.985 23.752 21.46 22.51"
            stroke="#ffffff"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path d="M18.5 18.5L24.5 24.5" stroke="#e8a33d" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="22.5" cy="11.5" r="2.2" fill="#e8a33d" />
        </svg>
        <div className="text-center">
          <p className="font-display text-3xl font-semibold tracking-tight">cintiQ</p>
          <p className="mt-1 text-xs tracking-wide text-white/80">Your Campus. Your Marketplace.</p>
        </div>
        <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-white/20">
          <div className="splash-bar h-full rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
