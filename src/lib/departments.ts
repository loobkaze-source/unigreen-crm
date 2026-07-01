/** Business departments (also used as deal "boards"). */
export const DEPARTMENTS = [
  { value: "unigreen", label: "Unigreen" },
  { value: "product_sales", label: "Product Sales" },
  { value: "services_sales", label: "Services Sales" },
] as const;

export type DepartmentValue = (typeof DEPARTMENTS)[number]["value"];

export const departmentLabel = (v: string | null | undefined) =>
  DEPARTMENTS.find((d) => d.value === v)?.label ?? "—";
