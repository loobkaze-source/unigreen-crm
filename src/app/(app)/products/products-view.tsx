"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Product } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency } from "@/lib/utils";
import { saveProduct, deleteProduct } from "./actions";

const EMPTY = {
  sku: "",
  name: "",
  category: "",
  barcode: "",
  cost: "",
  price: "",
  unit: "",
  quantity: "",
  description: "",
  active: "true",
};

export function ProductsView({ products }: { products: Product[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
    );
  }, [products, query]);

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        key: "name",
        header: "สินค้า",
        sortAccessor: (p) => p.name,
        filter: { kind: "text", accessor: (p) => p.name },
      },
      {
        key: "category",
        header: "หมวดหมู่",
        sortAccessor: (p) => p.category,
        filter: { kind: "text", accessor: (p) => p.category },
      },
      {
        key: "cost",
        header: "ทุน",
        className: "text-right",
        sortAccessor: (p) => p.cost,
      },
      {
        key: "price",
        header: "ราคาขาย",
        className: "text-right",
        sortAccessor: (p) => p.price,
      },
      {
        key: "quantity",
        header: "คงเหลือ",
        className: "text-right",
        sortAccessor: (p) => p.quantity,
      },
      { key: "_actions", header: "" },
    ],
    []
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
  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      sku: p.sku || "",
      name: p.name,
      category: p.category || "",
      barcode: p.barcode || "",
      cost: p.cost != null ? String(p.cost) : "",
      price: p.price != null ? String(p.price) : "",
      unit: p.unit || "",
      quantity: p.quantity != null ? String(p.quantity) : "",
      description: p.description || "",
      active: p.active ? "true" : "false",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveProduct({
        id: editing?.id,
        sku: form.sku,
        name: form.name,
        category: form.category,
        barcode: form.barcode,
        cost: form.cost,
        price: form.price,
        unit: form.unit,
        quantity: form.quantity,
        description: form.description,
        active: form.active === "true",
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(p: Product) {
    if (!confirm(`ลบสินค้า "${p.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteProduct(p.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="สินค้า" subtitle="แคตตาล็อกสินค้า/อุปกรณ์และราคา">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มสินค้า
        </Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสินค้า / SKU…"
            className="pl-9"
          />
        </div>
        <DataTableFilterToggle table={table} />
      </div>

      {table.rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length ? "ไม่พบรายการ" : "ยังไม่มีสินค้า"}
          description={products.length ? "ลองค้นด้วยคำอื่น" : "เพิ่มสินค้าเข้าแคตตาล็อก"}
          action={
            products.length ? null : (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> เพิ่มสินค้า
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <DataTableHead
              table={table}
              sourceRows={products}
              headClassName="uppercase tracking-wide"
            />
            <tbody>
              {table.rows.map((p) => (
                <tr
                  key={p.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {!p.active ? <Badge tone="muted">ปิดขาย</Badge> : null}
                    </div>
                    {p.sku ? (
                      <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category || "—"}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatCurrency(p.cost)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {p.quantity != null ? `${p.quantity} ${p.unit || ""}`.trim() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p)}>
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
        title={editing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">ชื่อสินค้า *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="sku">รหัสสินค้า (SKU)</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">หมวดหมู่</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="barcode">บาร์โค้ด</Label>
              <Input
                id="barcode"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label htmlFor="cost">ทุน</Label>
              <Input
                id="cost"
                type="number"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="price">ราคาขาย</Label>
              <Input
                id="price"
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="quantity">จำนวน</Label>
              <Input
                id="quantity"
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="unit">หน่วย</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="EA"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="description">คำอธิบาย</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="active">สถานะ</Label>
            <Select
              id="active"
              value={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.value })}
            >
              <option value="true">เปิดขาย</option>
              <option value="false">ปิดขาย</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
