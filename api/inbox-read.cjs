const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = requireEnv('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { userId, notificationId } = req.body || {};
    if (!userId || !notificationId) {
      return res.status(400).json({ error: 'userId and notificationId are required' });
    }

    const { error } = await supabase
      .from('notification_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('notification_id', notificationId);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
