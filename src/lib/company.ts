/**
 * The company as it appears on paperwork the customer keeps — the service
 * report today, quotations and invoices next.
 *
 * Address confirmed by the owner; the phone and fax were read off the printed
 * รายงานการซ่อม book and have not been checked against anything. Anything wrong
 * here is wrong on every document, so it is one constant rather than a value
 * per template.
 */
export const COMPANY = {
  nameEn: "UNIWAVE SERVICES LIMITED",
  nameTh: "บริษัท ยูนิเวฟ เซอร์วิสเซส จำกัด",
  addressLines: [
    "888/47 หมู่ที่ 9 ถนนเลียบคลองชลหารพิจิตร",
    "ตำบลบางปลา อำเภอบางพลี จ.สมุทรปราการ 10540",
  ],
  phone: "(662) 181-9005-8",
  fax: "(662) 181-9004",
  /** Printed at the foot of the report, as on the paper form. */
  footnote:
    "(การชำระเงินจ่ายเป็นเช็คในนามบริษัท ยูนิเวฟ เซอร์วิสเซส จำกัด เท่านั้น / PAYMENT BY CHEQUE ONLY)",
} as const;
