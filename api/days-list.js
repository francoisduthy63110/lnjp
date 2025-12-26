import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  const leagueCode = String(req.query?.leagueCode || "LNJP");

  const { data, error } = await supabase
    .from("days")
    .select("id,title,matchday,status,deadline_at,league_code")
    .eq("league_code", leagueCode)
    .eq("status", "PUBLISHED")
    .order("matchday", { ascending: true });

  if (error) return res.status(500).json({ error: error.message || String(error) });

  res.status(200).json({ ok: true, leagueCode, days: data || [] });
}
