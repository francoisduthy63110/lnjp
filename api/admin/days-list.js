// api/admin/days-list.js

function readAdminToken(req) {
  const x = req.headers["x-admin-token"];
  if (x) return String(x);

  const auth = req.headers["authorization"] || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function assertAdmin(req) {
  const token = readAdminToken(req);

  // IMPORTANT: garde la compat MVP
  const expected = process.env.ADMIN_TOKEN || "lnjp_super_admin_2025_secret_token";

  if (!token || token !== expected) {
    const err = new Error("Unauthorized (admin token invalid)");
    err.statusCode = 401;
    throw err;
  }
}

async function queryWithVercelPostgres() {
  // essaie @vercel/postgres si présent
  const mod = await import("@vercel/postgres");
  const { sql } = mod;

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
  return rows;
}

async function queryWithPg() {
  // fallback pg si présent + DATABASE_URL
  const mod = await import("pg");
  const { Client } = mod;

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!connectionString) {
    const err = new Error(
      "DB connection string missing (set DATABASE_URL or POSTGRES_URL)."
    );
    err.statusCode = 500;
    throw err;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const r = await client.query(`
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
    `);
    return r.rows;
  } finally {
    await client.end();
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    assertAdmin(req);

    let days = null;
    let used = null;

    // 1) Try @vercel/postgres
    try {
      days = await queryWithVercelPostgres();
      used = "@vercel/postgres";
    } catch (e1) {
      // 2) Fallback pg
      try {
        days = await queryWithPg();
        used = "pg";
      } catch (e2) {
        // Renvoie l’erreur détaillée (utile pour corriger vite)
        console.error("days-list DB error (vercel-postgres then pg):", e1, e2);
        const msg =
          `DB error. ` +
          `@vercel/postgres: ${e1?.message || String(e1)} | ` +
          `pg: ${e2?.message || String(e2)}`;
        return res.status(500).json({ ok: false, error: msg });
      }
    }

    return res.status(200).json({ ok: true, days, meta: { driver: used } });
  } catch (e) {
    console.error("days-list error:", e);
    const status = e?.statusCode || 500;
    return res.status(status).json({
      ok: false,
      error: e?.message || "Server error",
    });
  }
}
