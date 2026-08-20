import { getSessionContext, fetchAll } from "@/lib/data";
import { SitesView } from "./sites-view";

/** One row of site_asset_facets (migration 0035) — what one site holds. */
type SiteFacets = {
  site_id: string;
  total: number;
  kinds: string[] | null;
  brands: string[] | null;
  models: string[] | null;
};

/**
 * Replaces each site's list of values with indices into one shared vocabulary.
 *
 * A model name runs to forty-odd characters and the same few hundred of them
 * are spread over 2,284 sites; sending the strings themselves would put a few
 * hundred KB of repetition on the wire. The view reads them back by index.
 *
 * The vocabulary is sorted here so the filter lists come out in order without
 * the client sorting a few hundred strings on every render.
 */
function encodeFacet(lists: (string[] | null | undefined)[]) {
  const values = [...new Set(lists.flatMap((l) => l ?? []))].sort((a, b) =>
    a.localeCompare(b, "th")
  );
  const at = new Map(values.map((v, i) => [v, i]));
  return { values, coded: lists.map((l) => (l ?? []).map((v) => at.get(v)!)) };
}

export default async function SitesPage() {
  const { supabase, org } = await getSessionContext();

  const [sites, companies, contacts, facets] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("sites")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .order("id")
    ),
    fetchAll(() =>
      supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", org.id)
        .order("name")
        .order("id")
    ),
    fetchAll(() =>
      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("org_id", org.id)
        .order("first_name")
        .order("id")
    ),
    // Machine count and the kinds/brands/models present, aggregated in the DB
    // rather than by fetching all 5,877 equipment rows. Ordered because
    // PostgREST paginates by range, and a range over an unordered view can
    // repeat or skip rows between pages.
    fetchAll<SiteFacets>(() =>
      supabase
        .from("site_asset_facets")
        .select("site_id, total, kinds, brands, models")
        .eq("org_id", org.id)
        .order("site_id")
    ),
  ]);

  const bySite = new Map(facets.map((f) => [f.site_id, f]));
  const kinds = encodeFacet(sites.map((s) => bySite.get(s.id)?.kinds));
  const brands = encodeFacet(sites.map((s) => bySite.get(s.id)?.brands));
  const models = encodeFacet(sites.map((s) => bySite.get(s.id)?.models));

  return (
    <SitesView
      sites={sites.map((s, i) => ({
        ...s,
        equipmentCount: bySite.get(s.id)?.total ?? 0,
        kinds: kinds.coded[i],
        brands: brands.coded[i],
        models: models.coded[i],
      }))}
      assetVocab={{ kinds: kinds.values, brands: brands.values, models: models.values }}
      companies={companies ?? []}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))}
    />
  );
}
