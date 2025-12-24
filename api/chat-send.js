import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function truncate(s, n) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

async function sendChatPushToAll({ supabase, excludeUserId, title, body, url }) {
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
    if (excludeUserId && s.user_id === excludeUserId) continue;

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

    const expected = requireEnv("LNJP_INVITE_CODE");

    const { leagueCode, userId, displayName, content } = req.body || {};
    const code = String(leagueCode || "").trim();
    if (!code || code !== expected) return res.status(401).json({ error: "Invalid league code" });

    const uid = String(userId || "").trim();
    const name = String(displayName || "").trim();
    const msg = String(content || "").trim();

    if (!uid || !name || !msg) return res.status(400).json({ error: "Missing fields" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
        user_id: uid,
        display_name: name,
        content: msg,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw insErr;

    // Push "nouveau message" (sans polluer l’inbox)
    try {
      await sendChatPushToAll({
        supabase,
        excludeUserId: uid,
        title: "LNJP",
        body: `${name}: ${truncate(msg, 90)}`,
        url: "/",
      });
    } catch (e) {
      // Ne bloque pas l’envoi du message (MVP)
      console.error("[chat-send] push error", e);
    }

    return res.json({ ok: true, id: inserted?.id, createdAt: inserted?.created_at });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
