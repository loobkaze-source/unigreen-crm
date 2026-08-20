import { notFound } from "next/navigation";
import { getSessionContext, row, rows, fetchAllRes } from "@/lib/data";
import type { Site } from "@/lib/database.types";
import { SiteDetail } from "./site-detail";

type SiteRow = Site & {
  companies: { name: string } | null;
  contacts: { first_name: string; last_name: string | null } | null;
};

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  // The customer and contact names ride along embedded — this page used to
  // fetch every company and 500 contacts to resolve two strings.
  const site = row<SiteRow>(
    await supabase
      .from("sites")
      .select("*, companies(name), contacts(first_name, last_name)")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle()
  );
  if (!site) notFound();

  const [equipmentRes, groupsRes, warrantiesRes, contractsRes, productsRes] =
    await Promise.all([
      // A large solar site can hold more than PostgREST's silent 1,000-row cap.
      fetchAllRes(() =>
        supabase
          .from("equipment")
          .select("*")
          .eq("org_id", org.id)
          .eq("site_id", id)
          .order("created_at", { ascending: false })
          .order("id")
      ),
      supabase
        .from("asset_groups")
        .select("id, name, site_id")
        .eq("site_id", id)
        .order("name")
        .limit(500),
      supabase
        .from("warranties")
        .select("id, title, kind, status, end_date")
        .eq("site_id", id)
        .order("end_date", { ascending: true }),
      supabase
        .from("service_contracts")
        .select("id, title, status, end_date")
        .eq("site_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("name, price")
        .eq("org_id", org.id)
        .not("price", "is", null)
        .order("name")
        .limit(1000),
    ]);

  const equipment = rows(equipmentRes);
  const groups = rows(groupsRes);
  const warranties = rows(warrantiesRes);
  const contracts = rows(contractsRes);
  const products = rows(productsRes);

  // Match each asset to a product by "brand model" (or model) → sale price,
  // so the asset table can show the price on hover.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const priceByName = new Map<string, number>();
  for (const p of products ?? []) {
    if (p.price != null) priceByName.set(norm(p.name), Number(p.price));
  }
  const priceByAsset: Record<string, number> = {};
  for (const eq of equipment ?? []) {
    const keys = [
      [eq.brand, eq.model].filter(Boolean).join(" "),
      eq.model ?? "",
      eq.name ?? "",
    ];
    for (const k of keys) {
      if (!k) continue;
      const price = priceByName.get(norm(k));
      if (price != null) {
        priceByAsset[eq.id] = price;
        break;
      }
    }
  }

  return (
    <SiteDetail
      site={site}
      equipment={equipment ?? []}
      groups={groups ?? []}
      warranties={warranties ?? []}
      contracts={contracts ?? []}
      priceByAsset={priceByAsset}
      companyName={site.companies?.name}
      contactName={
        site.contacts
          ? [site.contacts.first_name, site.contacts.last_name]
              .filter(Boolean)
              .join(" ")
          : undefined
      }
    />
  );
}
