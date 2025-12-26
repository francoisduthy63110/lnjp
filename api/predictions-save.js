import { supabase } from "../lib/supabase.js";

function json(res, status, payload) {
  res.status(status).json(payload);
}

// Parse JSON body si req.body n'est pas déjà renseigné
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

    // 1) Charger la journée pour vérifier status + deadline + (optionnel) league_code
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

    // 2) Contrôle "pronos complets" = must match day_matches
    const { data: matches, error: mErr } = await supabase
      .from("day_matches")
      .select("external_match_id")
      .eq("day_id", dayId);

    if (mErr) return json(res, 500, { ok: false, error: mErr.message || String(mErr) });

    const expectedIds = new Set((matches || []).map((m) => Number(m.external_match_id)));
    if (expectedIds.size === 0) return json(res, 400, { ok: false, error: "Day has no matches" });

    const providedIds = new Set(predictions.map((p) => Number(p.externalMatchId)));
    if (providedIds.size !== expectedIds.size) {
      return json(res, 400, { ok: false, error: "Predictions must cover all matches" });
    }

    for (const id of expectedIds) {
      if (!providedIds.has(id)) {
        return json(res, 400, { ok: false, error: "Predictions must cover all matches" });
      }
    }

    // 3) Upsert
    const rows = predictions.map((p) => {
      const externalMatchId = Number(p.externalMatchId);
      const prediction = String(p.prediction || "").trim().toUpperCase();

      if (!Number.isFinite(externalMatchId) || externalMatchId <= 0) throw new Error("Invalid externalMatchId");
      if (!["1", "N", "2"].includes(prediction)) throw new Error("Invalid prediction value");

      return {
        day_id: dayId,
        user_id: String(userId),
        external_match_id: externalMatchId,
        prediction,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upErr } = await supabase
      .from("predictions")
      .upsert(rows, { onConflict: "day_id,user_id,external_match_id" });

    if (upErr) return json(res, 500, { ok: false, error: upErr.message || String(upErr) });

    return json(res, 200, { ok: true, saved: rows.length });
  } catch (e) {
    return json(res, 400, { ok: false, error: e?.message || String(e) });
  }
}
