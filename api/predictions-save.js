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

    // optionnel : cohérence ligue
    if (leagueCode && day.league_code && leagueCode !== day.league_code) {
      return json(res, 400, { ok: false, error: "League mismatch" });
    }

    // 2) Check statut (il faut que la journée soit publiée)
    if (String(day.status || "").toUpperCase() !== "PUBLISHED") {
      return json(res, 403, { ok: false, error: "Predictions closed" });
    }

    // 3) Check deadline
    const deadline = day.deadline_at ? new Date(day.deadline_at).getTime() : null;
    if (deadline && Date.now() > deadline) {
      return json(res, 403, { ok: false, error: "Predictions closed" });
    }

    // 4) Upsert predictions (MVP 1 / N / 2)
    // Table public.predictions attend:
    // day_id, league_code, user_id, external_match_id, prediction
    const rows = predictions.map((p) => ({
      day_id: dayId,
      user_id: userId,
      external_match_id: Number(p.externalMatchId),
      pick: String(p.prediction),
    }));

    // Validations basiques
    if (rows.some((r) => !Number.isFinite(r.external_match_id))) {
      return json(res, 400, { ok: false, error: "Invalid externalMatchId" });
    }

if (rows.some((r) => !["1", "N", "2"].includes(r.pick))) {
  return json(res, 400, { ok: false, error: "Invalid prediction (expected 1, N or 2)" });
}

    const { error: upErr } = await supabase
      .from("predictions")
      .upsert(rows, { onConflict: "day_id,user_id,external_match_id" });

    if (upErr) return json(res, 500, { ok: false, error: upErr.message || String(upErr) });

    return json(res, 200, { ok: true, saved: rows.length });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
