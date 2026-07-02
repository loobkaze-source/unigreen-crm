import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { SiteDetail } from "./site-detail";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  const { data: site } = await supabase
    .from("sites")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!site) notFound();

  const [{ data: equipment }, { data: groups }, { data: warranties }, { data: contracts }, { data: companies }, { data: contacts }, { data: products }] =
    await Promise.all([
      supabase
        .from("equipment")
        .select("*")
        .eq("site_id", id)
        .order("created_at", { ascending: false }),
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
      supabase.from("companies").select("id, name").eq("org_id", org.id).order("name")
        .limit(500),
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name")
        .limit(500),
      supabase
        .from("products")
        .select("name, price")
        .eq("org_id", org.id)
        .not("price", "is", null)
        .limit(1000),
    ]);

  const companyList = companies ?? [];
  const contactList = (contacts ?? []).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
  }));

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
      companyName={companyList.find((c) => c.id === site.company_id)?.name}
      contactName={contactList.find((c) => c.id === site.contact_id)?.name}
    />
  );
}
