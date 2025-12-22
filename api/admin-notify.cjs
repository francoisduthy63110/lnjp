const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Protection MVP (simple) : un token admin
    const adminToken = requireEnv('ADMIN_TOKEN');
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${adminToken}`) return res.status(401).json({ error: 'Unauthorized' });

    const SUPABASE_URL = requireEnv('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const VAPID_PUBLIC_KEY = requireEnv('VITE_VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = requireEnv('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = requireEnv('VAPID_SUBJECT');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { title, body, url } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

    // 1) Créer la notification (source de vérité)
    const { data: notif, error: notifErr } = await supabase
      .from('notifications')
      .insert({ title, body, url: url || null, created_by: 'super_admin' })
      .select()
      .single();

    if (notifErr) return res.status(500).json({ error: notifErr.message });

    // 2) Récupérer toutes les subscriptions (MVP = tout le monde)
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('user_id, device_id, endpoint, p256dh, auth');

    if (subsErr) return res.status(500).json({ error: subsErr.message });

    // 3) Configurer web-push
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // 4) Envoyer + remplir recipients (distinct user_ids)
    const uniqueUserIds = [...new Set((subs || []).map(s => s.user_id).filter(Boolean))];

    // Créer les recipients "queued"
    if (uniqueUserIds.length) {
      const rows = uniqueUserIds.map(user_id => ({
        notification_id: notif.id,
        user_id,
        status: 'queued',
      }));
      await supabase.from('notification_recipients').insert(rows);
    }

    const payload = JSON.stringify({
      notificationId: notif.id,
      title: notif.title,
      body: notif.body,
      url: notif.url || '/',
    });

    let sent = 0;
    let failed = 0;

    for (const s of subs || []) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      try {
        await webpush.sendNotification(subscription, payload);
        sent += 1;
      } catch (e) {
        failed += 1;

        // Si subscription expirée (410/404), on peut la supprimer
        const statusCode = e?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .match({ user_id: s.user_id, device_id: s.device_id });
        }
      }
    }

    // Mettre à jour recipients status "sent" (MVP: on marque sent global si au moins 1)
    if (uniqueUserIds.length) {
      await supabase
        .from('notification_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('notification_id', notif.id);
    }

    return res.json({ ok: true, notificationId: notif.id, sent, failed });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
