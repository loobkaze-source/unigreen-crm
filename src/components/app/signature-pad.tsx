"use client";

import * as React from "react";
import { Eraser, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A full-screen pad for the customer to sign a job off on the technician's
 * phone.
 *
 * A signature is written along its long axis, and a phone is held the short way
 * round, so on a portrait screen the whole pad is turned a quarter turn rather
 * than asking anyone to rotate the handset — the technician passes the phone
 * over already the right way up for signing. Turning the phone for real makes
 * the viewport landscape, and then the pad simply stops rotating itself.
 */
export function SignaturePad({
  open,
  onClose,
  onSave,
  subtitle,
  defaultName = "",
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the drawing and the name typed under it. */
  onSave: (png: Blob, signedBy: string) => Promise<void> | void;
  /** What is being signed for — shown small, so the signer knows. */
  subtitle?: string;
  defaultName?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [inked, setInked] = React.useState(false);
  const [name, setName] = React.useState(defaultName);
  const [saving, setSaving] = React.useState(false);

  // Read the orientation rather than store it: an effect that setState on every
  // resize would re-render the tree twice for one turn of the wrist.
  const portrait = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      window.addEventListener("orientationchange", cb);
      return () => {
        window.removeEventListener("resize", cb);
        window.removeEventListener("orientationchange", cb);
      };
    },
    () => window.innerHeight > window.innerWidth,
    () => false
  );

  // Opening starts a blank sheet; closing lets the next one start blank too.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setInked(false);
    setSaving(false);
    setName(defaultName);
  }

  /** Give the canvas a backing store at device resolution, and a white sheet. */
  React.useEffect(() => {
    const c = canvasRef.current;
    if (!open || !c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, [open, portrait]);

  if (!open) return null;

  /**
   * Where a touch landed, in the canvas's own coordinates.
   *
   * When the pad is turned a quarter turn, its bounding box on screen is the
   * canvas laid on its side: what the finger moves down the screen is x across
   * the canvas, and what it moves left is y down it.
   */
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return portrait
      ? { x: e.clientY - r.top, y: r.right - e.clientX }
      : { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // A tap with no drag is a dot, not nothing.
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    setInked(true);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.strokeStyle = "#0f172a";
    setInked(false);
  }

  async function save() {
    const c = canvasRef.current;
    if (!c || saving) return;
    setSaving(true);
    // try/finally: if onSave throws (network drop on site), the button must
    // not stay stuck on "กำลังบันทึก…" with the pad unusable.
    try {
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
      if (!blob) return;
      await onSave(blob, name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900">
      <div
        className="absolute left-0 top-0 flex flex-col bg-card"
        style={
          portrait
            ? {
                width: "100vh",
                height: "100vw",
                transform: "rotate(90deg) translateY(-100%)",
                transformOrigin: "top left",
              }
            : { width: "100vw", height: "100vh" }
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold">ลายเซ็นลูกค้า</div>
            {subtitle ? (
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อผู้เซ็น"
            className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-md p-1.5 text-muted-foreground active:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 p-3">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            className="h-full w-full touch-none rounded-lg border border-dashed border-border bg-white"
          />
          {inked ? null : (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              เซ็นชื่อในกรอบนี้
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={clear}
            disabled={!inked || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground active:bg-muted disabled:opacity-40"
          >
            <Eraser className="h-4 w-4" /> ล้าง
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            // Shut while the drawing is going up and it lands in storage with
            // nothing pointing at it, and the customer is asked to sign twice.
            disabled={saving}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium active:bg-muted disabled:opacity-40"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!inked || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white active:opacity-90",
              (!inked || saving) && "opacity-40"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "กำลังบันทึก…" : "บันทึกลายเซ็น"}
          </button>
        </div>
      </div>
    </div>
  );
}
