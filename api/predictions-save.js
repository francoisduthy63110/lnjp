import { supabase } from "../lib/supabase.js";

function json(res, status, payload) {
  res.status(status).json(payload);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function normalizePrediction(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!["1", "N", "2"].includes(s)) throw new Error("Invalid prediction (expected 1, N or 2)");
  return s;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const body = await readJsonBody(req);
    const dayId = body.dayId;
    const leagueCode = body.leagueCode || null;
    const userId = body.userId;
    const predictions = body.predictions;

    if (!dayId || !userId || !Array.isArray(predictions) || predictions.length === 0) {
      return json(res, 400, { ok: false, error: "Invalid payload" });
    }

    // 1) load day + checks
    const { data: day, error: dayErr } = await supabase
      .from("days")
      .select("id,league_code,status,deadline_at")
      .eq("id", dayId)
      .single();

    if (dayErr) return json(res, 500, { ok: false, error: dayErr.message || String(dayErr) });
    if (!day) return json(res, 404, { ok: false, error: "Day not found" });

    if (leagueCode && day.league_code && leagueCode !== day.league_code) {
      return json(res, 400, { ok: false, error: "League mismatch" });
    }

    if (String(day.status || "").toUpperCase() !== "PUBLISHED") {
      return json(res, 403, { ok: false, error: "Predictions closed" });
    }

    const deadline = day.deadline_at ? new Date(day.deadline_at).getTime() : null;
    if (deadline && Date.now() > deadline) {
      return json(res, 403, { ok: false, error: "Predictions closed" });
    }

    // 2) expected matches
    const { data: dm, error: dmErr } = await supabase
      .from("day_matches")
      .select("external_match_id")
      .eq("day_id", dayId);

    if (dmErr) return json(res, 500, { ok: false, error: dmErr.message || String(dmErr) });

    const expectedIds = (dm || []).map((x) => Number(x.external_match_id)).filter((n) => Number.isFinite(n));
    if (expectedIds.length === 0) return json(res, 400, { ok: false, error: "No matches configured for this day" });

    const expectedSet = new Set(expectedIds);

    // 3) normalize payload + validate exact coverage
    const seen = new Set();
    const rows = [];

    for (const p of predictions) {
      const mid = Number(p.externalMatchId ?? p.external_match_id);
      if (!Number.isFinite(mid)) return json(res, 400, { ok: false, error: "Invalid externalMatchId" });

      if (!expectedSet.has(mid)) return json(res, 400, { ok: false, error: "Predictions must match configured matches" });
      if (seen.has(mid)) return json(res, 400, { ok: false, error: "Duplicate match in payload" });

      const pred = normalizePrediction(p.prediction);
      seen.add(mid);

      rows.push({
        day_id: dayId,
        user_id: userId,
        external_match_id: mid,
        prediction: pred,
        created_at: new Date().toISOString(),
      });
    }

    if (seen.size !== expectedSet.size) {
      return json(res, 400, { ok: false, error: "Predictions must cover all matches" });
    }

    // 4) upsert (requires UNIQUE(day_id,user_id,external_match_id) for perfect behavior)
    const { error: upErr } = await supabase
      .from("predictions")
      .upsert(rows, { onConflict: "day_id,user_id,external_match_id" });

    if (upErr) return json(res, 500, { ok: false, error: upErr.message || String(upErr) });

    return json(res, 200, { ok: true, saved: rows.length });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
