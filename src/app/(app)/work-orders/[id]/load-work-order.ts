import { cache } from "react";
import { getSessionContext, row } from "@/lib/data";
import { isTechnicianOnly } from "@/lib/roles";
import type { WorkOrder } from "@/lib/database.types";

/**
 * The job at /work-orders/[id] as the current user may see it, shared by the
 * detail page and its /report and /photos sheets.
 *
 * A pure field technician may only open jobs assigned to them. Their nav is
 * limited to /my-jobs, but this is the check that actually holds — every page
 * under the job goes through it, or a guessed URL to the report or the photo
 * sheets would hand over another customer's address, prices and signature.
 *
 * `workOrder` is null when the job doesn't exist in this org or isn't theirs;
 * callers notFound() on that, so the two cases look the same from outside.
 * cache(): generateMetadata and the page share one fetch per request.
 */
export const loadVisibleWorkOrder = cache(
  async (id: string): Promise<{ workOrder: WorkOrder | null; fieldOnly: boolean }> => {
    const { supabase, org, userId, isAdmin, appRoles } = await getSessionContext();
    const fieldOnly = !isAdmin && isTechnicianOnly(appRoles);

    // The job row and (for a field technician) their technician record depend
    // only on the session — fetch together.
    const [woRow, techRow] = await Promise.all([
      supabase.from("work_orders").select("*").eq("id", id).eq("org_id", org.id).maybeSingle(),
      fieldOnly
        ? supabase
            .from("technicians")
            .select("id")
            .eq("org_id", org.id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const workOrder = row<WorkOrder>(woRow);
    if (!workOrder) return { workOrder: null, fieldOnly };

    if (fieldOnly) {
      const tech = row<{ id: string }>(techRow);
      if (!tech || workOrder.technician_id !== tech.id) return { workOrder: null, fieldOnly };
    }
    return { workOrder, fieldOnly };
  }
);
