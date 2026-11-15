"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CategoryChip = {
  id: string;
  name: string;
  slug: string;
};

const SPEED_PX_PER_SEC = 26;

export function CategoryMarquee({
  categories,
  activeSlug,
  allLabel = "All products",
  searchQuery,
  sort,
}: {
  categories: CategoryChip[];
  activeSlug?: string;
  allLabel?: string;
  searchQuery?: string;
  sort?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const firstSetRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const offsetRef = useRef(0);
  const dragRef = useRef<{ active: boolean; startX: number; startOffset: number; moved: boolean }>({
    active: false,
    startX: 0,
    startOffset: 0,
    moved: false,
  });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const applyOffset = (next: number) => {
    const track = trackRef.current;
    const firstSet = firstSetRef.current;
    if (!track || !firstSet) return;
    const loopWidth = firstSet.offsetWidth;
    if (loopWidth <= 0) return;
    let wrapped = next % loopWidth;
    if (wrapped < 0) wrapped += loopWidth;
    offsetRef.current = wrapped;
    track.style.transform = `translate3d(-${wrapped}px, 0, 0)`;
  };

  useEffect(() => {
    if (categories.length === 0) return;

    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(100, now - lastTime);
      lastTime = now;

      if (!pausedRef.current && !dragRef.current.active) {
        applyOffset(offsetRef.current + (dt / 1000) * SPEED_PX_PER_SEC);
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [categories.length]);

  if (categories.length === 0) return null;

  const buildHref = (slug?: string) => {
    const p = new URLSearchParams();
    if (searchQuery) p.set("q", searchQuery);
    if (slug) p.set("category", slug);
    if (sort && sort !== "shuffle") p.set("sort", sort);
    const s = p.toString();
    return `/explore${s ? `?${s}` : ""}`;
  };

  const chipClass = (isActive: boolean) =>
    `shrink-0 select-none whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
      isActive
        ? "border-brand bg-brand text-white shadow-xs"
        : "border-border bg-background text-foreground hover:border-brand hover:text-brand"
    }`;

  return (
    <div className="mt-5 flex items-center gap-1.5" aria-label="Product categories">
      <Link href={buildHref(undefined)} className={chipClass(!activeSlug)}>
        {allLabel}
      </Link>

      <button
        type="button"
        aria-label="Slide categories left"
        onClick={() => applyOffset(offsetRef.current - 160)}
        className="hidden size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-brand hover:text-brand sm:inline-flex"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>

      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        onWheel={(e) => {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
          if (delta !== 0) {
            e.preventDefault();
            applyOffset(offsetRef.current + delta);
          }
        }}
        onPointerDown={(e) => {
          dragRef.current = { active: true, startX: e.clientX, startOffset: offsetRef.current, moved: false };
          setPaused(true);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.startX;
          if (Math.abs(dx) > 5) dragRef.current.moved = true;
          if (dragRef.current.moved) {
            applyOffset(dragRef.current.startOffset - dx);
          }
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
          setPaused(false);
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
          setPaused(false);
        }}
        onClickCapture={(e) => {
          if (dragRef.current.moved) {
            e.preventDefault();
            e.stopPropagation();
            dragRef.current.moved = false;
          }
        }}
        className="relative flex-1 cursor-grab touch-pan-y overflow-hidden active:cursor-grabbing [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]"
      >
        <div ref={trackRef} className="flex w-max will-change-transform">
          <div ref={firstSetRef} className="flex shrink-0 gap-2 py-0.5 pr-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={buildHref(c.slug)}
                draggable={false}
                className={chipClass(activeSlug === c.slug)}
              >
                {c.name}
              </Link>
            ))}
          </div>
          <div aria-hidden="true" className="flex shrink-0 gap-2 py-0.5 pr-2">
            {categories.map((c) => (
              <Link
                key={`${c.id}-dup`}
                href={buildHref(c.slug)}
                tabIndex={-1}
                draggable={false}
                className={chipClass(activeSlug === c.slug)}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Slide categories right"
        onClick={() => applyOffset(offsetRef.current + 160)}
        className="hidden size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-brand hover:text-brand sm:inline-flex"
      >
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
