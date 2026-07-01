"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Company } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { saveCompany, deleteCompany } from "./actions";

const EMPTY = {
  customer_code: "",
  name: "",
  industry: "",
  website: "",
  phone: "",
  address: "",
  notes: "",
};

export function CompaniesView({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.customer_code || "").toLowerCase().includes(q) ||
        (c.industry || "").toLowerCase().includes(q)
    );
  }, [companies, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({
      customer_code: c.customer_code || "",
      name: c.name,
      industry: c.industry || "",
      website: c.website || "",
      phone: c.phone || "",
      address: c.address || "",
      notes: c.notes || "",
    });
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveCompany({ id: editing?.id, ...form });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  function remove(c: Company) {
    if (!confirm(`ลบ "${c.name}"? การลบนี้ย้อนกลับไม่ได้`)) return;
    startTransition(async () => {
      const res = await deleteCompany(c.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="ลูกค้า" subtitle="องค์กร/ลูกค้าที่คุณทำธุรกิจด้วย">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มลูกค้า
        </Button>
      </PageHeader>

      <div className="mb-4 relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาบริษัท…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={companies.length ? "ไม่พบรายการ" : "ยังไม่มีบริษัท"}
          description={
            companies.length
              ? "ลองค้นด้วยคำอื่น"
              : "เพิ่มบริษัทแรกของคุณเพื่อเริ่มเชื่อมโยงผู้ติดต่อและดีล"
          }
          action={
            companies.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มบริษัท
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">รหัส</th>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">อุตสาหกรรม</th>
                <th className="px-4 py-3 font-medium">เว็บไซต์</th>
                <th className="px-4 py-3 font-medium">โทรศัพท์</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.customer_code || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                        <Building2 className="h-4.5 w-4.5" />
                      </span>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.industry || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.website ? (
                      <a
                        href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        {c.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.phone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c)}>
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
        title={editing ? "แก้ไขบริษัท" : "เพิ่มบริษัท"}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <div>
              <Label htmlFor="customer_code">รหัสลูกค้า</Label>
              <Input
                id="customer_code"
                value={form.customer_code}
                onChange={(e) => setForm({ ...form, customer_code: e.target.value })}
                placeholder="L000001"
              />
            </div>
            <div>
              <Label htmlFor="name">ชื่อบริษัท *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="industry">อุตสาหกรรม</Label>
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">โทรศัพท์</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="website">เว็บไซต์</Label>
            <Input
              id="website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="company.com"
            />
          </div>
          <div>
            <Label htmlFor="address">ที่อยู่</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
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
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มบริษัท"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
