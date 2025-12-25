// api/admin/days-save.js
import fs from "fs";
import path from "path";

function readAdminToken(req) {
  const x = req.headers["x-admin-token"];
  if (x) return String(x);
  const auth = req.headers["authorization"] || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function assertAdmin(req) {
  const token = readAdminToken(req);
  const expected = process.env.ADMIN_TOKEN || "lnjp_super_admin_2025_secret_token";
  if (!token || token !== expected) {
    const err = new Error("Unauthorized (admin token invalid)");
    err.statusCode = 401;
    throw err;
  }
}

function storeFile() {
  return path.join("/tmp", "lnjp_days_store.json");
}

function safeReadStore() {
  const f = storeFile();
  try {
    if (!fs.existsSync(f)) {
      return { days: [] };
    }
    const raw = fs.readFileSync(f, "utf-8");
    const json = JSON.parse(raw);
    if (!json || !Array.isArray(json.days)) return { days: [] };
    return json;
  } catch {
    return { days: [] };
  }
}

function safeWriteStore(data) {
  const f = storeFile();
  fs.writeFileSync(f, JSON.stringify(data, null, 2), "utf-8");
}

function upsertDay(store, incoming) {
  const md = Number(incoming.matchday);
  const idx = store.days.findIndex((d) => Number(d.matchday) === md);

  const now = new Date().toISOString();
  const base = {
    id: idx >= 0 ? store.days[idx].id : `day_${md}`,
    sport: "football",
    competition_code: "FL1",
    matchday: md,
    title: `Ligue 1 — Journée ${md}`,
    status: idx >= 0 ? store.days[idx].status : "DRAFT",
    created_by: "admin_system",
    created_at: idx >= 0 ? store.days[idx].created_at : now,
    published_at: idx >= 0 ? store.days[idx].published_at : null,
  };

  const next = {
    ...base,
    deadline_at: incoming.deadlineAt || null,
    featured_match_external_id: incoming.featuredExternalMatchId ?? null,
    matches: Array.isArray(incoming.matches) ? incoming.matches.map(Number) : [],
    updated_at: now,
  };

  if (idx >= 0) store.days[idx] = next;
  else store.days.push(next);

  // tri par matchday
  store.days.sort((a, b) => Number(a.matchday) - Number(b.matchday));

  return next;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    assertAdmin(req);

    const body = req.body || {};
    const matchday = Number(body.matchday);
    if (!Number.isFinite(matchday) || matchday <= 0) {
      return res.status(400).json({ ok: false, error: "matchday invalid" });
    }

    const deadlineAt = body.deadlineAt || null;
    const featuredExternalMatchId =
      body.featuredExternalMatchId == null ? null : Number(body.featuredExternalMatchId);

    const matches = Array.isArray(body.matches) ? body.matches.map(Number) : [];

    const store = safeReadStore();
    const saved = upsertDay(store, { matchday, deadlineAt, featuredExternalMatchId, matches });
    safeWriteStore(store);

    return res.status(200).json({ ok: true, day: saved });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ ok: false, error: e?.message || "Server error" });
  }
}
