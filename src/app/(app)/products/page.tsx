import { getSessionContext } from "@/lib/data";
import { ProductsView } from "./products-view";

export default async function ProductsPage() {
  const { supabase, org } = await getSessionContext();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", org.id)
    .order("name", { ascending: true });

  return <ProductsView products={products ?? []} />;
}
