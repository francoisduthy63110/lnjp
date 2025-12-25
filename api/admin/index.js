import fs from "fs";
import path from "path";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../src/lib/supabaseAdmin";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

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

function json(res, status, payload) {
  res.status(status).json(payload);
}

function getAction(req) {
  try {
    const u = new URL(req.url, "http://localhost");
    return u.searchParams.get("action") || "";
  } catch {
    return "";
  }
}

/* ---------------------------
   Handlers (ex-admin routes)
--------------------------- */

async function handleDaysList(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  // Lit Supabase (jours créés)
  const { data, error } = await supabaseAdmin
    .from("days")
    .select("id,sport,competition_code,matchday,title,deadline_at,status,created_by,created_at,published_at,featured_match_external_id,updated_at")
    .eq("competition_code", "FL1")
    .order("matchday", { ascending: true });

  if (error) return json(res, 500, { ok: false, error: error.message || String(error) });

  return json(res, 200, { ok: true, days: data || [] });
}

async function handleDaysSave(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  const { matchday, deadlineAt, featuredExternalMatchId, matches, adminId } = req.body || {};
  if (!matchday || !deadlineAt || !featuredExternalMatchId || !Array.isArray(matches)) {
    return json(res, 400, { ok: false, error: "Invalid payload" });
  }

  // 1) Upsert day
  const { data: day, error: dayError } = await supabaseAdmin
    .from("days")
    .upsert(
      {
        sport: "football",
        competition_code: "FL1",
        matchday,
        title: `Ligue 1 — Journée ${matchday}`,
        deadline_at: deadlineAt,
        featured_match_external_id: featuredExternalMatchId,
        status: "DRAFT",
        created_by: adminId || "admin_system",
      },
      { onConflict: "competition_code,matchday" }
    )
    .select("*")
    .single();

  if (dayError) return json(res, 500, { ok: false, error: dayError.message || String(dayError) });

  // 2) Nettoyage des matchs existants
  const { error: delError } = await supabaseAdmin
    .from("day_matches")
    .delete()
    .eq("day_id", day.id);

  if (delError) return json(res, 500, { ok: false, error: delError.message || String(delError) });

  // 3) Insert matches
  // IMPORTANT: ton front Admin envoie actuellement un tableau de IDs (Number),
  // mais Postman peut envoyer un tableau d'objets. On supporte les deux.
  const rows = matches.map((m) => {
    // cas "number"
    if (typeof m === "number") {
      return {
        day_id: day.id,
        external_match_id: m,
        is_featured: m === Number(featuredExternalMatchId),
      };
    }
    // cas "object"
    return {
      day_id: day.id,
      external_match_id: Number(m.externalMatchId),
      utc_date: m.utcDate || null,
      status: m.status || null,
      home_team_id: m.homeTeam?.id ?? null,
      home_team_name: m.homeTeam?.name ?? null,
      home_team_crest: m.homeTeam?.crest ?? null,
      away_team_id: m.awayTeam?.id ?? null,
      away_team_name: m.awayTeam?.name ?? null,
      away_team_crest: m.awayTeam?.crest ?? null,
      is_featured: Number(m.externalMatchId) === Number(featuredExternalMatchId),
    };
  });

  const { error: insError } = await supabaseAdmin.from("day_matches").insert(rows);
  if (insError) return json(res, 500, { ok: false, error: insError.message || String(insError) });

  return json(res, 200, { ok: true, dayId: day.id });
}

