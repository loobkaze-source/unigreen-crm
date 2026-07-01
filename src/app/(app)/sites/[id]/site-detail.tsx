"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  Building2,
  FolderKanban,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import type {
  AssetType,
  Equipment,
  EquipmentCategory,
  Site,
} from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { warrantyEnd, warrantyState } from "@/lib/warranty";
import { assetCode } from "@/lib/asset";
import { fmtDate } from "@/lib/format";
import { saveEquipment, deleteEquipment } from "../actions";

const CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: "solar_panel", label: "แผงโซลาร์" },
  { value: "inverter", label: "อินเวอร์เตอร์" },
  { value: "ev_charger", label: "เครื่องชาร์จ EV" },
  { value: "battery", label: "แบตเตอรี่" },
  { value: "meter", label: "มิเตอร์" },
  { value: "other", label: "อื่นๆ" },
];
const catLabel = (v: EquipmentCategory) =>
  CATEGORIES.find((c) => c.value === v)?.label ?? v;

/** The identifier shown as "Asset ID": serial (object) or project no. (project). */
const assetId = (eq: Equipment) =>
  (eq.asset_type === "project" ? eq.project_number : eq.serial_number) || "—";

type Brief = { id: string; title: string; status: string; end_date: string | null };
type WarrantyBrief = Brief & { kind: string };

