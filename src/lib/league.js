import { supabase } from "./supabase";

export async function getSingleLeague() {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No league found. Seed the leagues table.");
  return data;
}
