export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const count = Number(req.query.count || 5);

  try {
    const headers = {
      "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN,
    };

    // 1. Get competition info (currentMatchday)
    const compRes = await fetch(
      "https://api.football-data.org/v4/competitions/FL1",
      { headers }
    );
    const compData = await compRes.json();

    const currentMatchday = compData.currentSeason.currentMatchday;

    // 2. Fetch next N matchdays
    const days = [];
    for (let i = 1; i <= count; i++) {
      const matchday = currentMatchday + i;

      const matchesRes = await fetch(
        `https://api.football-data.org/v4/competitions/FL1/matches?matchday=${matchday}`,
        { headers }
      );
      const matchesData = await matchesRes.json();

      days.push({
        matchday,
        matches: matchesData.matches,
      });
    }

    return res.status(200).json(days);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load upcoming matchdays" });
  }
}
