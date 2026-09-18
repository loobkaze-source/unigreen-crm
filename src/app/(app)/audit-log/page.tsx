import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { loadAudit, TABLE_LABELS } from "@/lib/audit";
import { PageHeader } from "@/components/app/page-header";
import { ChangeLog } from "@/components/app/change-log";
import { cn } from "@/lib/utils";

/**
 * Everything that changed, newest first, across the whole org.
 *
 * Each record's own page shows its own history; this is the other way of
 * asking — what happened today, what did that person change, which customer
 * got renamed. Narrowed by table with the chips; the last 200 of whatever is
 * chosen.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const { supabase, org, isAdmin } = await getSessionContext();
  // Sits under ตั้งค่า with the other admin pages, and is guarded like them.
  if (!isAdmin) redirect("/dashboard");
  const { table } = await searchParams;
  const chosen = table && TABLE_LABELS[table] ? table : undefined;
  const entries = await loadAudit(supabase, org.id, { table: chosen, limit: 200 });

  return (
    <div>
      <PageHeader
        title="ประวัติการเปลี่ยนแปลง"
        subtitle="ใครแก้อะไร เมื่อไหร่ จากอะไรเป็นอะไร — ทุกตารางหลักของระบบ"
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {[["", "ทั้งหมด"], ...Object.entries(TABLE_LABELS)].map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/audit-log?table=${key}` : "/audit-log"}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              (chosen ?? "") === key
                ? "border-primary bg-primary text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      <ChangeLog
        entries={entries}
        showRecord
        title={chosen ? `ประวัติ · ${TABLE_LABELS[chosen]}` : "200 รายการล่าสุด"}
        empty="ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้ — เริ่มบันทึกตั้งแต่วันนี้เป็นต้นไป"
      />
    </div>
  );
}
