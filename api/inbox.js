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

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // MVP: userId passé en querystring (ex: ?userId=demo)
    const userId = req.query?.userId || "demo";

    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,url,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    const items = (data || []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      url: n.url,
      createdAt: n.created_at,
      readAt: n.read_at,
    }));
res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json({ ok: true, userId, items });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
