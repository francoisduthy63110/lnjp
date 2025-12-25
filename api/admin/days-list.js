// api/admin/days-list.js
import { sql } from "@vercel/postgres";

function readAdminToken(req) {
  const x = req.headers["x-admin-token"];
  if (x) return String(x);

  const auth = req.headers["authorization"] || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function assertAdmin(req) {
  const token = readAdminToken(req);

  const envToken = process.env.ADMIN_TOKEN;
  const fallbackMvp = "lnjp_super_admin_2025_secret_token";

  const expected = envToken || fallbackMvp;

  if (!token || token !== expected) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    assertAdmin(req);

    // Table attendue: days (adapté à ton modèle days-save)
    const { rows } = await sql`
      SELECT
        id,
        sport,
        competition_code,
        matchday,
        title,
        deadline_at,
        status,
        published_at,
        created_by,
        created_at,
        featured_match_external_id
      FROM days
      ORDER BY matchday ASC
      LIMIT 12
    `;

    return res.status(200).json({ ok: true, days: rows });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ ok: false, error: e?.message || "Server error" });
  }
}
