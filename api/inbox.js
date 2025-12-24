import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function toInt(v, def) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // MVP: userId passé en querystring (ex: ?userId=demo)
    const userId = req.query?.userId || "demo";

    // Pagination
    const limit = Math.min(toInt(req.query?.limit, 50), 200);
    const offset = toInt(req.query?.offset, 0);

    // MVP: purge auto des notifications trop anciennes (global)
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await supabase.from("notifications").delete().lt("created_at", cutoff);
    } catch {
      // ignore purge errors
    }

    // Total (pour "Charger l’historique")
    const { count, error: countErr } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true });

    if (countErr) return res.status(500).json({ error: countErr.message });

    // Data
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,url,created_at,read_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    const items = (data || []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      url: n.url,
      createdAt: n.created_at,
      readAt: n.read_at,
    }));

    return res.json({ ok: true, userId, items, total: count ?? items.length });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
