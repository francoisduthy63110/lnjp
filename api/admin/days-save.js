import { createClient } from "@supabase/supabase-js";

function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true; // MVP : pas de token => pas de blocage
  const got = req.headers["x-admin-token"];
  return got === expected;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Missing Supabase server env vars" });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = req.body || {};
    const md = Number(body.matchday);
    const deadlineAt = body.deadlineAt;
    const featuredExternalMatchId =
      body.featuredExternalMatchId === undefined || body.featuredExternalMatchId === null
        ? null
        : Number(body.featuredExternalMatchId);
    const matchIds = body.matches;

    if (!Number.isInteger(md)) {
      return res.status(400).json({ error: "matchday is required (integer)" });
    }
    if (!deadlineAt || typeof deadlineAt !== "string") {
      return res.status(400).json({ error: "deadlineAt is required (ISO string)" });
    }
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      return res.status(400).json({ error: "matches is required (non-empty array)" });
    }

    const competitionCode = "FL1";
    const title = `Ligue 1 — Journée ${md}`;
    const createdBy = process.env.ADMIN_SYSTEM_USER_ID || "admin_system";

    // 1) Upsert days (clé métier: competition_code + matchday)
    // NB: on utilise featured_match_external_id (et on ignore l'autre colonne doublon)
    const { data: day, error: dayErr } = await supabase
      .from("days")
      .upsert(
        {
          sport: "football",
          competition_code: competitionCode,
          matchday: md,
          title,
          deadline_at: deadlineAt,
          status: "DRAFT",
          created_by: createdBy,
          featured_match_external_id: featuredExternalMatchId, // ✅ colonne réelle
        },
        { onConflict: "competition_code,matchday" }
      )
      .select("id, sport, competition_code, matchday, title, deadline_at, status, featured_match_external_id")
      .single();

    if (dayErr) {
      return res.status(500).json({ error: "days upsert failed", details: dayErr.message });
    }

    const dayId = day.id;

    // 2) Délier les anciens matchs de cette journée (si re-save)
    // On remet day_id = null et is_featured = false
    const { error: clearErr } = await supabase
      .from("day_matches")
      .update({ day_id: null, is_featured: false })
      .eq("day_id", dayId);

    if (clearErr) {
      return res.status(500).json({ error: "day_matches clear failed", details: clearErr.message });
    }

    // 3) Lier les matchs (UPDATE, pas INSERT)
    const ids = matchIds.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    if (ids.length === 0) {
      return res.status(400).json({ error: "matches must contain numeric ids" });
    }

    const { error: linkErr } = await supabase
      .from("day_matches")
      .update({ day_id: dayId })
      .in("external_match_id", ids);

    if (linkErr) {
      return res.status(500).json({ error: "day_matches link failed", details: linkErr.message });
    }

    // 4) Gérer le match phare (optionnel)
    if (featuredExternalMatchId) {
      // reset puis set à true pour celui-là (sécurise si le featured change)
      const { error: resetFeatErr } = await supabase
        .from("day_matches")
        .update({ is_featured: false })
        .eq("day_id", dayId);

      if (resetFeatErr) {
        return res.status(500).json({ error: "day_matches featured reset failed", details: resetFeatErr.message });
      }

      const { error: setFeatErr } = await supabase
        .from("day_matches")
        .update({ is_featured: true })
        .eq("day_id", dayId)
        .eq("external_match_id", featuredExternalMatchId);

      if (setFeatErr) {
        return res.status(500).json({ error: "day_matches featured set failed", details: setFeatErr.message });
      }
    }

    return res.status(200).json({
      ok: true,
      day,
      dayId,
      linkedMatchCount: ids.length,
      featuredExternalMatchId,
    });
  } catch (e) {
    return res.status(500).json({ error: "Unhandled server error", details: String(e?.message || e) });
  }
}
