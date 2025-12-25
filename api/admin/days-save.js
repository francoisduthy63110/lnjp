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
    const matchday = body.matchday;
    const deadlineAt = body.deadlineAt;
    const featuredExternalMatchId = body.featuredExternalMatchId;
    const matches = body.matches;

    // validations minimales
    const md = Number(matchday);
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

    // ✅ created_by obligatoire (NOT NULL en base)
    // Mets ADMIN_SYSTEM_USER_ID dans Vercel env vars (ex: "admin_system")
    const createdBy = process.env.ADMIN_SYSTEM_USER_ID || "admin_system";

    // 1) Upsert days
    const { data: day, error: dayErr } = await supabase
      .from("days")
      .upsert(
        {
          sport: "football",
          competition_code: competitionCode,
          title,
          matchday: md,
          deadline_at: deadlineAt,
          featured_external_match_id: featuredExternalMatchId ?? null,
          status: "DRAFT",
          created_by: createdBy, // ✅ AJOUT
        },
        { onConflict: "competition_code,matchday" }
      )
      .select("*")
      .single();

    if (dayErr) {
      return res.status(500).json({ error: "days upsert failed", details: dayErr.message });
    }

    // 2) delete + insert day_matches
    // ⚠️ suppose que day_matches contient bien matchday + external_match_id
    const { error: delErr } = await supabase
      .from("day_matches")
      .delete()
      .eq("matchday", md);

    if (delErr) {
      return res
        .status(500)
        .json({ error: "day_matches delete failed", details: delErr.message });
    }

    const rows = matches.map((id) => ({
      matchday: md,
      external_match_id: Number(id),
    }));

    const { error: insErr } = await supabase.from("day_matches").insert(rows);

    if (insErr) {
      return res
        .status(500)
        .json({ error: "day_matches insert failed", details: insErr.message });
    }

    return res.status(200).json({ ok: true, day, matchCount: rows.length });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Unhandled server error", details: String(e?.message || e) });
  }
}
