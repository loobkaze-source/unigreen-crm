import { cn } from "@/lib/utils";
import { PAPER, PrintStyles, sarabun } from "../print-styles";
import { PrintBar } from "../report/print-button";

type Photo = { id: string; url: string; caption: string };

/**
 * รูปหน้างาน, one photograph to a sheet.
 *
 * The service report puts six to a page because it is a document about a job.
 * This is the other thing photographs get asked for: a customer wanting the
 * permit paperwork, or the before-and-after, at a size they can actually read
 * — one heading, one file, one picture a page.
 *
 * The picture is given the whole sheet bar its header and caption, and fitted
 * inside it rather than filled: a photograph of a serial number cropped to fill
 * an A4 page is a photograph of nothing.
 */
export function PhotoSheets({
  photos,
  section,
  code,
  customerName,
  backHref,
}: {
  photos: Photo[];
  section: string;
  code: string;
  customerName: string;
  backHref: string;
}) {
  return (
    <div
      data-allow-zoom
      className="report-frame mx-auto w-full max-w-[210mm] print:max-w-none"
    >
      <PrintBar backHref={backHref} />
      <PrintStyles />

      <div className="report-fit">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className={cn(
              sarabun.className,
              "report-sheet mx-auto mt-[6mm] flex h-[281mm] w-[194mm] flex-col border border-black text-[3.4mm] leading-[1.45] text-black first:mt-0 print:mt-0 print:w-full",
              // Every sheet but the first starts a page of its own.
              i > 0 && "print:break-before-page"
            )}
            style={{ backgroundColor: PAPER }}
          >
            <div className="flex items-baseline justify-between border-b border-black p-[2.5mm]">
              <div className="font-bold">{section || "รูปหน้างาน / SITE PHOTOS"}</div>
              <div>
                {code} · {customerName}
              </div>
            </div>

            {/* min-h-0: the flex child has to be allowed to shrink, or a tall
                photograph pushes the caption off the bottom of the sheet. */}
            <div className="flex min-h-0 flex-1 items-center justify-center p-[3mm]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption || section || "รูปหน้างาน"}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="flex items-baseline justify-between gap-[4mm] border-t border-black p-[2.5mm]">
              <div className="min-w-0">{photo.caption}</div>
              <div className="shrink-0 whitespace-nowrap">
                {i + 1}/{photos.length}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
