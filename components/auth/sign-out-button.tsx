"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({
  className,
  variant = "outline",
  onSignOut,
  showIcon = false,
}: {
  className?: string;
  variant?: "primary" | "outline" | "ghost" | "danger";
  onSignOut?: () => void;
  showIcon?: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    onSignOut?.();
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // Ignore network errors — redirect anyway after clearing local session
    }
    window.location.assign("/");
  }

  return (
    <Button type="button" variant={variant} onClick={handleSignOut} disabled={signingOut} className={className}>
      {signingOut ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        showIcon && <LogOut className="size-3.5" aria-hidden />
      )}
      {signingOut ? "Signing out..." : "Sign out"}
    </Button>
  );
}
