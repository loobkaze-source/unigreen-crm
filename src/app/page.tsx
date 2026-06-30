import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function Home() {
  redirect(isSupabaseConfigured() ? "/dashboard" : "/setup");
}
