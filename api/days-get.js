import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  const { dayId, userId } = req.query;

  const { data: day } = await supabase
    .from("days")
    .select("*")
    .eq("id", dayId)
    .single();

  const { data: matches } = await supabase
    .from("day_matches")
    .select("*")
    .eq("day_id", dayId)
    .order("utc_date");

  const { data: predictions } = await supabase
    .from("predictions")
    .select("*")
    .eq("day_id", dayId)
    .eq("user_id", userId);

  res.status(200).json({ day, matches, predictions });
}
