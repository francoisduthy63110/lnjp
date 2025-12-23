import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function unauthorized(res) {
  res.status(401).json({ error: "Unauthorized" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return unauthorized(res);
  }

  try {
    const { content } = req.body || {};
    const msg = String(content || "").trim();

    if (!msg) return res.status(400).json({ error: "content is required" });
    if (msg.length > 2000) return res.status(400).json({ error: "content too long (max 2000)" });

    // 1) ligue unique
    const { data: league, error: le } = await supabaseAdmin
      .from("leagues")
      .select("id, name, created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (le) throw le;
    if (!league) return res.status(500).json({ error: "No league found (seed leagues first)" });

    // 2) user admin "technique" (un vrai user auth existant)
    const adminUserId = process.env.ADMIN_CHAT_USER_ID;
    if (!adminUserId) return res.status(500).json({ error: "Missing ADMIN_CHAT_USER_ID env var" });

    // 3) s'assurer que profiles existe
    const { error: upErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: adminUserId,
        display_name: process.env.ADMIN_CHAT_DISPLAY_NAME || "Admin LNJP",
        role: "admin",
      },
      { onConflict: "id" }
    );
    if (upErr) throw upErr;

    // 4) insert message
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("messages")
      .insert({
        league_id: league.id,
        user_id: adminUserId,
        content: msg,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw insErr;

    res.status(200).json({
      ok: true,
      leagueId: league.id,
      messageId: inserted?.id,
      createdAt: inserted?.created_at,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
