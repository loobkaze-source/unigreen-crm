"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import type { Deal, Stage } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatCurrency } from "@/lib/utils";
import { DEPARTMENTS } from "@/lib/departments";
import { saveDeal, deleteDeal, updateDealStage } from "./actions";
import { createStage, renameStage, deleteStage, moveStage } from "./stage-actions";

type Option = { id: string; name: string };

export function DealsBoard({
  stages,
  deals: initialDeals,
  companies,
  contacts,
  canSeeAll = true,
  canManageStages = false,
  userDept = null,
}: {
  stages: Stage[];
  deals: Deal[];
  companies: Option[];
  contacts: Option[];
  /** Admins see every department's board; others are pinned to their own. */
  canSeeAll?: boolean;
  /** Admins can add / rename / reorder / delete this board's stages. */
  canManageStages?: boolean;
  userDept?: string | null;
}) {
  const router = useRouter();

  // Which department tabs this user may switch between.
  const boards = useMemo(() => {
    if (canSeeAll) return DEPARTMENTS;
    const mine = DEPARTMENTS.filter((d) => d.value === userDept);
    return mine.length ? mine : DEPARTMENTS;
  }, [canSeeAll, userDept]);

  const [deals, setDeals] = useState(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDept, setActiveDept] = useState<string>(boards[0].value);
  const [, startTransition] = useTransition();

  // Keep local board in sync with server data after refresh / mutations.
  useEffect(() => setDeals(initialDeals), [initialDeals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);
  const contactName = useMemo(() => {
    const m = new Map(contacts.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) : undefined);
  }, [contacts]);

  // Stages grouped per board, each ordered: open stages (by position), then
  // Won, then lost stages (Missed / Cancelled / …) pinned to the end.
  const stagesByBoard = useMemo(() => {
    const m = new Map<string, Stage[]>();
    for (const s of stages) {
      const arr = m.get(s.board_key) ?? [];
      arr.push(s);
      m.set(s.board_key, arr);
    }
    for (const [k, list] of m) {
      const open = list.filter((s) => !s.is_won && !s.is_lost);
      const won = list.filter((s) => s.is_won);
      const lost = list.filter((s) => s.is_lost);
      const byPos = (a: Stage, b: Stage) => a.position - b.position;
      m.set(k, [...open.sort(byPos), ...won.sort(byPos), ...lost.sort(byPos)]);
    }
    return m;
  }, [stages]);
  const boardStages = useMemo(
    () => stagesByBoard.get(activeDept) ?? [],
    [stagesByBoard, activeDept]
  );
  const firstStageOf = (board: string) => {
    const list = stagesByBoard.get(board) ?? [];
    return (list.find((s) => !s.is_won && !s.is_lost) ?? list[0])?.id ?? "";
  };

  const visibleDeals = useMemo(
    () => deals.filter((d) => (d.department || "unigreen") === activeDept),
    [deals, activeDept]
  );

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    boardStages.forEach((s) => map.set(s.id, []));
    visibleDeals.forEach((d) => {
      if (!map.has(d.stage_id)) map.set(d.stage_id, []);
      map.get(d.stage_id)!.push(d);
    });
    return map;
  }, [visibleDeals, boardStages]);

  // ---- Modal state ----
  const firstStage = firstStageOf(activeDept);
  const EMPTY = {
    title: "",
    value: "",
    currency: "THB",
    stage_id: firstStage,
    department: "unigreen",
    company_id: "",
    contact_id: "",
    expected_close_date: "",
    notes: "",
  };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openCreate(stageId?: string) {
    setEditing(null);
    setForm({ ...EMPTY, stage_id: stageId || firstStage, department: activeDept });
    setError(null);
    setOpen(true);
  }
  function openEdit(d: Deal) {
    setEditing(d);
    setForm({
      title: d.title,
      value: d.value != null ? String(d.value) : "",
      currency: d.currency || "THB",
      stage_id: d.stage_id,
      department: d.department || "unigreen",
      company_id: d.company_id || "",
      contact_id: d.contact_id || "",
      expected_close_date: d.expected_close_date || "",
      notes: d.notes || "",
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const res = await saveDeal({
        id: editing?.id,
        ...form,
        company_id: form.company_id || null,
        contact_id: form.contact_id || null,
        expected_close_date: form.expected_close_date || null,
      });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function remove(d: Deal) {
    if (!confirm(`ลบดีล "${d.title}"?`)) return;
    startTransition(async () => {
      const res = await deleteDeal(d.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  // ---- Stage management (admin only) ----
  const [newStageName, setNewStageName] = useState("");
  const [stageBusy, setStageBusy] = useState(false);
  function runStage(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setStageBusy(true);
    startTransition(async () => {
      const res = await fn();
      setStageBusy(false);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  function addStage() {
    const nm = newStageName.trim();
    if (!nm) return;
    runStage(async () => {
      const r = await createStage(activeDept, nm);
      if (r.ok) setNewStageName("");
      return r;
    });
  }
  // Open (reorderable) stages of the current board, to know the move edges.
  const openStageIds = boardStages
    .filter((s) => !s.is_won && !s.is_lost)
    .map((s) => s.id);

  // ---- Drag handlers ----
  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const dealId = String(active.id);
    const targetStage = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStage) return;

    const prev = deals;
    setDeals((ds) =>
      ds.map((d) => (d.id === dealId ? { ...d, stage_id: targetStage } : d))
    );
    startTransition(async () => {
      const res = await updateDealStage(dealId, targetStage);
      if (!res.ok) {
        setDeals(prev);
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;
  const totalValue = visibleDeals.reduce((s, d) => s + (d.value || 0), 0);
  const deptCount = (v: string) =>
    deals.filter((d) => (d.department || "unigreen") === v).length;

  if (stages.length === 0) {
    return (
      <div>
        <PageHeader title="ดีล" />
        <EmptyState
          title="ยังไม่มีขั้นตอนไปป์ไลน์"
          description="รัน migration ฐานข้อมูลเพื่อสร้างขั้นตอนเริ่มต้นของไปป์ไลน์"
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="ไปป์ไลน์"
        subtitle={`${visibleDeals.length} ดีลในบอร์ดนี้ · รวม ${formatCurrency(totalValue)}`}
      >
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4" /> เพิ่มดีล
        </Button>
      </PageHeader>

      {/* Department boards */}
      {boards.length > 1 ? (
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {boards.map((d) => (
          <button
            key={d.value}
            onClick={() => setActiveDept(d.value)}
            className={cn(
              "relative -mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeDept === d.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {d.label}
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {deptCount(d.value)}
            </span>
          </button>
        ))}
      </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {boardStages.map((stage) => {
            const openIdx = openStageIds.indexOf(stage.id);
            return (
              <Column
                key={stage.id}
                stage={stage}
                deals={byStage.get(stage.id) ?? []}
                companyName={companyName}
                contactName={contactName}
                onAdd={() => openCreate(stage.id)}
                onEdit={openEdit}
                onDelete={remove}
                canManageStages={canManageStages}
                stageBusy={stageBusy}
                canMoveLeft={openIdx > 0}
                canMoveRight={openIdx >= 0 && openIdx < openStageIds.length - 1}
                onRenameStage={(name) => runStage(() => renameStage(stage.id, name))}
                onDeleteStage={() =>
                  confirm(`ลบขั้นตอน "${stage.name}"?`) &&
                  runStage(() => deleteStage(stage.id))
                }
                onMoveStage={(dir) => runStage(() => moveStage(stage.id, dir))}
              />
            );
          })}

          {canManageStages ? (
            <div className="flex w-64 shrink-0 flex-col">
              <div className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
                เพิ่มขั้นตอน
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3">
                <Input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="ชื่อขั้นตอนใหม่…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addStage();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addStage}
                  disabled={stageBusy || !newStageName.trim()}
                >
                  <Plus className="h-4 w-4" /> เพิ่มขั้นตอน
                </Button>
                <p className="text-xs text-muted-foreground">
                  ขั้นตอนใหม่จะอยู่ก่อน Won / Missed (ซึ่งเป็นขั้นตอนถาวร)
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DragOverlay>
          {activeDeal ? (
            <DealCardInner
              deal={activeDeal}
              companyName={companyName(activeDeal.company_id)}
              contactName={contactName(activeDeal.contact_id)}
              dragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไขดีล" : "เพิ่มดีล"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="title">ชื่อดีล *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="value">มูลค่า</Label>
              <Input
                id="value"
                type="number"
                min="0"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="currency">สกุลเงิน</Label>
              <Input
                id="currency"
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value.toUpperCase() })
                }
                maxLength={3}
              />
            </div>
            <div>
              <Label htmlFor="stage_id">ขั้นตอน</Label>
              <Select
                id="stage_id"
                value={form.stage_id}
                onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
              >
                {(stagesByBoard.get(form.department) ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="department">บอร์ด / แผนก</Label>
            <Select
              id="department"
              value={form.department}
              disabled={!canSeeAll}
              onChange={(e) =>
                setForm({
                  ...form,
                  department: e.target.value,
                  stage_id: firstStageOf(e.target.value),
                })
              }
            >
              {boards.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company_id">บริษัท</Label>
              <Select
                id="company_id"
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              >
                <option value="">— ไม่มี —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="contact_id">ผู้ติดต่อ</Label>
              <Select
                id="contact_id"
                value={form.contact_id}
                onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              >
                <option value="">— ไม่มี —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="expected_close_date">วันที่คาดว่าจะปิด</Label>
            <Input
              id="expected_close_date"
              type="date"
              value={form.expected_close_date}
              onChange={(e) =>
                setForm({ ...form, expected_close_date: e.target.value })
              }
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
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มดีล"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Column({
  stage,
  deals,
  companyName,
  contactName,
  onAdd,
  onEdit,
  onDelete,
  canManageStages = false,
  stageBusy = false,
  canMoveLeft = false,
  canMoveRight = false,
  onRenameStage,
  onDeleteStage,
  onMoveStage,
}: {
  stage: Stage;
  deals: Deal[];
  companyName: (id: string | null) => string | undefined;
  contactName: (id: string | null) => string | undefined;
  onAdd: () => void;
  onEdit: (d: Deal) => void;
  onDelete: (d: Deal) => void;
  canManageStages?: boolean;
  stageBusy?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onRenameStage?: (name: string) => void;
  onDeleteStage?: () => void;
  onMoveStage?: (dir: "left" | "right") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + (d.value || 0), 0);

  // Inline rename (open, non-locked stages only).
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(stage.name);
  const editable = canManageStages && !stage.locked;
  function submitRename() {
    const nm = nameDraft.trim();
    setRenaming(false);
    if (nm && nm !== stage.name) onRenameStage?.(nm);
    else setNameDraft(stage.name);
  }

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="group mb-2 flex items-center justify-between gap-1 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              stage.is_won
                ? "bg-green-500"
                : stage.is_lost
                  ? "bg-red-500"
                  : "bg-primary"
            )}
          />
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") {
                  setNameDraft(stage.name);
                  setRenaming(false);
                }
              }}
              className="w-32 rounded border border-input bg-card px-1.5 py-0.5 text-sm font-semibold"
            />
          ) : (
            <span className="truncate text-sm font-semibold">{stage.name}</span>
          )}
          {stage.locked ? (
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="ขั้นตอนถาวร" />
          ) : null}
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {deals.length}
          </span>
        </div>
        {editable && !renaming ? (
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              disabled={stageBusy || !canMoveLeft}
              onClick={() => onMoveStage?.("left")}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="เลื่อนซ้าย"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={stageBusy || !canMoveRight}
              onClick={() => onMoveStage?.("right")}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="เลื่อนขวา"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={stageBusy}
              onClick={() => {
                setNameDraft(stage.name);
                setRenaming(true);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              title="เปลี่ยนชื่อ"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={stageBusy}
              onClick={() => onDeleteStage?.()}
              className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="ลบขั้นตอน"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatCurrency(total)}
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[140px] flex-1 flex-col gap-2 rounded-lg border border-dashed border-transparent bg-muted/40 p-2 transition-colors",
          isOver && "border-primary bg-accent"
        )}
      >
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            companyName={companyName(d.company_id)}
            contactName={contactName(d.contact_id)}
            onEdit={() => onEdit(d)}
            onDelete={() => onDelete(d)}
          />
        ))}

        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> เพิ่มดีล
        </button>
      </div>
    </div>
  );
}

function DealCard({
  deal,
  companyName,
  contactName,
  onEdit,
  onDelete,
}: {
  deal: Deal;
  companyName?: string;
  contactName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && "opacity-40")}
    >
      <div className="group rounded-md border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start gap-1">
          <button
            {...listeners}
            {...attributes}
            className="-ml-1 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            aria-label="ลากดีล"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button onClick={onEdit} className="flex-1 text-left">
            <div className="text-sm font-medium leading-snug">{deal.title}</div>
          </button>
          <button
            onClick={onDelete}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="ลบดีล"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
        <CardMeta companyName={companyName} contactName={contactName} />
        <div className="mt-2 text-sm font-semibold text-foreground">
          {formatCurrency(deal.value, deal.currency)}
        </div>
      </div>
    </div>
  );
}

function DealCardInner({
  deal,
  companyName,
  contactName,
}: {
  deal: Deal;
  companyName?: string;
  contactName?: string;
  dragging?: boolean;
}) {
  return (
    <div className="w-64 rotate-1 rounded-md border border-primary bg-card p-3 shadow-lg">
      <div className="text-sm font-medium leading-snug">{deal.title}</div>
      <CardMeta companyName={companyName} contactName={contactName} />
      <div className="mt-2 text-sm font-semibold">
        {formatCurrency(deal.value, deal.currency)}
      </div>
    </div>
  );
}

function CardMeta({
  companyName,
  contactName,
}: {
  companyName?: string;
  contactName?: string;
}) {
  if (!companyName && !contactName) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
      {companyName ? (
        <span className="inline-flex items-center gap-1">
          <Building2 className="h-3 w-3" /> {companyName}
        </span>
      ) : null}
      {contactName ? (
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" /> {contactName}
        </span>
      ) : null}
    </div>
  );
}
