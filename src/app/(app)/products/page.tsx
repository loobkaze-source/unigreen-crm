import { rows, fetchAllRes } from "@/lib/data";
import { ProductsView } from "./products-view";
import { requireFullAccess } from "@/lib/page-access";

export default async function ProductsPage() {
  const { supabase, org } = await requireFullAccess();

  const products = rows(
    await fetchAllRes(() =>
      supabase
        .from("products")
        .select("*")
        .eq("org_id", org.id)
        .order("name", { ascending: true })
        .order("id")
    )
  );

  return <ProductsView products={products} />;
}
