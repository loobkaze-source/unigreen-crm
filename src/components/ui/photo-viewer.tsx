"use client";

import { useCallback, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

export type ViewerPhoto = { id: string; url: string; caption?: string | null };

/**
 * Full-screen photo viewer. Thumbnails elsewhere are cropped squares, which is
 * no use for reading a fault photo on a phone — this shows the whole frame,
 * with swipe-sized arrows and the usual ways out (backdrop, ✕, Escape).
 */
export function PhotoViewer({
  photos,
  index,
  onClose,
  onIndexChange,
}: {
  photos: ViewerPhoto[];
  /** Index into `photos`, or null when closed. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const open = index !== null && index >= 0 && index < photos.length;

  const step = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = (index + delta + photos.length) % photos.length;
      onIndexChange(next);
    },
    [index, photos.length, onIndexChange]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while the viewer is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, step]);

  if (!open) return null;
  const photo = photos[index];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูป"
    >
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <span className="text-sm text-white/70">
          {index + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-1">
          {/* Escape hatch: the original file, for zooming or saving. */}
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-2 hover:bg-white/10"
            aria-label="เปิดไฟล์ต้นฉบับ"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-white/10"
            aria-label="ปิด"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Tapping the backdrop closes; the image itself does not. */}
      <div className="relative flex-1" onClick={onClose}>
        <Image
          src={photo.url}
          alt={photo.caption || "รูปหน้างาน"}
          fill
          sizes="100vw"
          className="object-contain p-2"
          onClick={(e) => e.stopPropagation()}
        />

        {photos.length > 1 ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white active:bg-black/70"
              aria-label="รูปก่อนหน้า"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white active:bg-black/70"
              aria-label="รูปถัดไป"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>

      {photo.caption ? (
        <p className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-white/90">
          {photo.caption}
        </p>
      ) : null}
    </div>
  );
}
