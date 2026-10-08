"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { WorkOrderModal } from "./work-order-modal";
import { loadWorkOrderFormOptions, type WorkOrderFormOptions } from "./form-options";

type LoaderProps = Omit<ComponentProps<typeof WorkOrderModal>, keyof WorkOrderFormOptions>;

// Kept for the life of the page, so reopening the form is instant. Refreshed in
// the background when older than this, so a customer or site added meanwhile
// shows up without a reload.
const STALE_MS = 2 * 60 * 1000;
let cache: { at: number; data: WorkOrderFormOptions } | null = null;

/**
 * The work-order form, with its pickers' options fetched when it opens rather
 * than shipped with every render of the page that hosts it (see
 * form-options.ts). The form itself is built on mount from those options, so
 * it is only mounted once they are here.
 */
export function WorkOrderModalLoader(props: LoaderProps) {
  const [options, setOptions] = useState<WorkOrderFormOptions | null>(() => cache?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!props.open) return;
    if (cache && Date.now() - cache.at < STALE_MS) return;
    let live = true;
    loadWorkOrderFormOptions()
      .then((res) => {
        if (!live) return;
        if (!res.ok) return setError(res.error);
        cache = { at: Date.now(), data: res.data };
        setError(null);
        setOptions(res.data);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "โหลดตัวเลือกไม่สำเร็จ");
      });
    return () => {
      live = false;
    };
  }, [props.open, attempt]);

  if (!props.open) return null;
  if (options) return <WorkOrderModal {...props} {...options} />;

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.editing ? "แก้ไขใบสั่งงาน" : "สร้างใบสั่งงาน"}
      size="lg"
    >
      {error ? (
        <div className="space-y-3 py-4 text-sm">
          <p className="text-destructive">โหลดข้อมูลฟอร์มไม่สำเร็จ: {error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            ลองใหม่
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดข้อมูลฟอร์ม…
        </div>
      )}
    </Modal>
  );
}