async function handleFootballFl1Upcoming(req, res) {
  // ton fichier existant était déjà "lecture Football-Data"
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  const count = Math.min(Math.max(Number(req.query?.count || 5), 1), 10);
  const token = process.env.FOOTBALL_DATA_TOKEN || process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) return json(res, 500, { ok: false, error: "Missing FOOTBALL_DATA_TOKEN" });

  const headers = { "X-Auth-Token": token };
  // On récupère des matchs FL1 (Ligue 1)
  const r = await fetch("https://api.football-data.org/v4/competitions/FL1/matches?status=SCHEDULED", { headers });
  if (!r.ok) return json(res, 500, { ok: false, error: `Football-Data HTTP ${r.status}` });
  const payload = await r.json();

  const matches = Array.isArray(payload?.matches) ? payload.matches : [];

  // calc currentMatchday = min matchday à venir
  const mdList = matches.map((m) => m.matchday).filter((x) => Number.isFinite(x));
  const currentMatchday = mdList.length ? Math.min(...mdList) : null;

  // group par matchday, puis prendre +1 -> +N
  const groups = new Map();
  for (const m of matches) {
    const md = Number(m.matchday);
    if (!Number.isFinite(md)) continue;
    if (!groups.has(md)) groups.set(md, []);
    groups.get(md).push({
      externalMatchId: m.id,
      utcDate: m.utcDate,
      status: m.status,
      homeTeam: { id: m.homeTeam?.id, name: m.homeTeam?.shortName || m.homeTeam?.name, crest: m.homeTeam?.crest },
      awayTeam: { id: m.awayTeam?.id, name: m.awayTeam?.shortName || m.awayTeam?.name, crest: m.awayTeam?.crest },
    });
  }

  const start = currentMatchday ? currentMatchday + 1 : null;
  const matchdays = Array.from(groups.keys()).sort((a, b) => a - b);

  const selected = [];
  for (const md of matchdays) {
    if (start != null && md < start) continue;
    selected.push({ matchday: md, matches: groups.get(md) });
    if (selected.length >= count) break;
  }

  return json(res, 200, { ok: true, currentMatchday, days: selected });
}

/* ---- admin-notify (inchangé, encapsulé) ---- */
async function handleAdminNotify(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const adminToken = req.headers["x-admin-token"];
  const expected = requireEnv("ADMIN_TOKEN");
  if (!adminToken || adminToken !== expected) return json(res, 401, { error: "Unauthorized (admin token invalid)" });

  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const VAPID_PUBLIC = requireEnv("VITE_VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = requireEnv("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = requireEnv("VAPID_SUBJECT");

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { title, body, url } = req.body || {};
  if (!title || !body) return json(res, 400, { error: "title and body are required" });

  const { data: subs, error: subsErr } = await sb.from("push_subscriptions").select("*");
  if (subsErr) return json(res, 500, { error: subsErr.message || String(subsErr) });

  // inbox notification
  const { data: notif, error: notifErr } = await sb
    .from("inbox_notifications")
    .insert({ title, body, url: url || "/", is_read: false })
    .select("*")
    .single();

  if (notifErr) return json(res, 500, { error: notifErr.message || String(notifErr) });

  let sent = 0;
  let failed = 0;

  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify({ title, body, url: url || "/" })
      );
      sent++;
    } catch {
      failed++;
    }
  }

  return json(res, 200, { ok: true, notificationId: notif.id, sent, failed, subs: (subs || []).length });
}

/* ---- admin-chat (inchangé, encapsulé) ---- */
async function handleAdminChat(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const adminToken = req.headers["x-admin-token"];
  const expected = requireEnv("ADMIN_TOKEN");
  if (!adminToken || adminToken !== expected) return json(res, 401, { error: "Unauthorized" });

  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { message } = req.body || {};
  if (!message) return json(res, 400, { error: "message is required" });

  const { data, error } = await sb
    .from("chat_messages")
    .insert({ role: "admin", content: message })
    .select("*")
    .single();

  if (error) return json(res, 500, { error: error.message || String(error) });

  return json(res, 200, { ok: true, message: data });
}

/* ---------------------------
   Router principal
--------------------------- */

export default async function handler(req, res) {
  try {
    const action = getAction(req);

    switch (action) {
      case "days-list":
        return await handleDaysList(req, res);
      case "days-save":
        return await handleDaysSave(req, res);
      case "football-fl1-upcoming":
        return await handleFootballFl1Upcoming(req, res);
      case "admin-notify":
        return await handleAdminNotify(req, res);
      case "admin-chat":
        return await handleAdminChat(req, res);
      default:
        return json(res, 404, { ok: false, error: "Unknown admin action" });
    }
  } catch (e) {
    const status = e?.statusCode || 500;
    return json(res, status, { ok: false, error: e?.message || String(e) });
  }
}
