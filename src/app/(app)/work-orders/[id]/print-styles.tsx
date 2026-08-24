import { Sarabun } from "next/font/google";

/**
 * The report is the one thing here that leaves the building on paper, and
 * Sarabun is what Thai official documents are set in — it holds its shape at
 * the eight-point sizes a form this dense needs, where the screen font goes
 * muddy. Loaded only by the printable pages, so the rest of the app is
 * unaffected.
 */
export const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

/**
 * White, and said out loud rather than left to the page: a sheet is drawn
 * inside an app that has a background of its own, and a printer that has been
 * told to print backgrounds will use whatever it finds. The green this was
 * tried in came out yellow on paper.
 */
export const PAPER = "#ffffff";

/**
 * Everything the printable pages need from the stylesheet, kept in one place
 * so the two of them cannot drift: the page size, black rules that survive the
 * app's own theme, a white page under the sheet, and the on-screen scaling
 * that fits an A4 sheet onto a phone.
 */
export function PrintStyles() {
  return (
    <style>{`
      @page { size: A4 portrait; margin: 8mm; }
      /*
       * globals.css sets border-color on every element, and an unlayered rule
       * like that beats Tailwind's border-black — so the rules on this form
       * were coming out in the app's own border colour, which on a dark
       * screen is nearly invisible and on paper is a pale grey.
       */
      .report-sheet, .report-sheet * { border-color: #000; }
      /*
       * On a phone the sheet is 194mm across — twice the screen — and reading
       * it meant dragging sideways through every line. Scaled to fit the
       * space it actually has instead: \`zoom\` rather than a transform, so the
       * page ends where the sheet ends and leaves no empty strip below it.
       *
       * The width comes from the container rather than the viewport, so the
       * sidebar counts on a narrow desktop window too. tan(atan2(a, b)) is
       * how CSS divides one length by another — calc() will not — and min()
       * keeps it from ever blowing the sheet up past its true size. Screen
       * only: on paper 194mm is 194mm.
       */
      @media screen {
        .report-frame { container-type: inline-size; }
        .report-fit { zoom: min(1, tan(atan2(100cqw - 3mm, 194mm))); }
      }
      @media print {
        .report-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /*
         * Printing backgrounds has to be on for the sheet to keep its own,
         * and with it on the app's page colour prints too — across every
         * inch of paper the sheet does not cover. The page is white here.
         */
        html, body { background: #fff !important; }
      }
    `}</style>
  );
}
