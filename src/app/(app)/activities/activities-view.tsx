"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isPast } from "date-fns";
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  Circle,
  GraduationCap,
  List,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  TriangleAlert,
  Users2,
  X,
} from "lucide-react";
import type { Activity, ActivityType } from "@/lib/database.types";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { saveActivity, toggleActivity, deleteActivity } from "./actions";
import { MonthCalendar, type CalendarItem } from "@/components/app/month-calendar";
import type { Conflicts } from "@/lib/schedule-conflicts";

type Option = { id: string; name: string };

const TYPES: { value: ActivityType; label: string; icon: typeof Phone }[] = [
  { value: "task", label: "งาน", icon: ListChecks },
  { value: "call", label: "โทร", icon: Phone },
  { value: "meeting", label: "ประชุม", icon: Calendar },
  { value: "email", label: "อีเมล", icon: Mail },
  { value: "note", label: "โน้ต", icon: StickyNote },
  { value: "training", label: "อบรม", icon: GraduationCap },
];
const typeMeta = (t: ActivityType) => TYPES.find((x) => x.value === t)!;

const FILTERS: { value: "open" | "done" | "all"; label: string }[] = [
  { value: "open", label: "ค้างอยู่" },
  { value: "done", label: "เสร็จแล้ว" },
  { value: "all", label: "ทั้งหมด" },
];

