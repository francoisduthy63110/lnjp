const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = async (req, res) => {
  try {
    const SUPABASE_URL = requireEnv('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const { data, error } = await supabase
      .from('notification_recipients')
      .select(`
        notification_id,
        status,
        sent_at,
        read_at,
        notifications:notifications (
          id,
          title,
          body,
          url,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('sent_at', { ascending: false, nullsFirst: false });

    if (error) return res.status(500).json({ error: error.message });

    const items = (data || []).map(r => ({
      id: r.notifications.id,
      title: r.notifications.title,
      body: r.notifications.body,
      url: r.notifications.url,
      createdAt: r.notifications.created_at,
      readAt: r.read_at,
      status: r.status,
    }));

    return res.json({ ok: true, items });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
