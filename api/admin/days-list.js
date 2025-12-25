// api/admin/days-list.js
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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    assertAdmin(req);

    const store = safeReadStore();

    // Si vide: on te pré-crée des journées "placeholder" pour le workflow
    if (store.days.length === 0) {
      const now = new Date().toISOString();
      store.days = [19, 20, 21, 22, 23].map((md) => ({
        id: `day_${md}`,
        sport: "football",
        competition_code: "FL1",
        matchday: md,
        title: `Ligue 1 — Journée ${md}`,
        deadline_at: null,
        status: "DRAFT",
        published_at: null,
        created_by: "admin_system",
        created_at: now,
        featured_match_external_id: null,
        matches: [],
      }));
      // on persiste pour les prochains appels
      fs.writeFileSync(storeFile(), JSON.stringify(store, null, 2), "utf-8");
    }

    return res.status(200).json({ ok: true, days: store.days });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ ok: false, error: e?.message || "Server error" });
  }
}
