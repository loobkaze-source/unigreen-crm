"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cpu, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Site } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useDataTable,
  DataTableHead,
  DataTableFilterToggle,
  type ColumnDef,
} from "@/components/ui/data-table";
import { saveSite, deleteSite } from "./actions";

type Option = { id: string; name: string };
type SiteRow = Site & { equipmentCount: number };

const EMPTY = {
  name: "",
  company_id: "",
  address: "",
  map_url: "",
  contact_id: "",
  notes: "",
};

export function SitesView({
  sites,
  companies,
  contacts,
}: {
  sites: SiteRow[];
  companies: Option[];
  contacts: Option[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address || "").toLowerCase().includes(q)
    );
  }, [sites, query]);

  const columns = useMemo<ColumnDef<SiteRow>[]>(
    () => [
      {
        key: "name",
        header: "ไซต์",
        sortAccessor: (s) => s.name,
        filter: { kind: "text", accessor: (s) => s.name },
      },
      {
        key: "company",
        header: "นิติบุคคล",
        sortAccessor: (s) => companyName(s.company_id),
        filter: { kind: "select", accessor: (s) => companyName(s.company_id) },
      },
      {
        key: "equipmentCount",
        header: "อุปกรณ์",
        sortAccessor: (s) => s.equipmentCount,
      },
      { key: "_actions", header: "" },
    ],
    [companyName]
  );
  const table = useDataTable(filtered, columns, {
    initialSort: { key: "name", dir: "asc" },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(s: Site, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(s);
    setForm({
      name: s.name,
      company_id: s.company_id || "",
      address: s.address || "",
      map_url: s.map_url || "",
      contact_id: s.contact_id || "",
      notes: s.notes || "",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveSite({
        id: editing?.id,
        ...form,
        company_id: form.company_id || null,
        contact_id: form.contact_id || null,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(s: Site, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`ลบไซต์ "${s.name}"? อุปกรณ์ในไซต์จะถูกลบด้วย`)) return;
    startTransition(async () => {
      const res = await deleteSite(s.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="ไซต์งาน" subtitle="หน้างาน/สถานที่ติดตั้งของลูกค้า (1 นิติบุคคลมีได้หลายไซต์)">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มไซต์
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาไซต์…"
            className="pl-9"
          />
        </div>
        <DataTableFilterToggle table={table} />
      </div>

      {table.rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={sites.length ? "ไม่พบรายการ" : "ยังไม่มีไซต์งาน"}
          description={
            sites.length ? "ลองค้นด้วยคำอื่น" : "เพิ่มไซต์เพื่อจัดการอุปกรณ์และงานบริการตามสถานที่"
          }
          action={
            sites.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มไซต์
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={sites}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((s) => (
                <tr
                  key={s.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link href={`/sites/${s.id}`} className="block">
                      <div className="font-medium hover:text-primary">{s.name}</div>
                      {s.address ? (
                        <div className="text-xs text-muted-foreground">{s.address}</div>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {companyName(s.company_id)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Cpu className="h-3.5 w-3.5" /> {s.equipmentCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" onClick={(e) => openEdit(s, e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => remove(s, e)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไขไซต์" : "เพิ่มไซต์"}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div>
            <Label htmlFor="name">ชื่อไซต์ *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น โรงงานสาขา 1, อาคาร A"
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="company_id">นิติบุคคล (ลูกค้า)</Label>
            <Select
              id="company_id"
              value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value })}
            >
              <option value="">— ไม่ระบุ —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="address">ที่อยู่</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="map_url">ลิงก์แผนที่</Label>
              <Input
                id="map_url"
                value={form.map_url}
                onChange={(e) => setForm({ ...form, map_url: e.target.value })}
                placeholder="https://maps.google.com/…"
              />
            </div>
            <div>
              <Label htmlFor="contact_id">ผู้ติดต่อหน้างาน</Label>
              <Select
                id="contact_id"
                value={form.contact_id}
                onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              >
                <option value="">— ไม่ระบุ —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="notes">หมายเหตุ</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มไซต์"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
