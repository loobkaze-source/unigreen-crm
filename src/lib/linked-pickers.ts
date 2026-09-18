/**
 * A customer and a site, picked together.
 *
 * A site belongs to a customer, so the two fields on a form are one fact asked
 * twice. Picking the customer narrows the sites to theirs; picking a site
 * fills the customer in. Either order works — the person raising a warranty
 * knows the station's name before they know which company holds it, and the
 * person raising a contract usually the other way round.
 */
export type SiteLink = { id: string; name: string; company_id: string | null };
type Linked = { company_id: string; site_id: string };

/**
 * The sites to offer: everyone's when no customer is chosen, theirs when one
 * is — plus whatever is already picked, so an edit never opens on a site the
 * box refuses to show.
 */
export function sitesOf<S extends SiteLink>(sites: S[], companyId: string, currentSiteId: string): S[] {
  if (!companyId) return sites;
  return sites.filter((s) => s.company_id === companyId || s.id === currentSiteId);
}

/** Choosing a customer keeps the site only if it is theirs. */
export function withCompany<F extends Linked>(form: F, companyId: string, sites: SiteLink[]): F {
  const keep = !!companyId && sites.find((s) => s.id === form.site_id)?.company_id === companyId;
  return { ...form, company_id: companyId, site_id: keep || !companyId ? form.site_id : "" };
}

/** Choosing a site brings its customer with it; clearing it leaves them. */
export function withSite<F extends Linked>(form: F, siteId: string, sites: SiteLink[]): F {
  const site = sites.find((s) => s.id === siteId);
  return { ...form, site_id: siteId, company_id: site?.company_id ?? form.company_id };
}
