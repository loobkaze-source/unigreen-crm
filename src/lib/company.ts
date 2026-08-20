/**
 * The company as it appears on paperwork the customer keeps — the service
 * report today, quotations and invoices next.
 *
 * Taken from the printed รายงานการซ่อม book. Anything wrong here is wrong on
 * every document, so it is one constant rather than a value per template.
 */
export const COMPANY = {
  nameEn: "UNIWAVE SERVICES LIMITED",
  nameTh: "บริษัท ยูนิเวฟ เซอร์วิสเซส จำกัด",
  addressLines: [
    "888/47 หมู่ที่ 9 ถนนเทพารักษ์",
    "ต.เทพารักษ์ อ.เมือง จ.สมุทรปราการ 10270",
  ],
  phone: "(662) 181-9005-8",
  fax: "(662) 181-9004",
  /** Printed at the foot of the report, as on the paper form. */
  footnote:
    "(การชำระเงินจ่ายเป็นเช็คในนามบริษัท ยูนิเวฟ เซอร์วิสเซส จำกัด เท่านั้น / PAYMENT BY CHEQUE ONLY)",
} as const;
