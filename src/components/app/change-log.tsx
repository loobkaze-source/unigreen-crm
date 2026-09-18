import Link from "next/link";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { TABLE_LABELS, type AuditEntry } from "@/lib/audit";

const ACTION = {
  insert: { label: "สร้าง", tone: "success" as const },
  update: { label: "แก้ไข", tone: "info" as const },
  delete: { label: "ลบ", tone: "danger" as const },
};

/**
 * One record's history, or the org's — the same list either way.
 *
 * A line is who did what to which record, when; under it, the columns that
 * changed as "label: was → is". An insert or a delete names the record and
 * counts its fields rather than listing forty of them, because the point of
 * those lines is that the record appeared or went, not its every value.
 */
export function ChangeLog({
  entries,
  showRecord = false,
  title = "ประวัติการเปลี่ยนแปลง",
  empty = "ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้",
}: {
  entries: AuditEntry[];
  /** On the org-wide page: say which table and record each line is about. */
  showRecord?: boolean;
  title?: string;
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <AuditEntryRow key={e.id} entry={e} showRecord={showRecord} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** One line of the log: who did what, and what moved. */
export function AuditEntryRow({
  entry: e,
  showRecord = false,
}: {
  entry: AuditEntry;
  showRecord?: boolean;
}) {
  return (
    <li className="rounded-md border border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Badge tone={ACTION[e.action].tone}>{ACTION[e.action].label}</Badge>
        {showRecord ? (
          <span className="font-medium">
            {TABLE_LABELS[e.table] ?? e.table}
            {e.summary ? (
              <>
                {" · "}
                <RecordLink table={e.table} rowId={e.rowId} action={e.action}>
                  {e.summary}
                </RecordLink>
              </>
            ) : null}
          </span>
        ) : e.action !== "update" && e.summary ? (
          <span className="font-medium">{e.summary}</span>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {fmtDateTime(e.changedAt)} · {e.by}
        </span>
      </div>
      {e.action === "update" ? (
        <ul className="mt-1 space-y-0.5 text-xs">
          {e.changes.map((c) => (
            <li key={c.field} className="flex flex-wrap gap-x-1">
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="line-through decoration-muted-foreground/60 text-muted-foreground">
                {c.from ?? "—"}
              </span>
              <span>→</span>
              <span className="font-medium">{c.to ?? "—"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-0.5 text-xs text-muted-foreground">
          {e.changes.length} ฟิลด์
        </div>
      )}
    </li>
  );
}

/** Where a record's own page is, for the tables that have one. */
const DETAIL_ROUTE: Record<string, string> = {
  sites: "/sites",
  equipment: "/assets",
  work_orders: "/work-orders",
  cases: "/cases",
  service_contracts: "/service-contracts",
};

function RecordLink({
  table,
  rowId,
  action,
  children,
}: {
  table: string;
  rowId: string;
  action: AuditEntry["action"];
  children: React.ReactNode;
}) {
  const base = DETAIL_ROUTE[table];
  // A deleted record has no page to go to.
  if (!base || action === "delete") return <>{children}</>;
  return (
    <Link
      href={`${base}/${rowId}`}
      className="hover:text-primary hover:underline"
    >
      {children}
    </Link>
  );
}
