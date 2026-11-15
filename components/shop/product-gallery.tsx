"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { isVideoPath, productImageUrl } from "@/lib/storage";

type MediaItem = { storage_path: string; sort_order: number };

export function ProductGallery({ media, productName }: { media: MediaItem[]; productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const total = media.length;
  const active = media[activeIndex] ?? media[0];

  const goPrev = () => setActiveIndex((i) => (i - 1 + total) % total);
  const goNext = () => setActiveIndex((i) => (i + 1) % total);

  return (
    <div
      className="space-y-3 outline-none"
      tabIndex={total > 1 ? 0 : undefined}
      onKeyDown={(e) => {
        if (total <= 1) return;
        if (e.key === "ArrowLeft") goPrev();
        if (e.key === "ArrowRight") goNext();
      }}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted select-none"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null || total <= 1) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
          const delta = endX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 40) {
            if (delta < 0) goNext();
            else goPrev();
          }
        }}
      >
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
              key={active.storage_path}
              src={productImageUrl(active.storage_path)}
              alt={`${productName} (${activeIndex + 1} of ${total})`}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ))}

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous photo or video"
              className="absolute left-2.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-xs transition hover:bg-black/75 active:scale-95"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next photo or video"
              className="absolute right-2.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-xs transition hover:bg-black/75 active:scale-95"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-xs">
              {activeIndex + 1} / {total}
            </span>
          </>
        )}
      </div>

      {total > 1 && (
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
