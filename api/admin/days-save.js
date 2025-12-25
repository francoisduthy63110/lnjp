import { createClient } from "@supabase/supabase-js";

function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true; // MVP : pas de token => pas de blocage
  const got = req.headers["x-admin-token"];
  return got === expected;
}

export default async function handler(req, res) {
  try {
    // 1) Guards
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

    // 2) Input
    const body = req.body || {};
    const md = Number(body.matchday);
    const deadlineAt = body.deadlineAt;
    const matches = body.matches;

    const featuredExternalMatchId =
      body.featuredExternalMatchId === undefined || body.featuredExternalMatchId === null
        ? null
        : Number(body.featuredExternalMatchId);

    // 3) Validations minimales
    if (!Number.isInteger(md)) {
      return res.status(400).json({ error: "matchday is required (integer)" });
    }
    if (!deadlineAt || typeof deadlineAt !== "string") {
      return res.status(400).json({ error: "deadlineAt is required (ISO string)" });
    }
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: "matches is required (non-empty array)" });
    }

    const ids = matches.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    if (ids.length === 0) {
      return res.status(400).json({ error: "matches must contain numeric ids" });
    }

    // 4) Contexte MVP
    const competitionCode = "FL1";
    const title = `Ligue 1 — Journée ${md}`;
    const createdBy = process.env.ADMIN_SYSTEM_USER_ID || "admin_system";

    // 5) Upsert day
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

          // colonne réelle dans ton schéma days
          featured_match_external_id: featuredExternalMatchId,
        },
        { onConflict: "competition_code,matchday" }
      )
      .select("*")
      .single();

    if (dayErr) {
      return res.status(500).json({ error: "days upsert failed", details: dayErr.message });
    }

    const dayId = day.id;

    // 6) Replace links
    const { error: delErr } = await supabase
      .from("day_match_links")
      .delete()
      .eq("day_id", dayId);

    if (delErr) {
      return res.status(500).json({ error: "day_match_links delete failed", details: delErr.message });
    }

    const rows = ids.map((extId) => ({
      day_id: dayId,
      external_match_id: extId,
      is_featured: featuredExternalMatchId != null && extId === featuredExternalMatchId,
    }));

    const { error: insErr } = await supabase
      .from("day_match_links")
      .insert(rows);

    if (insErr) {
      return res.status(500).json({ error: "day_match_links insert failed", details: insErr.message });
    }

    // 7) Vérification anti-faux-positif (on confirme le nombre de rows en base)
    const { count, error: countErr } = await supabase
      .from("day_match_links")
      .select("*", { count: "exact", head: true })
      .eq("day_id", dayId);

    if (countErr) {
      return res.status(500).json({ error: "day_match_links verify failed", details: countErr.message });
    }
    if ((count || 0) !== rows.length) {
      return res.status(500).json({
        error: "day_match_links incomplete",
        expected: rows.length,
        got: count || 0,
      });
    }

    // 8) OK
    return res.status(200).json({
      ok: true,
      day,
      dayId,
      linkedMatchCount: rows.length,
      featuredExternalMatchId: featuredExternalMatchId,
    });
  } catch (e) {
    return res.status(500).json({ error: "Unhandled server error", details: String(e?.message || e) });
  }
}
