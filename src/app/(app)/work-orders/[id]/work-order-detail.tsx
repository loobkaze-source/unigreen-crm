"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Box,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LifeBuoy,
  Loader2,
  PenLine,
  Printer,
  Repeat,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import type {
  WorkOrder,
  WorkOrderPhoto,
} from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";
import { shrinkImage } from "@/lib/image";
import { SignaturePad } from "@/components/app/signature-pad";
import {
  DiagnosisCard,
  ServiceReportCard,
  TimeMileageCard,
} from "./service-report-cards";
import { fmtDateTime } from "@/lib/format";
import {
  WO_STATUSES,
  priorityMeta,
  statusMeta,
  typeLabel,
  woCode,
} from "../constants";
import dynamic from "next/dynamic";
import type {
  Option,
  ContactOption,
  CaseOption,
  ContractOption,
  SiteOption,
  AssetOption,
} from "../work-order-modal";

// Loaded on demand — keeps the modal out of the detail page's chunk.
const WorkOrderModal = dynamic(
  () => import("../work-order-modal").then((m) => m.WorkOrderModal),
  { ssr: false }
);
import {
  addWorkOrderPart,
  saveTechnicianRemark,
  saveWorkOrderSignature,
  saveWorkOrderPhotoCaption,
  reorderWorkOrderPhotos,
  addWorkOrderPhoto,
  deleteWorkOrderPart,
  deleteWorkOrder,
  deleteWorkOrderPhoto,
  updateWorkOrderStatus,
} from "../actions";

type PhotoWithUrl = WorkOrderPhoto & { url: string };
type PartRow = {
  id: string;
  name: string;
  qty: number;
  equipment_id: string | null;
  unit: string | null;
  unit_price: number | null;
  source: string | null;
};

/**
 * A transition that remembers which control started it, so only that control
 * shows itself waiting. `pending` stays true until the refresh the action asked
 * for has landed — which is the moment the new row is actually on screen, not
 * the moment the server replied.
 */
function useBusyTransition() {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  return {
    run(name: string, fn: () => Promise<void>) {
      setRunning(name);
      startTransition(fn);
    },
    busy: (name: string) => pending && running === name,
  };
}

