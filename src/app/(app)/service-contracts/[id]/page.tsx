import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { ContractDetail } from "./contract-detail";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, org } = await getSessionContext();

  const { data: contract } = await supabase
    .from("service_contracts")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contract) notFound();

  const [{ data: visits }, { data: companies }, { data: sites }, { data: technicians }] =
    await Promise.all([
      supabase
        .from("service_visits")
        .select("*")
        .eq("contract_id", id)
        .order("seq", { ascending: true }),
      supabase.from("companies").select("id, name").eq("org_id", org.id),
      supabase.from("sites").select("id, name").eq("org_id", org.id),
      supabase.from("technicians").select("id, name").eq("org_id", org.id),
    ]);

  const find = (arr: { id: string; name: string }[] | null, id: string | null) =>
    id ? arr?.find((x) => x.id === id)?.name : undefined;

  return (
    <ContractDetail
      contract={contract}
      visits={visits ?? []}
      companyName={find(companies, contract.company_id)}
      siteName={find(sites, contract.site_id)}
      technicianName={find(technicians, contract.technician_id)}
    />
  );
}
