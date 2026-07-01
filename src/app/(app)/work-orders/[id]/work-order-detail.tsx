"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  ImagePlus,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import type {
  WorkOrder,
  WorkOrderItem,
  WorkOrderPhoto,
} from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import {
  WO_STATUSES,
  priorityMeta,
  statusMeta,
  typeLabel,
  woCode,
} from "../constants";
import {
  WorkOrderModal,
  type Option,
  type ContactOption,
  type CaseOption,
  type SiteOption,
  type AssetOption,
} from "../work-order-modal";
import {
  addChecklistItem,
  addWorkOrderPhoto,
  deleteChecklistItem,
  deleteWorkOrder,
  deleteWorkOrderPhoto,
  toggleChecklistItem,
  updateWorkOrderStatus,
} from "../actions";

type PhotoWithUrl = WorkOrderPhoto & { url: string };

export function WorkOrderDetail({
  workOrder,
  items,
  photos,
  technicians,
  companies,
  contacts,
  sites,
  assets,
  cases,
  assetIds,
  orgId,
  technicianName,
  companyName,
  contactName,
}: {
  workOrder: WorkOrder;
  items: WorkOrderItem[];
  photos: PhotoWithUrl[];
  technicians: Option[];
  companies: Option[];
  contacts: ContactOption[];
  sites: SiteOption[];
  assets: AssetOption[];
  cases: CaseOption[];
  assetIds: string[];
  orgId: string;
  technicianName?: string;
  companyName?: string;
  contactName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const s = statusMeta(workOrder.status);
  const p = priorityMeta(workOrder.priority);
  const doneCount = items.filter((i) => i.done).length;

  const mapHref =
    workOrder.site_map_url ||
    (workOrder.site_address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          workOrder.site_address
        )}`
      : null);

  function changeStatus(status: string) {
    startTransition(async () => {
      const res = await updateWorkOrderStatus(
        workOrder.id,
        status as WorkOrder["status"]
      );
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  function removeWorkOrder() {
    if (!confirm(`ลบใบสั่งงาน "${woCode(workOrder.number)} ${workOrder.title}"?`))
      return;
    startTransition(async () => {
      const res = await deleteWorkOrder(workOrder.id);
      if (!res.ok) alert(res.error);
      else router.push("/work-orders");
    });
  }
  function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    startTransition(async () => {
      const res = await addChecklistItem(workOrder.id, newItem);
      if (!res.ok) return alert(res.error);
      setNewItem("");
      router.refresh();
    });
  }
  function toggleItem(item: WorkOrderItem) {
    startTransition(async () => {
      const res = await toggleChecklistItem(item.id, !item.done, workOrder.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  function removeItem(item: WorkOrderItem) {
    startTransition(async () => {
      const res = await deleteChecklistItem(item.id, workOrder.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${orgId}/${workOrder.id}/${Date.now()}-${rand}.${ext}`;
      const { error } = await supabase.storage
        .from("wo-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        alert(error.message);
        continue;
      }
      const res = await addWorkOrderPhoto(workOrder.id, path);
      if (!res.ok) alert(res.error);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  function removePhoto(ph: PhotoWithUrl) {
    if (!confirm("ลบรูปนี้?")) return;
    startTransition(async () => {
      const res = await deleteWorkOrderPhoto(ph.id, ph.path, workOrder.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <Link
        href="/work-orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปงานบริการ
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {woCode(workOrder.number)}
            </span>
            <Badge tone={s.tone}>{s.label}</Badge>
            <Badge tone={p.tone}>{p.label}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight">
            {workOrder.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={workOrder.status}
            onChange={(e) => changeStatus(e.target.value)}
            className="w-44"
          >
            {WO_STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> แก้ไข
          </Button>
          <Button variant="ghost" size="icon" onClick={removeWorkOrder}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Details */}
      <Card className="mb-6">
        <CardContent className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          <Info icon={Wrench} label="ประเภทงาน" value={typeLabel(workOrder.type)} />
          <Info icon={User} label="ช่างผู้รับผิดชอบ" value={technicianName || "ยังไม่มอบหมาย"} />
          <Info icon={Building2} label="ลูกค้า" value={companyName || "—"} />
          <Info icon={User} label="ผู้ติดต่อ" value={contactName || "—"} />
          <Info
            icon={CalendarClock}
            label="นัดหมาย"
            value={
              workOrder.scheduled_start
                ? fmtDateTime(workOrder.scheduled_start) +
                  (workOrder.scheduled_end
                    ? ` – ${format(new Date(workOrder.scheduled_end), "HH:mm")}`
                    : "")
                : "ยังไม่นัดหมาย"
            }
          />
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">สถานที่</div>
              <div className="text-sm">{workOrder.site_address || "—"}</div>
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  เปิดแผนที่
                </a>
              ) : null}
            </div>
          </div>
          {workOrder.description ? (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">รายละเอียด</div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">
                {workOrder.description}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>
              เช็กลิสต์หน้างาน{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({doneCount}/{items.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40"
                >
                  <button
                    onClick={() => toggleItem(item)}
                    className="text-muted-foreground hover:text-primary"
                    aria-label="สลับสถานะ"
                  >
                    {item.done ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      item.done && "text-muted-foreground line-through"
                    )}
                  >
                    {item.label}
                  </span>
                  <button
                    onClick={() => removeItem(item)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="ลบ"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
              {items.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  ยังไม่มีรายการตรวจ เพิ่มรายการด้านล่าง
                </p>
              ) : null}
            </div>

            <form onSubmit={addItem} className="mt-3 flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="เพิ่มรายการตรวจ เช่น ตรวจสายดิน…"
              />
              <Button type="submit" variant="secondary">
                <Plus className="h-4 w-4" /> เพิ่ม
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>รูปหน้างาน</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <ImagePlus className="h-4 w-4" /> {uploading ? "กำลังอัปโหลด…" : "เพิ่มรูป"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => uploadFiles(e.target.files)}
            />
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ยังไม่มีรูป — กด “เพิ่มรูป” เพื่ออัปโหลดภาพหน้างาน
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((ph) => (
                  <div
                    key={ph.id}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ph.url}
                      alt={ph.caption || "รูปหน้างาน"}
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => removePhoto(ph)}
                      className="absolute right-1 top-1 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="ลบรูป"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <WorkOrderModal
        open={editing}
        onClose={() => setEditing(false)}
        editing={workOrder}
        technicians={technicians}
        companies={companies}
        contacts={contacts}
        sites={sites}
        assets={assets}
        cases={cases}
        assetIds={assetIds}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}
