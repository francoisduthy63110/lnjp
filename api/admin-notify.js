import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // 1) Auth MVP
    const adminToken = requireEnv("ADMIN_TOKEN");
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${adminToken}`) return res.status(401).json({ error: "Unauthorized" });

    // 2) Env vars
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const VAPID_PUBLIC_KEY = requireEnv("VITE_VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = requireEnv("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = requireEnv("VAPID_SUBJECT");

    // 3) Body
    const { title, body, url } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: "title and body are required" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4) Crée la notification (Inbox)
    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .insert({ title, body, url: url || "/" })
      .select()
      .single();

    if (notifErr) return res.status(500).json({ error: notifErr.message });

    // 5) Charge les subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("user_id, device_id, endpoint, p256dh, auth");

    if (subsErr) return res.status(500).json({ error: subsErr.message });

    // 6) Envoi Web Push
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      notificationId: notif.id,
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
        // Nettoyage des subscriptions expirées
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().match({ user_id: s.user_id, device_id: s.device_id });
        }
      }
    }

    return res.json({ ok: true, notificationId: notif.id, sent, failed, subs: (subs || []).length });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
