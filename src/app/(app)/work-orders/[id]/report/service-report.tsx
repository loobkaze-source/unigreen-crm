import { Sarabun } from "next/font/google";
import type { WorkOrder } from "@/lib/database.types";
import type { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";
import { woCode } from "../../constants";
import { PrintBar } from "./print-button";

/**
 * The report is the one thing here that leaves the building on paper, and
 * Sarabun is what Thai official documents are set in — it holds its shape at
 * the eight-point sizes a form this dense needs, where the screen font goes
 * muddy. Loaded only by this page, so the rest of the app is unaffected.
 */
const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

/**
 * The paper the report has always been printed on is pale green, and the rules
 * on it are black. Keeping both means a printout dropped on a desk beside the
 * old book is recognisably the same document.
 */
const PAPER = "#dcefe1";

type Part = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  source: string;
};

/** The nine boxes, in the two columns the paper prints them in. */
const TICKS: { no: number; label: string; en: string; group: "billing" | "kind"; key: string }[] = [
  { no: 6, label: "สินค้าอยู่ในระยะประกัน", en: "WARRANTY", group: "billing", key: "warranty" },
  { no: 7, label: "สัญญาบำรุงรักษา", en: "SERVICE CONTRACT", group: "billing", key: "contract" },
  { no: 8, label: "เก็บเงินลูกค้า", en: "CHARGE", group: "billing", key: "paid" },
  { no: 9, label: "งานติดตั้ง", en: "INSTALLATION", group: "kind", key: "installation" },
  { no: 10, label: "งานซ่อม", en: "REPAIR", group: "kind", key: "repair" },
  { no: 11, label: "ตรวจเช็คการทำงาน", en: "CMN", group: "kind", key: "cmn" },
  { no: 12, label: "ตรวจความเที่ยงตรง", en: "CALIBRATE", group: "kind", key: "calibrate" },
  { no: 13, label: "ย้ายอุปกรณ์", en: "RELOCATE", group: "kind", key: "relocate" },
  { no: 14, label: "ซ่อมบำรุง", en: "P.M.", group: "kind", key: "pm" },
];

const baht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Rendered on the server, where the clock is UTC — so the zone is named rather
 * than left to the machine. A visit that ran to 23:57 in Bangkok printed as
 * 16:57 without it, and a late-evening job printed yesterday's date.
 */
const TZ = "Asia/Bangkok";
const dmy = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        timeZone: TZ,
      })
    : "";
const hm = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
      })
    : "";

/** h:mm — "0.16" read as a decimal is ten minutes short of what it means. */
function hoursBetween(a: string | null, b: string | null) {
  if (!a || !b) return "";
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return "";
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className="mr-1 inline-flex h-[3.2mm] w-[3.2mm] shrink-0 items-center justify-center border border-black align-middle text-[2.6mm] leading-none">
      {on ? "✓" : ""}
    </span>
  );
}

/** A labelled slot: the caption, then the value on the ruled line beneath it. */
function Field({ label, value, className = "" }: { label: string; value?: string; className?: string }) {
  return (
    <div className={`flex items-baseline gap-1 ${className}`}>
      <span className="shrink-0 whitespace-pre font-semibold">{label}</span>
      <span className="min-w-0 flex-1 px-1">{value || " "}</span>
    </div>
  );
}

