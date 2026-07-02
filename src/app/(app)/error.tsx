"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">เกิดข้อผิดพลาดในการโหลดข้อมูล</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          ลองใหม่อีกครั้ง หากยังไม่หายให้รีเฟรชหน้า หรือติดต่อผู้ดูแลระบบ
        </p>
        {error?.message ? (
          <p className="mt-2 max-w-md break-words text-xs text-muted-foreground/70">
            {error.message}
          </p>
        ) : null}
      </div>
      <Button onClick={() => reset()}>ลองใหม่</Button>
    </div>
  );
}
