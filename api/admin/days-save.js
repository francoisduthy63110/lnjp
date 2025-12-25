import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    matchday,
    deadlineAt,
    featuredExternalMatchId,
    matches,
    adminId,
  } = req.body;

  try {
    // 1. Upsert day
    const { data: day, error: dayError } = await supabaseAdmin
      .from("days")
      .upsert(
        {
          sport: "football",
          competition_code: "FL1",
          matchday,
          title: `Ligue 1 — Journée ${matchday}`,
          deadline_at: deadlineAt,
          featured_match_external_id: featuredExternalMatchId,
          status: "DRAFT",
          created_by: adminId,
        },
        { onConflict: "competition_code,matchday" }
      )
      .select()
      .single();

    if (dayError) throw dayError;

    // 2. Clean existing matches
    await supabaseAdmin.from("day_matches").delete().eq("day_id", day.id);

    // 3. Insert matches
    const rows = matches.map((m) => ({
      day_id: day.id,
      external_match_id: m.externalMatchId,
      utc_date: m.utcDate,
      status: m.status,
      home_team_id: m.homeTeam.id,
      home_team_name: m.homeTeam.name,
      home_team_crest: m.homeTeam.crest,
      away_team_id: m.awayTeam.id,
      away_team_name: m.awayTeam.name,
      away_team_crest: m.awayTeam.crest,
      is_featured: m.externalMatchId === featuredExternalMatchId,
    }));

    const { error: matchError } = await supabaseAdmin
      .from("day_matches")
      .insert(rows);

    if (matchError) throw matchError;

    return res.status(200).json({ dayId: day.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
}
