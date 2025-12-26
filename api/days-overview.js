import { supabase } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    const leagueCode = String(req.query.leagueCode || "").trim();
    const userId = String(req.query.userId || "").trim();
    if (!leagueCode || !userId) return res.status(400).json({ ok: false, error: "Missing leagueCode or userId" });

    const { data: days, error: daysErr } = await supabase
      .from("days")
      .select("id,title,matchday,status,deadline_at,league_code")
      .eq("league_code", leagueCode)
      .eq("status", "PUBLISHED")
      .order("matchday", { ascending: true });

    if (daysErr) return res.status(500).json({ ok: false, error: daysErr.message || String(daysErr) });

    const dayIds = (days || []).map((d) => d.id);
    if (dayIds.length === 0) return res.status(200).json({ ok: true, days: [] });

    const { data: dms, error: dmErr } = await supabase
      .from("day_matches")
      .select("day_id,external_match_id")
      .in("day_id", dayIds);

    if (dmErr) return res.status(500).json({ ok: false, error: dmErr.message || String(dmErr) });

    const { data: preds, error: pErr } = await supabase
      .from("predictions")
      .select("day_id,external_match_id")
      .in("day_id", dayIds)
      .eq("user_id", userId);

    if (pErr) return res.status(500).json({ ok: false, error: pErr.message || String(pErr) });

    const matchCountByDay = new Map();
    for (const m of dms || []) {
      matchCountByDay.set(m.day_id, (matchCountByDay.get(m.day_id) || 0) + 1);
    }

    // nb de matchs pronostiqués uniques (au cas où résiduel)
    const predSetByDay = new Map();
    for (const p of preds || []) {
      const k = p.day_id;
      const set = predSetByDay.get(k) || new Set();
      set.add(Number(p.external_match_id));
      predSetByDay.set(k, set);
    }

    const out = (days || []).map((d) => {
      const mc = matchCountByDay.get(d.id) || 0;
      const pc = (predSetByDay.get(d.id) ? predSetByDay.get(d.id).size : 0);
      return {
        ...d,
        matchCount: mc,
        predCount: pc,
        complete: mc > 0 && pc === mc,
      };
    });

    res.status(200).json({ ok: true, days: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
