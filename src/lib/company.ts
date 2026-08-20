/**
 * The company as it appears on paperwork the customer keeps — the service
 * report today, quotations and invoices next.
 *
 * Address and phone confirmed by the owner. The fax was read off the printed
 * รายงานการซ่อม book and has not been checked against anything. Anything wrong
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
  phone: "+66 80 005 9824",
  fax: "(662) 181-9004",
  /** Printed at the foot of the report, as on the paper form. */
  footnote:
    "(การชำระเงินจ่ายเป็นเช็คในนามบริษัท ยูนิเวฟ เซอร์วิสเซส จำกัด เท่านั้น / PAYMENT BY CHEQUE ONLY)",
} as const;
