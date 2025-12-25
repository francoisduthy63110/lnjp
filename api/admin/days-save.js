import { createClient } from "@supabase/supabase-js";

function requireAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true; // si pas configuré, pas de blocage (MVP)
  const got = req.headers["x-admin-token"];
  return got === expected;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Missing Supabase server env vars" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { matchday, deadlineAt, featuredExternalMatchId, matches } = req.body ?? {};

  // validations minimales
  if (!matchday || !Number.isInteger(Number(matchday))) {
    return res.status(400).json({ error: "matchday is required (integer)" });
  }
  if (!deadlineAt || typeof deadlineAt !== "string") {
    return res.status(400).json({ error: "deadlineAt is required (ISO string)" });
  }
  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({ error: "matches is required (non-empty array)" });
  }

  const md = Number(matchday);

  // 1) Upsert dans days (status = DRAFT)
  // Hypothèse de schéma minimal :
  // days: matchday (unique), deadline_at, featured_external_match_id, status
const competitionCode = "FL1";
const title = `Ligue 1 — Journée ${md}`; // MVP

.upsert(
  {
    sport: "football",
    competition_code: competitionCode,
    title,
    matchday: md,
    deadline_at: deadlineAt,
    featured_external_match_id: featuredExternalMatchId ?? null,
    status: "DRAFT",
  },
  { onConflict: "matchday" }
)

    .select("*")
    .single();

  if (dayErr) return res.status(500).json({ error: "days upsert failed", details: dayErr.message });

  // 2) delete + insert dans day_matches
  // Hypothèse :
  // day_matches: matchday, external_match_id
  const { error: delErr } = await supabase
    .from("day_matches")
    .delete()
    .eq("matchday", md);

  if (delErr) return res.status(500).json({ error: "day_matches delete failed", details: delErr.message });

  const rows = matches.map((id) => ({
    matchday: md,
    external_match_id: Number(id),
  }));

  const { error: insErr } = await supabase
    .from("day_matches")
    .insert(rows);

  if (insErr) return res.status(500).json({ error: "day_matches insert failed", details: insErr.message });

  return res.status(200).json({ ok: true, day, matchCount: rows.length });
}
