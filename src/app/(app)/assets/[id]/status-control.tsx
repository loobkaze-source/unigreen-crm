"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ASSET_STATUSES, assetStatusMeta, type AssetStatus } from "@/lib/asset-status";
import { updateAssetStatus } from "../actions";

/**
 * Status badge + (for admin/Dispatcher) a small override dropdown on the
 * asset lifetime page. Normal transitions happen automatically via cases and
 * work orders — this is the manual escape hatch and where admins retire assets.
 */
export function AssetStatusControl({
  equipmentId,
  status,
  canOverride,
  canRetire,
}: {
  equipmentId: string;
  status: string;
  canOverride: boolean;
  canRetire: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const meta = assetStatusMeta(status);

  if (!canOverride) return <Badge tone={meta.tone}>{meta.label}</Badge>;

  return (
    <label className="inline-flex items-center gap-2">
      <Badge tone={meta.tone}>{meta.label}</Badge>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as AssetStatus;
          if (next === status) return;
          if (next === "retired" && !confirm("ปลดระวางเครื่องนี้?")) {
            e.target.value = status;
            return;
          }
          startTransition(async () => {
            const res = await updateAssetStatus(equipmentId, next);
            if (!res.ok) alert(res.error);
            router.refresh();
          });
        }}
        className="rounded-md border border-border bg-card px-2 py-1 text-xs"
        aria-label="ปรับสถานะเครื่อง"
      >
        {ASSET_STATUSES.filter((s) => canRetire || s.value !== "retired").map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