export function SiteDetail({
  site,
  equipment,
  warranties,
  contracts,
  companyName,
  contactName,
}: {
  site: Site;
  equipment: Equipment[];
  warranties: WarrantyBrief[];
  contracts: Brief[];
  companyName?: string;
  contactName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const EMPTY = {
    name: "",
    asset_type: "object" as AssetType,
    category: "solar_panel" as EquipmentCategory,
    brand: "",
    model: "",
    serial_number: "",
    project_number: "",
    warranty_months: "",
    warranty_start: "",
    install_date: "",
    notes: "",
  };
  const [form, setForm] = useState(EMPTY);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(eq: Equipment) {
    setEditing(eq);
    setForm({
      name: eq.name,
      asset_type: eq.asset_type || "object",
      category: eq.category,
      brand: eq.brand || "",
      model: eq.model || "",
      serial_number: eq.serial_number || "",
      project_number: eq.project_number || "",
      warranty_months: eq.warranty_months != null ? String(eq.warranty_months) : "",
      warranty_start: eq.warranty_start || "",
      install_date: eq.install_date || "",
      notes: eq.notes || "",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveEquipment({
        id: editing?.id,
        site_id: site.id,
        name: form.name,
        asset_type: form.asset_type,
        category: form.category,
        brand: form.brand,
        model: form.model,
        serial_number: form.serial_number,
        project_number: form.project_number,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        warranty_start: form.warranty_start || null,
        install_date: form.install_date || null,
        notes: form.notes,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(eq: Equipment) {
    if (!confirm(`ลบ Asset "${eq.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteEquipment(eq.id, site.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  const isProject = form.asset_type === "project";

  const mapHref =
    site.map_url ||
    (site.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`
      : null);

  return (
    <div>
      <Link
        href="/sites"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปไซต์งาน
      </Link>

      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">{site.name}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> {companyName || "—"}
          </span>
          {contactName ? (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> {contactName}
            </span>
          ) : null}
          {site.address ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {site.address}
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 font-medium text-primary hover:underline"
                >
                  (แผนที่)
                </a>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Assets */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              Asset{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({equipment.length})
              </span>
            </CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> เพิ่ม Asset
            </Button>
          </CardHeader>
          <CardContent>
            {equipment.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ยังไม่มี Asset ในไซต์นี้
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">รหัส Asset</th>
                      <th className="px-3 py-2 font-medium">Asset</th>
                      <th className="px-3 py-2 font-medium">ชนิด</th>
                      <th className="px-3 py-2 font-medium">Serial / เลขโครงการ</th>
                      <th className="px-3 py-2 font-medium">ประกัน</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map((eq) => {
                      const wEnd = warrantyEnd(eq.warranty_start, eq.warranty_months);
                      const wState = warrantyState(wEnd);
                      return (
                        <tr
                          key={eq.id}
                          className="group border-b border-border last:border-0 hover:bg-muted/30"
                        >
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {assetCode(eq.code)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {eq.asset_type === "project" ? (
                                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Box className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium">{eq.name}</span>
                            </div>
                            {eq.asset_type === "object" && (eq.brand || eq.model) ? (
                              <div className="pl-6 text-xs text-muted-foreground">
                                {[eq.brand, eq.model].filter(Boolean).join(" ")}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {eq.asset_type === "project"
                              ? "โครงการ"
                              : catLabel(eq.category)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {assetId(eq)}
                          </td>
                          <td className="px-3 py-2">
                            {wState === "none" ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <Badge tone={wState === "active" ? "success" : "danger"}>
                                {wState === "active" ? "ในประกันถึง " : "หมดประกัน "}
                                {wEnd ? fmtDate(wEnd) : ""}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(eq)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => remove(eq)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Related warranties + contracts */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> การรับประกัน
              </CardTitle>
              <Link href="/warranties" className="text-xs font-medium text-primary hover:underline">
                จัดการ
              </Link>
            </CardHeader>
            <CardContent>
              {warranties.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มี</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {warranties.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{w.title}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {w.end_date || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" /> สัญญาบริการ
              </CardTitle>
              <Link href="/service-contracts" className="text-xs font-medium text-primary hover:underline">
                จัดการ
              </Link>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มี</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {contracts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <Link href={`/service-contracts/${c.id}`} className="truncate hover:text-primary">
                        {c.title}
                      </Link>
                      <Badge tone={c.status === "active" ? "success" : "muted"}>
                        {c.status === "active" ? "ใช้งาน" : c.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไข Asset" : "เพิ่ม Asset"}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="asset_type">ชนิด Asset</Label>
              <Select
                id="asset_type"
                value={form.asset_type}
                onChange={(e) =>
                  setForm({ ...form, asset_type: e.target.value as AssetType })
                }
              >
                <option value="object">วัตถุ (มี Serial Number)</option>
                <option value="project">โครงการ (มีเลขโครงการ)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="eqname">ชื่อ Asset *</Label>
              <Input
                id="eqname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
          </div>

          {isProject ? (
            <div>
              <Label htmlFor="project_number">เลขที่โครงการ (Asset ID)</Label>
              <Input
                id="project_number"
                value={form.project_number}
                onChange={(e) => setForm({ ...form, project_number: e.target.value })}
                placeholder="เช่น PRJ-2026-001"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="category">ประเภท</Label>
                  <Select
                    id="category"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as EquipmentCategory })
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="serial_number">Serial number (Asset ID)</Label>
                  <Input
                    id="serial_number"
                    value={form.serial_number}
                    onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="brand">ยี่ห้อ</Label>
                  <Input
                    id="brand"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="model">รุ่น</Label>
                  <Input
                    id="model"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="warranty_start">ประกันเริ่ม</Label>
              <Input
                id="warranty_start"
                type="date"
                value={form.warranty_start}
                onChange={(e) => setForm({ ...form, warranty_start: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="warranty_months">ประกัน (เดือน)</Label>
              <Input
                id="warranty_months"
                type="number"
                min="0"
                value={form.warranty_months}
                onChange={(e) => setForm({ ...form, warranty_months: e.target.value })}
                placeholder="เช่น 24 = 2 ปี, 120 = 10 ปี"
              />
            </div>
            <div>
              <Label htmlFor="install_date">วันที่ติดตั้ง</Label>
              <Input
                id="install_date"
                type="date"
                value={form.install_date}
                onChange={(e) => setForm({ ...form, install_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="eqnotes">หมายเหตุ</Label>
            <Textarea
              id="eqnotes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่ม Asset"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
