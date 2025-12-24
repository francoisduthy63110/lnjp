import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const expected = requireEnv("LNJP_INVITE_CODE");

    const { leagueCode, userId, displayName, content } = req.body || {};
    const code = String(leagueCode || "").trim();
    const uid = String(userId || "").trim();
    const name = String(displayName || "").trim();
    const msg = String(content || "").trim();

    if (!code || code !== expected) return res.status(401).json({ error: "Invalid league code" });
    if (!uid) return res.status(400).json({ error: "Missing userId" });
    if (name.length < 2) return res.status(400).json({ error: "Invalid displayName" });
    if (!msg) return res.status(400).json({ error: "Missing content" });
    if (msg.length > 2000) return res.status(400).json({ error: "content too long (max 2000)" });

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    // ligue unique = première ligue
    const { data: league, error: le } = await supabase
      .from("leagues")
      .select("id, created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (le) throw le;
    if (!league) return res.status(500).json({ error: "No league found (seed leagues first)" });

    const { data: inserted, error: insErr } = await supabase
      .from("chat_messages")
      .insert({
        league_id: league.id,
        user_id: uid,
        display_name: name,
        content: msg,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw insErr;

    return res.json({ ok: true, id: inserted?.id, createdAt: inserted?.created_at });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
