import { supabase } from "../../lib/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.ENABLE_SIM !== "true") {
    return res.status(403).json({ error: "Simulation disabled" });
  }

  const { externalMatchId, status, homeGoals, awayGoals, adminId } = req.body;

  try {
    const { error } = await supabase
      .from("sim_match_state")
      .upsert({
        external_match_id: externalMatchId,
        status,
        home_goals: homeGoals,
        away_goals: awayGoals,
        updated_by: adminId,
      });

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update sim state" });
  }
}
