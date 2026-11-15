"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareStoreLink({ slug, storeName }: { slug: string; storeName: string }) {
  const [url, setUrl] = useState(`/sellers/${slug}`);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/sellers/${slug}`);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [slug]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: `${storeName} on cintiQ`,
        text: `Shop ${storeName} on cintiQ:`,
        url,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">Shareable store link</p>
        <p className="truncate font-mono text-xs text-foreground">{url}</p>
      </div>
      <Button type="button" variant="outline" onClick={copy} className="h-9 px-3 text-xs">
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      {canShare && (
        <Button type="button" onClick={share} className="h-9 px-3 text-xs">
          <Share2 className="size-3.5" aria-hidden /> Share
        </Button>
      )}
    </div>
  );
}
