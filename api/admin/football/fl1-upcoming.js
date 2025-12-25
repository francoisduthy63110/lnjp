export default async function handler(req, res) {
  try {
    const { count = 5 } = req.query;
    const N = Math.max(1, Math.min(10, Number(count) || 5));

    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing FOOTBALL_DATA_API_KEY" });
    }

    // Matches à venir (SCHEDULED) pour la compétition FL1 (Ligue 1)
    const url = "https://api.football-data.org/v4/competitions/FL1/matches?status=SCHEDULED";
    const r = await fetch(url, {
      headers: { "X-Auth-Token": apiKey },
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({
        error: "Football-Data error",
        status: r.status,
        details: text.slice(0, 500),
      });
    }

    const data = await r.json();
    const matches = Array.isArray(data.matches) ? data.matches : [];

    // On groupe par matchday
    const byMatchday = new Map();
    for (const m of matches) {
      const md = m.matchday ?? null;
      if (md == null) continue;

      if (!byMatchday.has(md)) byMatchday.set(md, []);
      byMatchday.get(md).push({
        externalMatchId: m.id,
        utcDate: m.utcDate,
        status: m.status,
        matchday: md,
        homeTeam: m.homeTeam?.name,
        awayTeam: m.awayTeam?.name,
      });
    }

    // On trie les journées et on prend les N prochaines
    const matchdays = Array.from(byMatchday.keys()).sort((a, b) => a - b);
    const selected = matchdays.slice(0, N).map((md) => ({
      matchday: md,
      matches: byMatchday.get(md).sort((a, b) => (a.utcDate < b.utcDate ? -1 : 1)),
    }));

    return res.status(200).json(selected);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