export function WorkOrderDetail({
  workOrder,
  photos,
  parts,
  technicians,
  companies,
  contacts,
  sites,
  assets,
  cases,
  contracts,
  assetIds,
  crewIds,
  faultCodes,
  repairCodes,
  causeTags,
  orgId,
  signatureUrl,
  canEdit = true,
  backHref = "/work-orders",
  backLabel = "กลับไปใบงาน",
  technicianName,
  companyName,
  contactName,
}: {
  workOrder: WorkOrder;
  photos: PhotoWithUrl[];
  parts: PartRow[];
  technicians: Option[];
  companies: Option[];
  contacts: ContactOption[];
  sites: SiteOption[];
  assets: AssetOption[];
  cases: CaseOption[];
  contracts: ContractOption[];
  assetIds: string[];
  /** Technicians recorded as having been on site. */
  crewIds: string[];
  /** Codes already used on other jobs, offered in the two pickers. */
  faultCodes: string[];
  repairCodes: string[];
  causeTags: string[];
  orgId: string;
  /** The customer's signature for this job, once there is one. */
  signatureUrl: string | null;
  /** Field technicians work the job but never restructure or remove it. */
  canEdit?: boolean;
  /** Where "back" goes — a field technician can't reach the work-order list. */
  backHref?: string;
  backLabel?: string;
  technicianName?: string;
  companyName?: string;
  contactName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Which photo the full-screen viewer is showing (null = closed).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const [remark, setRemark] = useState(workOrder.technician_remark ?? "");
  function submitRemark() {
    run("remark", async () => {
      const res = await saveTechnicianRemark(workOrder.id, remark);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  const [uploading, setUploading] = useState(false);
  /** What the upload is doing right now — shrinking, or how far through. */
  const [uploadNote, setUploadNote] = useState("");
  const { run, busy } = useBusyTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  /** The assets on this job, in the order the picker lists them. */
  const linkedAssets = assets.filter((a) => assetIds.includes(a.id));

  const s = statusMeta(workOrder.status);
  const p = priorityMeta(workOrder.priority);

  const mapHref =
    workOrder.site_map_url ||
    (workOrder.site_address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          workOrder.site_address
        )}`
      : null);

  function changeStatus(status: string) {
    run("status", async () => {
      const res = await updateWorkOrderStatus(
        workOrder.id,
        status as WorkOrder["status"]
      );
      if (!res.ok) alert(res.error);
      // Refresh on failure too, so the controlled Select resyncs to the
      // server state instead of keeping the failed value.
      router.refresh();
    });
  }
  function removeWorkOrder() {
    if (!confirm(`ลบใบสั่งงาน "${woCode(workOrder)} ${workOrder.title}"?`))
      return;
    run("delete", async () => {
      const res = await deleteWorkOrder(workOrder.id);
      if (!res.ok) alert(res.error);
      else router.push("/work-orders");
    });
  }


  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files);
    setUploading(true);
    setUploadNote(chosen.length > 1 ? `กำลังย่อรูป ${chosen.length} รูป…` : "กำลังย่อรูป…");

    // Shrunk before it goes anywhere: a camera photo is several MB and nothing
    // in the app ever shows one larger than 1,600px.
    const ready = await Promise.all(chosen.map((f) => shrinkImage(f)));

    let done = 0;
    setUploadNote(`กำลังอัปโหลด 0/${ready.length}`);
    const supabase = createClient();
    // Upload all files in parallel; collect failures into one alert.
    const errors = (
      await Promise.all(
        ready.map(async (file, i) => {
          const ext = file.name.split(".").pop() || "jpg";
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${orgId}/${workOrder.id}/${Date.now()}-${rand}.${ext}`;
          const { error } = await supabase.storage
            .from("wo-photos")
            .upload(path, file, { cacheControl: "3600", upsert: false });
          done++;
          setUploadNote(`กำลังอัปโหลด ${done}/${ready.length}`);
          if (error) return `${chosen[i].name}: ${error.message}`;
          const res = await addWorkOrderPhoto(workOrder.id, path);
          return res.ok ? null : `${chosen[i].name}: ${res.error}`;
        })
      )
    ).filter(Boolean);
    if (errors.length > 0) alert("อัปโหลดไม่สำเร็จบางไฟล์:\n" + errors.join("\n"));
    setUploading(false);
    setUploadNote("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  /**
   * The order the photos are shown in, held here so a drag lands under the
   * finger and the server catches up. Reset whenever the set of photos changes
   * — one arrived, one went — but not when only their order does, which is the
   * refresh that follows a drag of our own.
   */
  const [order, setOrder] = useState<string[]>(() => photos.map((p) => p.id));
  const [orderKey, setOrderKey] = useState(() => photos.map((p) => p.id).join(","));
  const serverKey = photos.map((p) => p.id).join(",");
  if (orderKey !== serverKey) {
    setOrderKey(serverKey);
    setOrder(photos.map((p) => p.id));
  }
  const shownPhotos = order
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is PhotoWithUrl => !!p);
  const dragId = useRef<string | null>(null);

  function saveOrder(ids: string[]) {
    setOrder(ids);
    run("photoOrder", async () => {
      const res = await reorderWorkOrderPhotos(workOrder.id, ids);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  /** Drop `dragged` where `targetId` currently sits. */
  function dropOn(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const next = order.filter((id) => id !== from);
    next.splice(next.indexOf(targetId), 0, from);
    saveOrder(next);
  }
  /** The same move for a thumb: dragging works on a mouse, not on a phone. */
  function nudge(id: string, delta: number) {
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  }

  const [signing, setSigning] = useState(false);
  /** Same route as a photo: the drawing goes straight to storage from here. */
  async function saveSignature(png: Blob, signedBy: string) {
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${orgId}/${workOrder.id}/signature-${Date.now()}-${rand}.png`;
    const { error } = await createClient()
      .storage.from("wo-photos")
      .upload(path, png, { cacheControl: "3600", upsert: false });
    if (error) return alert(`บันทึกลายเซ็นไม่สำเร็จ: ${error.message}`);
    const res = await saveWorkOrderSignature(workOrder.id, path, signedBy);
    if (!res.ok) return alert(res.error);
    setSigning(false);
    router.refresh();
  }

  function removePhoto(ph: PhotoWithUrl) {
    if (!confirm("ลบรูปนี้?")) return;
    run(`photo-${ph.id}`, async () => {
      const res = await deleteWorkOrderPhoto(ph.id, workOrder.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {/* Deliberately loud: on a phone this is the only way out of the job,
          and a muted text link was easy to miss. */}
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary active:bg-muted"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> {backLabel}
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {woCode(workOrder)}
            </span>
            <Badge tone={s.tone}>{s.label}</Badge>
            <Badge tone={p.tone}>{p.label}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight">
            {workOrder.title}
          </h1>
          {workOrder.technician_id ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {workOrder.accepted_at
                ? `ช่างรับงานแล้ว · ${fmtDateTime(workOrder.accepted_at)}`
                : "รอช่างกดรับงาน"}
            </p>
          ) : null}
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
          <Link
            href={`/work-orders/${workOrder.id}/report`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium shadow-sm hover:bg-muted"
          >
            <Printer className="h-4 w-4" /> พิมพ์รายงาน
          </Link>
          {canEdit ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> แก้ไข
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={removeWorkOrder}
                disabled={busy("delete")}
              >
                {busy("delete") ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Details */}
      <Card className="mb-6">
        <CardContent className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          <Info icon={Wrench} label="ประเภทงาน" value={typeLabel(workOrder.type)} />
          <Info icon={User} label="ช่างผู้รับผิดชอบ" value={technicianName || "ยังไม่มอบหมาย"} />
          <Info icon={Building2} label="ลูกค้า" value={companyName || "—"} />
          {/* Which agreement or report the job answers — one or the other. */}
          {workOrder.contract_id ? (
            <Info
              icon={Repeat}
              label="สัญญาบริการ"
              value={contracts.find((c) => c.id === workOrder.contract_id)?.name || "—"}
            />
          ) : workOrder.case_id ? (
            <Info
              icon={LifeBuoy}
              label="เคสที่เกี่ยวข้อง"
              value={cases.find((c) => c.id === workOrder.case_id)?.name || "—"}
            />
          ) : null}
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
          {/* The machines the job is about. They arrive from the case that
              raised it, and a technician who cannot see them here has to open
              the edit form to find out what they are going to. */}
          {linkedAssets.length ? (
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Box className="h-4 w-4" /> เครื่องที่มีปัญหา ({linkedAssets.length})
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {linkedAssets.map((a) => (
                  <Link
                    key={a.id}
                    href={`/assets/${a.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground hover:bg-muted"
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
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
        {/* The paper report's own head: its number, the customer's, and the
            boxes ticked down items 6–14. */}
        <ServiceReportCard workOrder={workOrder} onSaved={() => router.refresh()} />
        <TimeMileageCard workOrder={workOrder} onSaved={() => router.refresh()} />

        {/* How it was closed: the two codes, the two explanations, the crew. */}
        <div className="lg:col-span-2">
          <DiagnosisCard
            workOrder={workOrder}
            technicians={technicians}
            crewIds={crewIds}
            faultCodes={faultCodes}
            repairCodes={repairCodes}
            causeTags={causeTags}
            onSaved={() => router.refresh()}
          />
        </div>

        {/* Materials used on the job, and anything drawn from company stock.
            Same shape, same totals — one component, two sources. */}
        <PartsCard
          title="วัสดุที่ใช้"
          emptyText="ยังไม่มีวัสดุที่ใช้ในงานนี้"
          source="material"
          parts={parts.filter((p) => p.source !== "store" && p.source !== "labor")}
          assets={assets}
          assetIds={assetIds}
          workOrderId={workOrder.id}
          onChanged={() => router.refresh()}
        />

        <PartsCard
          title="ของที่เบิกจาก store"
          emptyText="ยังไม่มีการเบิกของจาก store สำหรับงานนี้"
          source="store"
          parts={parts.filter((p) => p.source === "store")}
          assets={assets}
          assetIds={assetIds}
          workOrderId={workOrder.id}
          onChanged={() => router.refresh()}
        />

        {/* ค่าแรง/LABOR CHARGE — priced the same way, so the same card. */}
        <PartsCard
          title="ค่าแรง"
          emptyText="ยังไม่ได้คิดค่าแรงสำหรับงานนี้"
          source="labor"
          namePlaceholder="รายละเอียด เช่น ค่าแรงช่าง 2 คน"
          qtyPlaceholder="ชม."
          unitPlaceholder="หน่วย เช่น ชม."
          pricePlaceholder="ราคาต่อชั่วโมง (บาท)"
          perUnit="ชม."
          parts={parts.filter((p) => p.source === "labor")}
          assets={assets}
          assetIds={assetIds}
          workOrderId={workOrder.id}
          onChanged={() => router.refresh()}
        />

        {/* Item 15 on the paper report — what the technician actually did. The
            dispatcher's brief is `description`, shown in the details above. */}
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงานที่ทำ (ช่างบันทึก)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              value={remark}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRemark(e.target.value)}
              placeholder="บันทึกสิ่งที่พบหน้างาน อาการ วิธีแก้ ข้อควรระวังครั้งหน้า…"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              {remark !== (workOrder.technician_remark ?? "") ? (
                <span className="text-xs text-muted-foreground">ยังไม่ได้บันทึก</span>
              ) : null}
              <Button
                variant="secondary"
                onClick={submitRemark}
                disabled={busy("remark") || remark === (workOrder.technician_remark ?? "")}
              >
                {busy("remark") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy("remark") ? "กำลังบันทึก…" : "บันทึกหมายเหตุ"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>รูปหน้างาน</CardTitle>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {uploading ? uploadNote || "กำลังอัปโหลด…" : "เพิ่มรูป"}
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shownPhotos.map((ph, i) => (
                  <div
                    key={ph.id}
                    draggable
                    onDragStart={() => (dragId.current = ph.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(ph.id)}
                    onDragEnd={() => (dragId.current = null)}
                  >
                  <div
                    className="group relative aspect-square cursor-move overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <button
                      type="button"
                      onClick={() => setViewerIndex(i)}
                      className="absolute inset-0"
                      aria-label="เปิดดูรูป"
                    >
                      <Image
                        src={ph.url}
                        alt={ph.caption || "รูปหน้างาน"}
                        fill
                        sizes="(max-width: 640px) 33vw, 200px"
                        className="object-cover"
                      />
                    </button>
                    <button
                      onClick={() => removePhoto(ph)}
                      disabled={busy(`photo-${ph.id}`)}
                      className={cn(
                        "absolute right-1 top-1 rounded-md bg-black/50 p-1 text-white transition-opacity md:opacity-0 md:group-hover:opacity-100",
                        busy(`photo-${ph.id}`) && "md:opacity-100"
                      )}
                      aria-label="ลบรูป"
                    >
                      {busy(`photo-${ph.id}`) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {/* Dragging is a mouse; these are for the phone the
                        photographs were taken on. */}
                    <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                      <button
                        type="button"
                        onClick={() => nudge(ph.id, -1)}
                        disabled={i === 0 || busy("photoOrder")}
                        aria-label="ย้ายไปก่อนหน้า"
                        className="rounded-md bg-black/50 p-1 text-white disabled:opacity-30"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(ph.id, 1)}
                        disabled={i === shownPhotos.length - 1 || busy("photoOrder")}
                        aria-label="ย้ายไปถัดไป"
                        className="rounded-md bg-black/50 p-1 text-white disabled:opacity-30"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <PhotoCaption
                    photo={ph}
                    workOrderId={workOrder.id}
                    onSaved={() => router.refresh()}
                  />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer sign-off. Captured on site from งานของฉัน, and here too —
            a technician finishing a job is as likely to be on this page. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>ลายเซ็นลูกค้า</CardTitle>
            <Button variant="secondary" size="sm" onClick={() => setSigning(true)}>
              <PenLine className="h-4 w-4" /> {signatureUrl ? "เซ็นใหม่" : "ขอลายเซ็น"}
            </Button>
          </CardHeader>
          <CardContent>
            {signatureUrl ? (
              <div className="flex flex-wrap items-center gap-4">
                <Image
                  src={signatureUrl}
                  alt="ลายเซ็นลูกค้า"
                  width={320}
                  height={120}
                  unoptimized
                  className="h-24 w-auto rounded-md border border-border bg-white object-contain"
                />
                <div className="text-sm">
                  <div className="font-medium">{workOrder.signed_by || "—"}</div>
                  {workOrder.signed_at ? (
                    <div className="text-muted-foreground">
                      {fmtDateTime(workOrder.signed_at)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ยังไม่ได้เซ็นรับงาน — กด “ขอลายเซ็น” แล้วส่งเครื่องให้ลูกค้าเซ็น
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* The last thing that happens on the job, at the end of the page it
          happens on. Same rule as งานของฉัน: unsigned, it leads to the pad
          rather than refusing, because that is the step it is waiting on. */}
      {workOrder.status === "completed" || workOrder.status === "cancelled" ? null : (
        <button
          type="button"
          disabled={busy("status")}
          onClick={() =>
            workOrder.signature_path ? changeStatus("completed") : setSigning(true)
          }
          className={cn(
            "mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50",
            workOrder.signature_path
              ? "bg-emerald-600 active:bg-emerald-700 hover:bg-emerald-700"
              : "bg-slate-500 active:bg-slate-600 hover:bg-slate-600"
          )}
        >
          {busy("status") ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : workOrder.signature_path ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <PenLine className="h-5 w-5" />
          )}
          {busy("status")
            ? "กำลังบันทึก…"
            : workOrder.signature_path
              ? "ปิดงาน"
              : "ขอลายเซ็นก่อนปิดงาน"}
        </button>
      )}

      <SignaturePad
        open={signing}
        onClose={() => setSigning(false)}
        onSave={saveSignature}
        subtitle={[woCode(workOrder), workOrder.title].filter(Boolean).join(" · ")}
        defaultName={contactName ?? ""}
      />

      <PhotoViewer
        photos={shownPhotos}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onIndexChange={setViewerIndex}
      />

      {editing ? (
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
          contracts={contracts}
          assetIds={assetIds}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The caption under one photo, saved when the box is left.
 *
 * A photograph of a corroded fitting says nothing on its own a year later, and
 * the report prints these under each picture — so this is the difference
 * between evidence and a page of pipes. Saved on blur rather than behind a
 * button: on site the next thing anyone does is tap the following photo.
 */
function PhotoCaption({
  photo,
  workOrderId,
  onSaved,
}: {
  photo: PhotoWithUrl;
  workOrderId: string;
  onSaved: () => void;
}) {
  const saved = photo.caption ?? "";
  const [text, setText] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  function commit() {
    if (text.trim() === saved.trim() || saving) return;
    setSaving(true);
    startTransition(async () => {
      const res = await saveWorkOrderPhotoCaption(photo.id, text, workOrderId);
      setSaving(false);
      if (!res.ok) {
        setText(saved);
        return alert(res.error);
      }
      onSaved();
    });
  }

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setText(saved);
      }}
      disabled={saving}
      placeholder="คำบรรยาย…"
      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
    />
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

/**
 * One card for a list of consumable lines — วัสดุที่ใช้ or ของที่เบิกจาก store.
 * Both record the same thing (name, qty, unit, unit price, optional asset) and
 * both want a cost total, so they share this component and differ only by the
 * `source` written to work_order_parts.
 */
function PartsCard({
  title,
  emptyText,
  source,
  namePlaceholder = "ชื่อรายการ เช่น มอเตอร์, สายพาน…",
  qtyPlaceholder = "จำนวน",
  unitPlaceholder = "หน่วย เช่น ชิ้น",
  pricePlaceholder = "ราคาต่อหน่วย (บาท)",
  perUnit = "หน่วย",
  parts,
  assets,
  assetIds,
  workOrderId,
  onChanged,
}: {
  title: string;
  emptyText: string;
  source: "material" | "store" | "labor";
  /** Wording only — labour is counted in hours, materials in pieces. */
  namePlaceholder?: string;
  qtyPlaceholder?: string;
  unitPlaceholder?: string;
  pricePlaceholder?: string;
  perUnit?: string;
  parts: PartRow[];
  assets: AssetOption[];
  assetIds: string[];
  workOrderId: string;
  onChanged: () => void;
}) {
  const { run, busy } = useBusyTransition();
  const [draft, setDraft] = useState({
    name: "",
    qty: "1",
    unit: "",
    unit_price: "",
    equipment_id: "",
  });

  // Derived, never stored: a stored total would drift from the lines.
  const total = parts.reduce(
    (sum, p) => sum + (p.unit_price != null ? Number(p.qty) * Number(p.unit_price) : 0),
    0
  );
  const priceless = parts.filter((p) => p.unit_price == null).length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    run("add", async () => {
      const res = await addWorkOrderPart(
        workOrderId,
        draft.name,
        Number(draft.qty) || 1,
        draft.equipment_id || null,
        draft.unit || null,
        draft.unit_price === "" ? null : Number(draft.unit_price),
        source
      );
      if (!res.ok) return alert(res.error);
      setDraft({ name: "", qty: "1", unit: "", unit_price: "", equipment_id: "" });
      onChanged();
    });
  }

  function remove(part: PartRow) {
    if (!confirm(`ลบ “${part.name}” ออกจากรายการ?`)) return;
    run(`part-${part.id}`, async () => {
      const res = await deleteWorkOrderPart(part.id, workOrderId);
      if (!res.ok) alert(res.error);
      else onChanged();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}{" "}
          <span className="text-sm font-normal text-muted-foreground">({parts.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {parts.map((part) => {
            const asset = assets.find((a) => a.id === part.equipment_id);
            return (
              <div
                key={part.id}
                className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40"
              >
                <span className="flex-1 text-sm">
                  {part.name}{" "}
                  <span className="text-muted-foreground">
                    ×{Number(part.qty)}
                    {part.unit ? ` ${part.unit}` : ""}
                    {part.unit_price != null
                      ? ` · ${formatCurrency(Number(part.unit_price))}/${perUnit}`
                      : ""}
                  </span>
                  {asset ? (
                    <span className="block text-xs text-muted-foreground">{asset.name}</span>
                  ) : null}
                </span>
                {part.unit_price != null ? (
                  <span className="whitespace-nowrap text-sm font-medium">
                    {formatCurrency(Number(part.qty) * Number(part.unit_price))}
                  </span>
                ) : null}
                <button
                  onClick={() => remove(part)}
                  disabled={busy(`part-${part.id}`)}
                  className={cn(
                    "transition-opacity md:opacity-0 md:group-hover:opacity-100",
                    busy(`part-${part.id}`) && "md:opacity-100"
                  )}
                  aria-label="ลบ"
                >
                  {busy(`part-${part.id}`) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  )}
                </button>
              </div>
            );
          })}
          {parts.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
          ) : null}
        </div>

        {parts.length > 0 ? (
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-medium">รวม</span>
            <div className="text-right">
              <div className="text-base font-bold">{formatCurrency(total)}</div>
              {priceless > 0 ? (
                <div className="text-xs text-muted-foreground">
                  ยังไม่ได้ระบุราคา {priceless} รายการ
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <form onSubmit={add} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={namePlaceholder}
            />
            <Input
              type="number"
              min="1"
              step="1"
              value={draft.qty}
              onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
              className="w-20"
              aria-label="จำนวน"
              placeholder={qtyPlaceholder}
            />
          </div>
          <div className="flex gap-2">
            <Input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              className="w-28"
              aria-label="หน่วย"
              placeholder={unitPlaceholder}
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.unit_price}
              onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })}
              aria-label="ราคาต่อหน่วย"
              placeholder={pricePlaceholder}
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={draft.equipment_id}
              onChange={(e) => setDraft({ ...draft, equipment_id: e.target.value })}
              aria-label="Asset ที่เกี่ยวข้อง"
            >
              <option value="">— ไม่ระบุ Asset —</option>
              {assets
                .filter((a) => assetIds.includes(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
            <Button type="submit" disabled={busy("add")}>
              {busy("add") ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              เพิ่ม
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
