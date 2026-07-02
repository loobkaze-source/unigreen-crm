import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Box,
  CalendarCheck,
  FolderKanban,
  Layers,
  MapPin,
  ShieldCheck,
  ShieldX,
  Truck,
  Wrench,
  Cog,
} from "lucide-react";
import { getSessionContext, row, rows } from "@/lib/data";
import type { Equipment, WorkOrder } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { warrantyEnd, warrantyState } from "@/lib/warranty";
import { assetCode } from "@/lib/asset";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { statusMeta, typeLabel, woCode, jobClassLabel } from "../../work-orders/constants";
import { AssetStatusControl } from "./status-control";

const CATEGORIES: Record<string, string> = {
  solar_panel: "แผงโซลาร์",
  inverter: "อินเวอร์เตอร์",
  ev_charger: "เครื่องชาร์จ EV",
  battery: "แบตเตอรี่",
  meter: "มิเตอร์",
  other: "อื่นๆ",
};

type PartRow = {
  id: string;
  work_order_id: string;
  name: string;
  qty: number;
  created_at: string;
};

export default async function AssetLifetimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org, isAdmin, appRole } = await getSessionContext();
  const canOverride = isAdmin || appRole === "Dispatcher";

  const eq = row<Equipment>(
    await supabase
      .from("equipment")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()
  );
  if (!eq) notFound();

  const [siteRes, groupRes, directWoRes, linkRes, partsRes] = await Promise.all([
    eq.site_id
      ? supabase.from("sites").select("id, name").eq("id", eq.site_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    eq.group_id
      ? supabase.from("asset_groups").select("name").eq("id", eq.group_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("work_orders").select("*").eq("asset_id", id),
    supabase.from("work_order_assets").select("work_order_id").eq("equipment_id", id),
    supabase
      .from("work_order_parts")
      .select("id, work_order_id, name, qty, created_at")
      .eq("equipment_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const site = siteRes.data as { id: string; name: string } | null;
  const groupNm = (groupRes.data as { name: string } | null)?.name;
  const parts = (partsRes.data ?? []) as PartRow[];

  // Work orders touching this asset: direct asset_id + M2M links, deduped.
  const directWos = rows<WorkOrder>(directWoRes as never);
  const linkedIds = (linkRes.data ?? [])
    .map((r) => r.work_order_id as string)
    .filter((woId) => !directWos.some((w) => w.id === woId));
  const linkedWos: WorkOrder[] = linkedIds.length
    ? rows<WorkOrder>(
        (await supabase.from("work_orders").select("*").in("id", linkedIds)) as never
      )
    : [];
  const workOrders = [...directWos, ...linkedWos].sort((a, b) =>
    (a.scheduled_start || a.created_at).localeCompare(b.scheduled_start || b.created_at)
  );

  const repairs = workOrders.filter(
    (w) => w.job_class === "CM" || w.type === "repair"
  );
  const partsByWo = new Map<string, PartRow[]>();
  for (const p of parts) {
    (partsByWo.get(p.work_order_id) ?? partsByWo.set(p.work_order_id, []).get(p.work_order_id)!).push(p);
  }
  const partRounds = partsByWo.size;
  const partPieces = parts.reduce((s, p) => s + Number(p.qty || 0), 0);

  const wEnd = warrantyEnd(eq.warranty_start, eq.warranty_months);
  const wState = warrantyState(wEnd);

  // Lifetime timeline, oldest first.
  type Ev = {
    key: string;
    date: string | null;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    title: string;
    detail?: React.ReactNode;
    future?: boolean;
  };
  const events: Ev[] = [];
  if (eq.install_date)
    events.push({
      key: "deliver",
      date: eq.install_date,
      icon: Truck,
      tone: "bg-sky-100 text-sky-700",
      title: "ส่งมอบวันแรก",
    });
  if (eq.warranty_start)
    events.push({
      key: "wstart",
      date: eq.warranty_start,
      icon: ShieldCheck,
      tone: "bg-green-100 text-green-700",
      title: `เริ่มรับประกัน (${eq.warranty_months ?? "—"} เดือน)`,
    });
  for (const w of workOrders) {
    const meta = statusMeta(w.status);
    const woParts = partsByWo.get(w.id) ?? [];
    events.push({
      key: w.id,
      date: (w.scheduled_start || w.created_at).slice(0, 10),
      icon: Wrench,
      tone:
        w.job_class === "CM" || w.type === "repair"
          ? "bg-amber-100 text-amber-700"
          : "bg-accent text-accent-foreground",
      title: `${woCode(w.number)} · ${w.title}`,
      detail: (
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{typeLabel(w.type)}</span>
          {w.job_class ? <span>· {jobClassLabel(w.job_class)}</span> : null}
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {woParts.length ? (
            <span className="text-muted-foreground">
              · เปลี่ยนอะไหล่: {woParts.map((p) => `${p.name} ×${Number(p.qty)}`).join(", ")}
            </span>
          ) : null}
        </span>
      ),
    });
  }
  if (wEnd) {
    const end = wEnd.toISOString().slice(0, 10);
    events.push({
      key: "wend",
      date: end,
      icon: ShieldX,
      tone: wState === "expired" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground",
      title: wState === "expired" ? "หมดประกันแล้ว" : "วันหมดประกัน",
      future: wState !== "expired",
    });
  }
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const stats = [
    { label: "เริ่มส่งมอบ", value: eq.install_date ? fmtDate(eq.install_date) : "—", icon: Truck },
    { label: "เริ่มรับประกัน", value: eq.warranty_start ? fmtDate(eq.warranty_start) : "—", icon: ShieldCheck },
    {
      label: wState === "expired" ? "หมดประกันแล้ว" : "หมดประกัน",
      value: wEnd ? fmtDate(wEnd) : "—",
      icon: ShieldX,
      tone: wState === "expired" ? "text-red-600" : wState === "active" ? "text-green-700" : undefined,
    },
    { label: "ซ่อมไปแล้ว", value: `${repairs.length} ครั้ง`, icon: Wrench },
    { label: "เปลี่ยนอะไหล่", value: `${partRounds} รอบ (${partPieces} ชิ้น)`, icon: Cog },
  ];

  return (
    <div>
      <Link
        href="/assets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปหน้า Asset
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            {eq.asset_type === "project" ? (
              <FolderKanban className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Box className="h-5 w-5 text-muted-foreground" />
            )}
            {eq.name}
            <span className="font-mono text-sm font-normal text-muted-foreground">
              {assetCode(eq.code)}
            </span>
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {eq.asset_type === "project" ? "โครงการ" : CATEGORIES[eq.category] ?? eq.category}
              {[eq.brand, eq.model].filter(Boolean).length
                ? ` · ${[eq.brand, eq.model].filter(Boolean).join(" ")}`
                : ""}
            </span>
            {(eq.asset_type === "project" ? eq.project_number : eq.serial_number) ? (
              <span className="font-mono text-xs">
                {eq.asset_type === "project" ? eq.project_number : eq.serial_number}
              </span>
            ) : null}
            {site ? (
              <Link
                href={`/sites/${site.id}`}
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                <MapPin className="h-3.5 w-3.5" /> {site.name}
              </Link>
            ) : null}
            {groupNm ? (
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> {groupNm}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssetStatusControl
            equipmentId={eq.id}
            status={eq.status}
            canOverride={canOverride}
            canRetire={isAdmin}
          />
          {wState !== "none" ? (
            <Badge tone={wState === "active" ? "success" : "danger"}>
              {wState === "active" ? "ในประกันถึง " : "หมดประกัน "}
              {wEnd ? fmtDate(wEnd) : ""}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Lifetime stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <s.icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={cn("truncate text-sm font-semibold", s.tone)}>{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" /> Lifetime Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ยังไม่มีประวัติ — กำหนดวันส่งมอบ/ประกันได้ที่หน้าไซต์ หรือสร้างใบสั่งงานที่เลือก Asset นี้
              </p>
            ) : (
              <ol className="relative ml-3 space-y-5 border-l border-border pl-6">
                {events.map((ev) => (
                  <li key={ev.key} className={cn("relative", ev.future && "opacity-60")}>
                    <span
                      className={cn(
                        "absolute -left-[35px] flex h-7 w-7 items-center justify-center rounded-full",
                        ev.tone
                      )}
                    >
                      <ev.icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {ev.date ? fmtDate(ev.date) : "—"}
                      {ev.future ? " (อนาคต)" : ""}
                    </div>
                    <div className="text-sm font-medium">
                      {ev.key.length === 36 ? (
                        <Link href={`/work-orders/${ev.key}`} className="hover:text-primary">
                          {ev.title}
                        </Link>
                      ) : (
                        ev.title
                      )}
                    </div>
                    {ev.detail ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{ev.detail}</div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Parts replaced */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cog className="h-4 w-4 text-primary" /> อะไหล่ที่เปลี่ยน
              <span className="text-sm font-normal text-muted-foreground">
                ({partRounds} รอบ · {partPieces} ชิ้น)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {parts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มี — บันทึกได้ในหน้าใบสั่งงาน (ส่วน &quot;อะไหล่ที่เปลี่ยน&quot;)
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {parts.map((p) => {
                  const wo = workOrders.find((w) => w.id === p.work_order_id);
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {p.name} <span className="text-muted-foreground">×{Number(p.qty)}</span>
                        </div>
                        {wo ? (
                          <Link
                            href={`/work-orders/${wo.id}`}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            {woCode(wo.number)} · {wo.title}
                          </Link>
                        ) : null}
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(p.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
