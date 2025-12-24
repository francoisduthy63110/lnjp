import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function unauthorized(res) {
  res.status(401).json({ error: "Unauthorized" });
}

function truncate(s, n) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

async function sendChatPushToAll({ supabase, title, body, url }) {
  const VAPID_PUBLIC_KEY = requireEnv("VITE_VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = requireEnv("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = requireEnv("VAPID_SUBJECT");

  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("user_id, device_id, endpoint, p256dh, auth");

  if (subsErr) throw subsErr;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const payload = JSON.stringify({
    type: "CHAT_NEW",
    title,
    body,
    url: url || "/",
  });

  let sent = 0;
  let failed = 0;

  for (const s of subs || []) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, payload);
      sent += 1;
    } catch (e) {
      failed += 1;
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().match({ user_id: s.user_id, device_id: s.device_id });
      }
    }
  }

  return { sent, failed, subs: (subs || []).length };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const auth = req.headers.authorization || "";
    const adminToken = requireEnv("ADMIN_TOKEN");
    if (auth !== `Bearer ${adminToken}`) return unauthorized(res);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { content, url } = req.body || {};
    const msg = String(content || "").trim();
    if (!msg) return res.status(400).json({ error: "Missing content" });

    const adminDisplayName = process.env.ADMIN_CHAT_DISPLAY_NAME || "Admin LNJP";

    // ligue unique MVP
    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (leagueErr) throw leagueErr;
    if (!league?.id) return res.status(500).json({ error: "No league found" });

    const { data: inserted, error: insErr } = await supabase
      .from("chat_messages")
      .insert({
        league_id: league.id,
        user_id: "admin",
        display_name: adminDisplayName,
        content: msg,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw insErr;

    // Push "nouveau message"
    try {
      await sendChatPushToAll({
        supabase,
        title: "LNJP",
        body: `${adminDisplayName}: ${truncate(msg, 90)}`,
        url: url || "/",
      });
    } catch (e) {
      console.error("[admin-chat] push error", e);
    }

    return res.status(200).json({
      ok: true,
      leagueId: league.id,
      messageId: inserted?.id,
      createdAt: inserted?.created_at,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