export function ActivitiesView({
  activities,
  technicians,
  crew,
  conflicts,
  companies,
  contacts,
  deals,
}: {
  activities: Activity[];
  technicians: Option[];
  /** Activity id → the technicians booked on it. */
  crew: Record<string, string[]>;
  /** Who is down for two things on one day, across jobs and courses. */
  conflicts: Conflicts;
  companies: Option[];
  contacts: Option[];
  deals: Option[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [asCalendar, setAsCalendar] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const EMPTY = {
    type: "task" as ActivityType,
    subject: "",
    body: "",
    due_date: "",
    contact_id: "",
    company_id: "",
    deal_id: "",
    technician_ids: [] as string[],
  };
  const [form, setForm] = useState(EMPTY);
  /**
   * A course is about the people on it, not about a customer — so the training
   * form swaps the contact, company and deal pickers for a roll call.
   */
  const isTraining = form.type === "training";
  const techName = useMemo(() => {
    const m = new Map(technicians.map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [technicians]);

  const nameOf = useMemo(() => {
    const c = new Map(contacts.map((x) => [x.id, x.name]));
    const co = new Map(companies.map((x) => [x.id, x.name]));
    const d = new Map(deals.map((x) => [x.id, x.name]));
    return { c, co, d };
  }, [contacts, companies, deals]);

  const filtered = useMemo(() => {
    return activities.filter((a) =>
      filter === "all" ? true : filter === "done" ? a.done : !a.done
    );
  }, [activities, filter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(a: Activity) {
    setEditing(a);
    setForm({
      type: a.type,
      subject: a.subject,
      body: a.body || "",
      due_date: a.due_date ? a.due_date.slice(0, 16) : "",
      contact_id: a.contact_id || "",
      company_id: a.company_id || "",
      deal_id: a.deal_id || "",
      technician_ids: crew[a.id] ?? [],
    });
    setError(null);
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveActivity({
        id: editing?.id,
        ...form,
        due_date: form.due_date || null,
        // A course has no customer behind it; a call has no roll call. Sending
        // the other kind's fields as empty is what lets a type be changed on an
        // activity that already exists.
        contact_id: isTraining ? null : form.contact_id || null,
        company_id: isTraining ? null : form.company_id || null,
        deal_id: isTraining ? null : form.deal_id || null,
        technician_ids: isTraining ? form.technician_ids : [],
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }
  function toggle(a: Activity) {
    startTransition(async () => {
      const res = await toggleActivity(a.id, !a.done);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }
  function remove(a: Activity) {
    if (!confirm(`ลบ "${a.subject}"?`)) return;
    startTransition(async () => {
      const res = await deleteActivity(a.id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function related(a: Activity) {
    // A training session's "related to" is the people on it.
    if (a.type === "training") {
      const on = crew[a.id] ?? [];
      return on.length ? [`ช่าง ${on.length} คน · ${on.map(techName).join(", ")}`] : [];
    }
    const parts = [
      a.contact_id && nameOf.c.get(a.contact_id),
      a.company_id && nameOf.co.get(a.company_id),
      a.deal_id && nameOf.d.get(a.deal_id),
    ].filter(Boolean);
    return parts as string[];
  }

  /** The clashes this activity is part of, if any. */
  const clashes = (a: Activity) => conflicts.byRecord[a.id] ?? [];

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      filtered
        .filter((a) => a.due_date)
        .map((a) => ({
          id: a.id,
          date: a.due_date!.slice(0, 10),
          href: "/activities",
          label: `${typeMeta(a.type).label} · ${a.subject}`,
          sub: related(a).join(" · ") || undefined,
          tone: (conflicts.byRecord[a.id]
            ? "danger"
            : a.done
              ? "success"
              : "info") as CalendarItem["tone"],
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- related() reads the same props these do
    [filtered, conflicts]
  );

  return (
    <div>
      <PageHeader
        title="กิจกรรม"
        subtitle="งาน, การโทร, การประชุม, โน้ต และคิวอบรมของช่าง"
      >
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มกิจกรรม
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-md border border-border p-0.5">
          {[
            { on: false, icon: List, label: "รายการ" },
            { on: true, icon: CalendarDays, label: "ปฏิทิน" },
          ].map((v) => (
            <button
              key={v.label}
              type="button"
              onClick={() => setAsCalendar(v.on)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
                asCalendar === v.on
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <v.icon className="h-3.5 w-3.5" /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Said once at the top, because a clash is about a person and the rows
          are about activities — you would otherwise have to spot it twice. */}
      {Object.keys(conflicts.byPerson).length ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">
              มีช่างถูกจองซ้อนกัน {Object.keys(conflicts.byPerson).length} รายการ
            </div>
            <div className="text-xs opacity-90">
              ช่างคนเดียวถูกลงทั้งใบงานและ/หรืออบรมในวันเดียวกัน — รายการที่ชนกันมีเครื่องหมายเตือนกำกับไว้
            </div>
          </div>
        </div>
      ) : null}

      {asCalendar ? <MonthCalendar items={calendarItems} /> : null}

      {asCalendar ? null : filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={filter === "done" ? "ยังไม่มีงานที่เสร็จ" : "ยังไม่มีกิจกรรม"}
          description="บันทึกการโทร นัดประชุม หรือเพิ่มงานติดตามผล"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> เพิ่มกิจกรรม
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {filtered.map((a) => {
            const meta = typeMeta(a.type);
            const Icon = meta.icon;
            const overdue =
              !a.done && a.due_date && isPast(new Date(a.due_date));
            return (
              <div
                key={a.id}
                className="group flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/30"
              >
                <button
                  onClick={() => toggle(a)}
                  className="mt-0.5 text-muted-foreground hover:text-primary"
                  aria-label={a.done ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "ทำเครื่องหมายว่าเสร็จ"}
                >
                  {a.done ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      a.done && "text-muted-foreground line-through"
                    )}
                  >
                    {a.subject}
                  </div>
                  {a.body ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {a.body}
                    </div>
                  ) : null}
                  {related(a).length ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <Users2 className="h-3 w-3" />
                      {related(a).join(" · ")}
                    </div>
                  ) : null}
                  {clashes(a).length ? (
                    <div className="mt-1 flex items-start gap-1 text-xs font-medium text-destructive">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>ชนกับ {clashes(a).map((c) => c.label).join(" · ")}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-1">
                  {a.due_date ? (
                    <span
                      className={cn(
                        "whitespace-nowrap text-xs",
                        overdue ? "font-medium text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {fmtDateTime(a.due_date)}
                    </span>
                  ) : null}
                  <div className="flex gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(a)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="type">ประเภท</Label>
              <Select
                id="type"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as ActivityType })
                }
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="due_date">กำหนดส่ง</Label>
              <Input
                id="due_date"
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="subject">หัวข้อ *</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="body">รายละเอียด</Label>
            <Textarea
              id="body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          {isTraining ? (
            <div>
              <Label htmlFor="crew">ช่างที่เข้าอบรม</Label>
              {form.technician_ids.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {form.technician_ids.map((id, i) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-sm text-accent-foreground"
                    >
                      {i + 1}. {techName(id)}
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            technician_ids: f.technician_ids.filter((x) => x !== id),
                          }))
                        }
                        aria-label={`เอา ${techName(id)} ออก`}
                        className="rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <Combobox
                id="crew"
                value=""
                onChange={(id) =>
                  id &&
                  setForm((f) => ({
                    ...f,
                    technician_ids: f.technician_ids.includes(id)
                      ? f.technician_ids
                      : [...f.technician_ids, id],
                  }))
                }
                placeholder="+ เพิ่มช่างเข้าคิวอบรม"
                options={technicians
                  .filter((t) => !form.technician_ids.includes(t.id))
                  .map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
          ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="contact_id">ผู้ติดต่อ</Label>
              <Combobox
                id="contact_id"
                value={form.contact_id}
                onChange={(v) => setForm({ ...form, contact_id: v })}
                placeholder="—"
                options={contacts.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <Label htmlFor="company_id">บริษัท</Label>
              <Combobox
                id="company_id"
                value={form.company_id}
                onChange={(company_id) => setForm({ ...form, company_id: company_id })}
                placeholder="—"
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <Label htmlFor="deal_id">ดีล</Label>
              <Select
                id="deal_id"
                value={form.deal_id}
                onChange={(e) => setForm({ ...form, deal_id: e.target.value })}
              >
                <option value="">—</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มกิจกรรม"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
