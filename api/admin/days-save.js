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
    const featuredExternalMatchId = body.featuredExternalMatchId ?? null;
    const matches = body.matches;

    if (!Number.isInteger(md)) {
      return res.status(400).json({ error: "matchday is required (integer)" });
    }
    if (!deadlineAt || typeof deadlineAt !== "string") {
      return res.status(400).json({ error: "deadlineAt is required (ISO string)" });
    }
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: "matches is required (non-empty array)" });
    }

    const competitionCode = "FL1";
    const title = `Ligue 1 — Journée ${md}`;
    const createdBy = process.env.ADMIN_SYSTEM_USER_ID || "admin_system";

    // 1) Upsert dans days (clé logique: competition_code + matchday)
    const { data: day, error: dayErr } = await supabase
      .from("days")
      .upsert(
        {
          sport: "football",
          competition_code: competitionCode,
          matchday: md,
          title,
          deadline_at: deadlineAt,
          // IMPORTANT: dans ta table, la bonne colonne est featured_match_external_id
          featured_match_external_id: featuredExternalMatchId,
          status: "DRAFT",
          created_by: createdBy,
        },
        { onConflict: "competition_code,matchday" }
      )
      .select("*")
      .single();

    if (dayErr) {
      return res.status(500).json({ error: "days upsert failed", details: dayErr.message });
    }

    const dayId = day.id;

    // 2) delete + insert dans day_match_links (table de lien)
    const { error: delErr } = await supabase
      .from("day_match_links")
      .delete()
      .eq("day_id", dayId);

    if (delErr) {
      return res.status(500).json({ error: "day_match_links delete failed", details: delErr.message });
    }

    const feat = featuredExternalMatchId != null ? Number(featuredExternalMatchId) : null;

    const rows = matches.map((id) => {
      const extId = Number(id);
      return {
        day_id: dayId,
        external_match_id: extId,
        is_featured: feat != null && extId === feat,
      };
    });

    const { error: insErr } = await supabase
      .from("day_match_links")
      .insert(rows);

    if (insErr) {
      return res.status(500).json({ error: "day_match_links insert failed", details: insErr.message });
    }

    return res.status(200).json({
      ok: true,
      day,
      dayId,
      linkedMatchCount: rows.length,
      featuredExternalMatchId: feat,
    });
  } catch (e) {
    return res.status(500).json({ error: "Unhandled server error", details: String(e?.message || e) });
  }
}
