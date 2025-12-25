import { supabase } from "../lib/supabase";

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from("days")
    .select("id,title,matchday,status,deadline_at")
    .order("matchday");

  if (error) return res.status(500).json({ error });

  res.status(200).json(data);
}
