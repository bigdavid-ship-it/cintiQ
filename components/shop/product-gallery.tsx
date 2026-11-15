"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { isVideoPath, productImageUrl } from "@/lib/storage";

type MediaItem = { storage_path: string; sort_order: number };

export function ProductGallery({ media, productName }: { media: MediaItem[]; productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = media[activeIndex] ?? media[0];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
        {active &&
          (isVideoPath(active.storage_path) ? (
            <video
              key={active.storage_path}
              src={productImageUrl(active.storage_path)}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-cover"
            />
          ) : (
            <Image
              src={productImageUrl(active.storage_path)}
              alt={productName}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ))}
      </div>

      {media.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {media.map((item, idx) => {
            const url = productImageUrl(item.storage_path);
            const isActive = idx === activeIndex;
            const isVideo = isVideoPath(item.storage_path);
            return (
              <li key={item.storage_path}>
                <button
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={isVideo ? `Play video ${idx + 1}` : `View photo ${idx + 1}`}
                  aria-pressed={isActive}
                  className={`relative aspect-square w-full overflow-hidden rounded-md border bg-muted transition ${
                    isActive ? "border-brand ring-2 ring-brand/40" : "border-border hover:border-foreground/40"
                  }`}
                >
                  {isVideo ? (
                    <>
                      <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                        <Play className="size-5 fill-white" aria-hidden />
                      </span>
                    </>
                  ) : (
                    <Image src={url} alt="" fill sizes="100px" className="object-cover" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
