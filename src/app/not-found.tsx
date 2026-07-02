import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-bold tracking-tight text-muted-foreground">404</p>
      <div>
        <h2 className="text-lg font-semibold">ไม่พบหน้าที่ต้องการ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          หน้านี้อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        กลับหน้าแดชบอร์ด
      </Link>
    </div>
  );
}
