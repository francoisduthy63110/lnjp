import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const expected = requireEnv("LNJP_INVITE_CODE");
    const code = String(req.query?.leagueCode || "").trim();
    if (!code || code !== expected) return res.status(401).json({ error: "Invalid league code" });

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

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, content, created_at, user_id, display_name")
      .eq("league_id", league.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    const items = (data || [])
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        userId: m.user_id,
        displayName: m.display_name,
      }));

    return res.json({ ok: true, items });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