export function ServiceReport({
  company,
  workOrder: w,
  customerName,
  location,
  contactName,
  technicianName,
  assets,
  parts,
  crew,
  photos,
  signatureUrl,
}: {
  company: typeof COMPANY;
  workOrder: WorkOrder;
  customerName: string;
  location: string;
  contactName: string;
  technicianName: string;
  assets: { name: string; model: string; serial: string }[];
  parts: Part[];
  /** Everyone who was on site, in the order they were added. */
  crew: string[];
  photos: { id: string; url: string; caption: string }[];
  signatureUrl: string | null;
}) {
  const materials = parts.filter((p) => p.source !== "labor");
  const labour = parts.filter((p) => p.source === "labor");
  const sum = (rows: Part[]) =>
    rows.reduce((t, p) => t + (p.unitPrice == null ? 0 : p.qty * p.unitPrice), 0);
  const kinds: string[] = w.work_kinds ?? [];
  const on = (t: (typeof TICKS)[number]) =>
    t.group === "billing" ? w.billing === t.key : kinds.includes(t.key);
  const mileage =
    w.mileage_start != null && w.mileage_end != null && w.mileage_end >= w.mileage_start
      ? (w.mileage_end - w.mileage_start).toLocaleString("th-TH", { maximumFractionDigits: 1 })
      : "";

  // Blank rows keep the two tables the same height as the printed ones, so a
  // report with one part does not collapse into a strip nobody can write on.
  const padTo = (rows: Part[], n: number) => [...rows, ...Array(Math.max(0, n - rows.length)).fill(null)];

  return (
    <div className="mx-auto w-full max-w-[210mm] print:max-w-none">
      <PrintBar backHref={`/work-orders/${w.id}`} />

      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          .report-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div
      className={cn(
        sarabun.className,
        "report-sheet mx-auto w-[194mm] border border-black p-0 text-[3.1mm] leading-[1.45] text-black print:w-full"
      )}
      style={{ backgroundColor: PAPER }}
    >
        {/* ---- head ---------------------------------------------------- */}
        <div className="flex border-b border-black">
          <div className="w-1/2 border-r border-black p-[2mm]">
            <div className="text-[4mm] font-bold">{company.nameEn}</div>
            <div className="font-semibold">{company.nameTh}</div>
            {company.addressLines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            <div>โทร. {company.phone}</div>
            <div>แฟกซ์ {company.fax}</div>
          </div>
          <div className="w-1/2 p-[2mm]">
            <div className="mb-[1.5mm] text-center text-[4.2mm] font-bold">
              รายงานการซ่อม / SERVICE REPORT
            </div>
            <Field label="JOB NO." value={w.customer_job_no ?? ""} />
            <Field label="SERVICE REPORT NO." value={woCode(w)} />
            <Field label="วันที่/DATE" value={dmy(w.started_at ?? w.scheduled_start)} />
            <div className="flex gap-1">
              <Field label="เวลาเริ่มงาน/TIME" value={hm(w.started_at)} className="flex-1" />
              <Field label="ถึง/TO" value={hm(w.finished_at)} className="flex-1" />
              <Field
                label="รวม/TOTAL"
                value={hoursBetween(w.started_at, w.finished_at)}
                className="w-[26mm]"
              />
            </div>
            <div className="flex gap-1">
              <Field
                label="ระยะทาง/MILEAGE"
                value={w.mileage_start?.toString() ?? ""}
                className="flex-1"
              />
              <Field label="ถึง/TO" value={w.mileage_end?.toString() ?? ""} className="flex-1" />
              <Field label="รวม/TOTAL" value={mileage} className="w-[26mm]" />
            </div>
          </div>
        </div>

        {/* ---- customer / equipment ------------------------------------ */}
        <div className="flex border-b border-black">
          <div className="w-1/2 border-r border-black p-[2mm]">
            <div className="font-semibold">ชื่อลูกค้า/CUSTOMER</div>
            <Field label="1. ชื่อ/NAME" value={customerName} />
            <div className="mt-[1mm] flex items-baseline gap-1">
              <span className="shrink-0 font-semibold">2. ที่อยู่/LOCATION</span>
              <span className="min-w-0 flex-1 whitespace-pre-line px-1">
                {location || " "}
              </span>
            </div>
            {contactName ? <div className="mt-[1mm]">ผู้ติดต่อ: {contactName}</div> : null}
          </div>
          <div className="w-1/2 p-[2mm]">
            <div className="font-semibold">รายละเอียดอุปกรณ์/EQUIPMENT</div>
            {assets.length <= 1 ? (
              <>
                <Field label="3. ชื่อ/NAME" value={assets[0]?.name ?? ""} />
                <Field label="4. รุ่น/MODEL" value={assets[0]?.model ?? ""} />
                <Field label="5. รหัสประจำเครื่อง/SERIAL NO." value={assets[0]?.serial ?? ""} />
              </>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="border-b border-black">3. ชื่อ/NAME</th>
                    <th className="border-b border-black">4. รุ่น/MODEL</th>
                    <th className="border-b border-black">5. SERIAL NO.</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => (
                    <tr key={i}>
                      <td className="pr-1 align-top">{a.name}</td>
                      <td className="pr-1 align-top">{a.model}</td>
                      <td className="align-top">{a.serial}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ---- what was done ------------------------------------------- */}
        <div className="border-b border-black p-[2mm]">
          <div className="font-semibold">รายละเอียดการทำงาน/WORK DESCRIPTION</div>
          <div className="mt-[1mm] grid grid-cols-3 gap-x-[3mm] gap-y-[0.6mm]">
            {TICKS.map((t) => (
              <div key={t.no} className="flex items-center">
                <span className="w-[6mm] shrink-0">{t.no}.</span>
                <Tick on={on(t)} />
                <span className="truncate">
                  {t.label}/{t.en}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-[2mm] flex items-baseline gap-1">
            <span className="shrink-0 font-semibold">15. DESCRIPTION OF WORK</span>
          </div>
          {/* The codes are what a year of these gets counted by, so they print
              with the work rather than being left in the system. */}
          <div className="mt-[1mm] grid grid-cols-2 gap-x-[3mm]">
            <Field label="รหัสอาการเสีย" value={(w.fault_codes ?? []).join(", ")} />
            <Field label="รหัสซ่อม" value={(w.repair_codes ?? []).join(", ")} />
            <Field label="สาเหตุของปัญหา" value={(w.causes ?? []).join(", ")} />
            <Field label="วิธีการแก้ไข" value={w.remedy ?? ""} />
          </div>
          {/* The technician's own words, under their own heading — run straight
              on under the codes they read as a caption to them. */}
          <div className="mt-[1.5mm] flex items-baseline gap-1">
            <span className="shrink-0 font-semibold">หมายเหตุของช่าง/TECHNICIAN REMARK</span>
          </div>
          <div className="min-h-[15mm] whitespace-pre-line pt-[1mm]">
            {w.technician_remark || w.description || ""}
          </div>
        </div>

        {/* ---- parts and labour ---------------------------------------- */}
        <div className="flex border-b border-black">
          <div className="w-[62%] border-r border-black p-[2mm]">
            <div className="font-semibold">รายการอะไหล่ที่ใช้/PART REPLACE</div>
            <table className="mt-[1mm] w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-[8mm] border border-black p-[0.8mm]">ลำดับ</th>
                  <th className="border border-black p-[0.8mm]">รายละเอียด/DESCRIPTION</th>
                  <th className="w-[14mm] border border-black p-[0.8mm]">จำนวน</th>
                  <th className="w-[20mm] border border-black p-[0.8mm]">ราคาต่อหน่วย</th>
                  <th className="w-[22mm] border border-black p-[0.8mm]">ราคารวม</th>
                </tr>
              </thead>
              <tbody>
                {padTo(materials, 5).map((p: Part | null, i: number) => (
                  <tr key={p?.id ?? `blank-${i}`}>
                    <td className="border border-black p-[0.8mm] text-center">{p ? i + 1 : ""}</td>
                    <td className="border border-black p-[0.8mm]">{p?.name ?? ""}</td>
                    <td className="border border-black p-[0.8mm] text-center">
                      {p ? `${p.qty}${p.unit ? ` ${p.unit}` : ""}` : ""}
                    </td>
                    <td className="border border-black p-[0.8mm] text-right">
                      {p?.unitPrice != null ? baht(p.unitPrice) : ""}
                    </td>
                    <td className="border border-black p-[0.8mm] text-right">
                      {p?.unitPrice != null ? baht(p.qty * p.unitPrice) : ""}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="border border-black p-[0.8mm] text-right font-semibold">
                    รวมเงิน
                  </td>
                  <td className="border border-black p-[0.8mm] text-right font-semibold">
                    {sum(materials) ? baht(sum(materials)) : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="w-[38%] p-[2mm]">
            <div className="font-semibold">ค่าแรง/LABOR CHARGE</div>
            <table className="mt-[1mm] w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-black p-[0.8mm]">รายละเอียด</th>
                  <th className="w-[12mm] border border-black p-[0.8mm]">ชม.</th>
                  <th className="w-[22mm] border border-black p-[0.8mm]">ราคา/บาท</th>
                </tr>
              </thead>
              <tbody>
                {padTo(labour, 5).map((p: Part | null, i: number) => (
                  <tr key={p?.id ?? `blank-${i}`}>
                    <td className="border border-black p-[0.8mm]">{p?.name ?? ""}</td>
                    <td className="border border-black p-[0.8mm] text-center">{p ? p.qty : ""}</td>
                    <td className="border border-black p-[0.8mm] text-right">
                      {p?.unitPrice != null ? baht(p.qty * p.unitPrice) : ""}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="border border-black p-[0.8mm] text-right font-semibold">
                    รวมเงิน
                  </td>
                  <td className="border border-black p-[0.8mm] text-right font-semibold">
                    {sum(labour) ? baht(sum(labour)) : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- sign-off ------------------------------------------------ */}
        <div className="flex">
          <div className="w-1/2 border-r border-black p-[2mm]">
            <div className="flex items-baseline gap-1">
              <span className="shrink-0 font-semibold">หมายเหตุ/REMARK</span>
            </div>
            <div className="min-h-[10mm] whitespace-pre-line pt-[1mm]">{w.description ?? ""}</div>
            <div className="mt-[2mm] flex gap-1">
              <Field label="พนักงานบริการ/CUSTOMER SERVICE" value={technicianName} className="flex-1" />
            </div>
            <Field
              label="วันที่/DATE"
              value={dmy(w.finished_at ?? w.started_at)}
              className="mt-[1mm] w-[40mm]"
            />
            {crew.length ? (
              <div className="mt-[1mm]">
                ช่างที่เข้าหน้างาน: {crew.map((n, i) => `${i + 1}. ${n}`).join("  ")}
              </div>
            ) : null}
          </div>

          <div className="w-1/2 p-[2mm]">
            <div className="font-semibold">ลูกค้ารับรองรายงาน/SERVICE REPORT ACCEPTED BY CUSTOMER</div>
            <div className="text-[2.9mm]">
              ข้าพเจ้าได้รับการบริการและตรวจสอบสินค้าตามรายการข้างต้นเรียบร้อยแล้ว
            </div>
            <div className="relative mt-[1mm] h-[18mm]">
              {signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureUrl}
                  alt="ลายเซ็นลูกค้า"
                  className="absolute inset-0 mx-auto h-full w-auto object-contain mix-blend-multiply"
                />
              ) : null}
            </div>
            <Field label="ลงชื่อ/SIGN" value={w.signed_by ?? ""} />
            <Field label="วันที่/DATE" value={dmy(w.signed_at)} className="mt-[1mm] w-[40mm]" />
          </div>
        </div>

        <div className="border-t border-black p-[1.5mm] text-center text-[2.7mm]">
          {company.footnote}
        </div>
      </div>

      {/* Page two: what the visit looked like. Kept off the first sheet because
          the first sheet is the one that gets signed and filed, and a customer
          reading it should not have to turn past photographs to reach it. */}
      {photos.length ? (
        <div
          className={cn(
            sarabun.className,
            "report-sheet mx-auto mt-[6mm] w-[194mm] border border-black text-[3.1mm] leading-[1.45] text-black print:mt-0 print:w-full print:break-before-page"
          )}
          style={{ backgroundColor: PAPER }}
        >
          <div className="flex items-baseline justify-between border-b border-black p-[2mm]">
            <div className="font-bold">รูปหน้างาน / SITE PHOTOS</div>
            <div>
              {woCode(w)} · {customerName}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[3mm] p-[3mm]">
            {photos.map((p) => (
              <div key={p.id} className="break-inside-avoid">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption || "รูปหน้างาน"}
                  className="h-[62mm] w-full border border-black object-contain"
                />
                {p.caption ? <div className="pt-[1mm]">{p.caption}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
