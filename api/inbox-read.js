import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { notificationId, userId = "demo" } = req.body || {};
    if (!notificationId) return res.status(400).json({ error: "notificationId required" });

    const { error } = await supabase
      .from("notification_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("notification_id", notificationId)
      .eq("user_id", userId);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
