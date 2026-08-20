import { getSessionContext, rows, fetchAllRes } from "@/lib/data";
import { ProductsView } from "./products-view";

export default async function ProductsPage() {
  const { supabase, org } = await getSessionContext();

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
