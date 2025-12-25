import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  const { dayId } = req.query;

  const { data: matches } = await supabase
    .from("day_matches")
    .select("*")
    .eq("day_id", dayId);

  if (process.env.ENABLE_SIM === "true") {
    const ids = matches.map((m) => m.external_match_id);

    const { data: sim } = await supabase
      .from("sim_match_state")
      .select("*")
      .in("external_match_id", ids);

    const map = Object.fromEntries(
      sim.map((s) => [s.external_match_id, s])
    );

    const enriched = matches.map((m) => ({
      ...m,
      sim: map[m.external_match_id] || null,
    }));

    return res.status(200).json(enriched);
  }

  return res.status(200).json(matches);
}
