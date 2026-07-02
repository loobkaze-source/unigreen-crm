"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Box, FolderKanban, Search, Wrench } from "lucide-react";
import type { Equipment } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTableHead,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { warrantyEnd, warrantyState } from "@/lib/warranty";
import { assetStatusMeta } from "@/lib/asset-status";
import { assetCode } from "@/lib/asset";
import { fmtDate } from "@/lib/format";

type Option = { id: string; name: string };

const assetId = (eq: Equipment) =>
  (eq.asset_type === "project" ? eq.project_number : eq.serial_number) || "—";

export function AssetsView({
  equipment,
  sites,
  groups,
  inServiceIds,
}: {
  equipment: Equipment[];
  sites: Option[];
  groups: Option[];
  /** Assets that appear on an unfinished work order (shown as "มีงานค้าง"). */
  inServiceIds: string[];
}) {
  const [query, setQuery] = useState("");
  const inService = useMemo(() => new Set(inServiceIds), [inServiceIds]);

  const siteName = useMemo(() => {
    const m = new Map(sites.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [sites]);
  const groupName = useMemo(() => {
    const m = new Map(groups.map((g) => [g.id, g.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(
      (eq) =>
        eq.name.toLowerCase().includes(q) ||
        assetCode(eq.code).toLowerCase().includes(q) ||
        (eq.serial_number || "").toLowerCase().includes(q) ||
        (eq.project_number || "").toLowerCase().includes(q) ||
        (eq.brand || "").toLowerCase().includes(q) ||
        (eq.model || "").toLowerCase().includes(q) ||
        (siteName(eq.site_id) || "").toLowerCase().includes(q)
    );
  }, [equipment, query, siteName]);

  const columns = useMemo<ColumnDef<Equipment>[]>(
    () => [
      {
        key: "code",
        header: "รหัส Asset",
        sortAccessor: (eq) => eq.code ?? null,
        filter: { kind: "text", accessor: (eq) => assetCode(eq.code) },
      },
      {
        key: "name",
        header: "Asset",
        sortAccessor: (eq) => eq.name,
        filter: { kind: "text", accessor: (eq) => eq.name },
      },
      {
        key: "status",
        header: "สถานะเครื่อง",
        sortAccessor: (eq) => assetStatusMeta(eq.status).label,
        filter: {
          kind: "select",
          accessor: (eq) => assetStatusMeta(eq.status).label,
        },
      },
      {
        key: "site",
        header: "ไซต์",
        sortAccessor: (eq) => siteName(eq.site_id) ?? null,
        filter: { kind: "select", accessor: (eq) => siteName(eq.site_id) ?? null },
      },
      {
        key: "group",
        header: "กลุ่ม",
        sortAccessor: (eq) => groupName(eq.group_id) ?? null,
        filter: { kind: "select", accessor: (eq) => groupName(eq.group_id) ?? null },
      },
      {
        key: "assetId",
        header: "Serial / เลขโครงการ",
        sortAccessor: (eq) => assetId(eq),
        filter: { kind: "text", accessor: (eq) => assetId(eq) },
      },
      {
        key: "install_date",
        header: "วันส่งมอบวันแรก",
        sortAccessor: (eq) => eq.install_date,
      },
      {
        key: "warranty",
        header: "ประกัน",
        sortAccessor: (eq) =>
          warrantyEnd(eq.warranty_start, eq.warranty_months)?.getTime() ?? null,
        filter: {
          kind: "select",
          accessor: (eq) =>
            warrantyState(warrantyEnd(eq.warranty_start, eq.warranty_months)),
          options: [
            { value: "active", label: "ในประกัน" },
            { value: "expired", label: "หมดประกัน" },
            { value: "none", label: "ไม่มี" },
          ],
        },
      },
    ],
    [siteName, groupName]
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "code", dir: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Asset"
        subtitle="เครื่อง/อุปกรณ์ทั้งหมด — กดที่รายการเพื่อดูประวัติ Lifetime"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา Asset / รหัส / Serial / ไซต์…"
            className="pl-9"
          />
        </div>
        <DataTableFilterToggle table={table} />
      </div>

      {table.rows.length === 0 ? (
        <EmptyState
          icon={Box}
          title={equipment.length ? "ไม่พบรายการ" : "ยังไม่มี Asset"}
          description={
            equipment.length
              ? "ปรับการค้นหาหรือตัวกรอง"
              : "เพิ่ม Asset ได้จากหน้าไซต์งานของลูกค้า"
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead table={table} sourceRows={equipment} />
            <tbody>
              {table.rows.map((eq) => {
                const wEnd = warrantyEnd(eq.warranty_start, eq.warranty_months);
                const wState = warrantyState(wEnd);
                return (
                  <tr
                    key={eq.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <Link href={`/assets/${eq.id}`} className="hover:text-primary">
                        {assetCode(eq.code)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/assets/${eq.id}`} className="block">
                        <div className="flex items-center gap-2">
                          {eq.asset_type === "project" ? (
                            <FolderKanban className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Box className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium hover:text-primary">{eq.name}</span>
                        </div>
                        {eq.brand || eq.model ? (
                          <div className="pl-6 text-xs text-muted-foreground">
                            {[eq.brand, eq.model].filter(Boolean).join(" ")}
                          </div>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={assetStatusMeta(eq.status).tone}>
                          {assetStatusMeta(eq.status).label}
                        </Badge>
                        {inService.has(eq.id) ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
                            title="มีใบสั่งงานที่ยังไม่เสร็จ"
                          >
                            <Wrench className="h-3 w-3" /> มีงานค้าง
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {eq.site_id ? (
                        <Link href={`/sites/${eq.site_id}`} className="hover:text-primary">
                          {siteName(eq.site_id) || "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {groupName(eq.group_id) || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {assetId(eq)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {eq.install_date ? fmtDate(eq.install_date) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {wState === "none" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge tone={wState === "active" ? "success" : "danger"}>
                          {wState === "active" ? "ในประกันถึง " : "หมดประกัน "}
                          {wEnd ? fmtDate(wEnd) : ""}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
