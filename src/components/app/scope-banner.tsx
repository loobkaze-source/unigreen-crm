import Link from "next/link";
import { MapPin, X } from "lucide-react";

/**
 * "You are looking at one site's records" — said once, at the top, with the
 * way out.
 *
 * A list opened from a site's page shows only that site, because that is the
 * question that was being asked there. But a filter nobody can see is a list
 * that looks broken — three warranties where there should be sixty — so the
 * narrowing is announced, and one click widens it back.
 */
export function ScopeBanner({ siteName, allHref }: { siteName: string; allHref: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-accent px-4 py-2.5 text-sm">
      <span className="inline-flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        แสดงเฉพาะไซต์ <span className="font-medium">{siteName}</span>
      </span>
      <Link
        href={allHref}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <X className="h-3.5 w-3.5" /> ดูทั้งหมด
      </Link>
    </div>
  );
}
