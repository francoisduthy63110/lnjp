import { supabase } from "../lib/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dayId, userId, items } = req.body;

  const { data: day } = await supabase
    .from("days")
    .select("deadline_at,status")
    .eq("id", dayId)
    .single();

  if (!day || day.status !== "PUBLISHED" || new Date() > new Date(day.deadline_at)) {
    return res.status(403).json({ error: "Predictions closed" });
  }

  const rows = items.map((i) => ({
    day_id: dayId,
    user_id: userId,
    external_match_id: i.externalMatchId,
    pick: i.pick,
  }));

  const { error } = await supabase.from("predictions").upsert(rows);

  if (error) return res.status(500).json({ error });

  res.status(200).json({ success: true });
}
