function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { leagueCode } = req.body || {};
    const code = String(leagueCode || "").trim();

    if (!code) return res.status(400).json({ error: "Missing leagueCode" });

    const expected = requireEnv("LNJP_INVITE_CODE");

    if (code !== expected) return res.status(401).json({ error: "Invalid league code" });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
