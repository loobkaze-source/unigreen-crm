"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  Building2,
  FolderKanban,
  Layers,
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
import { cn } from "@/lib/utils";
import {
  saveEquipment,
  deleteEquipment,
  saveAssetGroup,
  deleteAssetGroup,
  assignAssetsToGroup,
} from "../actions";

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
type Group = { id: string; name: string; site_id: string };

export function SiteDetail({
  site,
  equipment,
  groups,
  warranties,
  contracts,
  companyName,
  contactName,
}: {
  site: Site;
  equipment: Equipment[];
  groups: Group[];
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

  // Bulk group assignment via checkboxes
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState("");
  const allSelected = equipment.length > 0 && selected.size === equipment.length;
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === equipment.length ? new Set() : new Set(equipment.map((e) => e.id))
    );
  }
  function assignSelected(groupId: string | null) {
    if (selected.size === 0) return;
    startTransition(async () => {
      const res = await assignAssetsToGroup([...selected], groupId, site.id);
      if (!res.ok) return alert(res.error);
      setSelected(new Set());
      setBulkGroup("");
      router.refresh();
    });
  }

  const EMPTY = {
    name: "",
    asset_type: "object" as AssetType,
    category: "solar_panel" as EquipmentCategory,
    brand: "",
    model: "",
    serial_number: "",
    project_number: "",
    group_id: "",
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
      group_id: eq.group_id || "",
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
        group_id: form.group_id || null,
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

  const groupName = (id: string | null) =>
    id ? groups.find((g) => g.id === id)?.name : undefined;
  const groupCount = (id: string) =>
    equipment.filter((eq) => eq.group_id === id).length;

  function addGroup() {
    const name = window.prompt("ตั้งชื่อกลุ่ม Asset ใหม่");
    if (!name?.trim()) return;
    startTransition(async () => {
      const res = await saveAssetGroup({ site_id: site.id, name });
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  function renameGroup(g: Group) {
    const name = window.prompt("เปลี่ยนชื่อกลุ่ม", g.name);
    if (!name?.trim() || name === g.name) return;
    startTransition(async () => {
      const res = await saveAssetGroup({ id: g.id, site_id: site.id, name });
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  function removeGroup(g: Group) {
    if (!confirm(`ลบกลุ่ม "${g.name}"? (Asset ในกลุ่มจะไม่ถูกลบ แค่หลุดจากกลุ่ม)`)) return;
    startTransition(async () => {
      const res = await deleteAssetGroup(g.id, site.id);
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
            {/* Asset groups (within this site) */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Layers className="h-3.5 w-3.5" /> กลุ่ม Asset:
              </span>
              {groups.length === 0 ? (
                <span className="text-xs text-muted-foreground">ยังไม่มีกลุ่ม</span>
              ) : (
                groups.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
                  >
                    {g.name}
                    <span className="text-muted-foreground">({groupCount(g.id)})</span>
                    <button
                      onClick={() => renameGroup(g)}
                      className="text-muted-foreground hover:text-primary"
                      title="เปลี่ยนชื่อกลุ่ม"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeGroup(g)}
                      className="text-muted-foreground hover:text-destructive"
                      title="ลบกลุ่ม"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={addGroup}
                disabled={pending}
                className="h-6 px-2 text-xs"
              >
                <Plus className="h-3 w-3" /> เพิ่มกลุ่ม
              </Button>
            </div>

            {/* Bulk assignment bar — appears when assets are selected */}
            {selected.size > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-accent/40 px-3 py-2 text-sm">
                <span className="font-medium">เลือกไว้ {selected.size} รายการ</span>
                <span className="text-muted-foreground">→ ย้ายเข้ากลุ่ม:</span>
                <Select
                  value={bulkGroup}
                  onChange={(e) => setBulkGroup(e.target.value)}
                  className="h-8 w-auto"
                >
                  <option value="">— เลือกกลุ่ม —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={pending || !bulkGroup}
                  onClick={() => assignSelected(bulkGroup)}
                >
                  ย้ายเข้ากลุ่ม
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => assignSelected(null)}
                  title="นำ Asset ที่เลือกออกจากกลุ่ม"
                >
                  เอาออกจากกลุ่ม
                </Button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  ล้างการเลือก
                </button>
              </div>
            ) : null}

            {equipment.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                ยังไม่มี Asset ในไซต์นี้
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="w-9 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[color:var(--primary)] align-middle"
                          checked={allSelected}
                          onChange={toggleAll}
                          title="เลือกทั้งหมด"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">รหัส Asset</th>
                      <th className="px-3 py-2 font-medium">Asset</th>
                      <th className="px-3 py-2 font-medium">ชนิด</th>
                      <th className="px-3 py-2 font-medium">กลุ่ม</th>
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
                          className={cn(
                            "group border-b border-border last:border-0 hover:bg-muted/30",
                            selected.has(eq.id) && "bg-accent/30"
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[color:var(--primary)] align-middle"
                              checked={selected.has(eq.id)}
                              onChange={() => toggleOne(eq.id)}
                            />
                          </td>
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
                          <td className="px-3 py-2">
                            {groupName(eq.group_id) ? (
                              <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                                <Layers className="h-3 w-3" /> {groupName(eq.group_id)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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

          <div>
            <Label htmlFor="group_id">กลุ่ม Asset</Label>
            <Select
              id="group_id"
              value={form.group_id}
              onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            >
              <option value="">— ไม่มีกลุ่ม —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            {groups.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                ยังไม่มีกลุ่มในไซต์นี้ — สร้างได้ที่ปุ่ม “เพิ่มกลุ่ม” เหนือรายการ Asset
              </p>
            ) : null}
          </div>

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
