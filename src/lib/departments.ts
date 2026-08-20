/** Business departments (also used as deal "boards"). */
export const DEPARTMENTS = [
  { value: "unigreen", label: "Unigreen" },
  { value: "product_sales", label: "Product Sales" },
  { value: "services_sales", label: "Services Sales" },
] as const;

export type DepartmentValue = (typeof DEPARTMENTS)[number]["value"];

export const departmentLabel = (v: string | null | undefined) =>
  DEPARTMENTS.find((d) => d.value === v)?.label ?? "—";

/**
 * The Service Boards — the three departments that run the field work, named by
 * the letters that begin their case codes (MRD-0826-00001).
 *
 * Deliberately not the list above: that one is the sales side, and the two have
 * never been the same set of teams. A board_assignments row belongs to one list
 * or the other according to its board_type.
 */
export const SERVICE_BOARDS = [
  { value: "MRD", label: "MRD" },
  { value: "UNG", label: "UNG" },
  { value: "ETD", label: "ETD" },
] as const;

export type ServiceBoardValue = (typeof SERVICE_BOARDS)[number]["value"];

/** The boards a given kind of assignment can point at. */
export const boardsFor = (
  boardType: "pipeline" | "service"
): readonly { value: string; label: string }[] =>
  boardType === "service" ? SERVICE_BOARDS : DEPARTMENTS;
