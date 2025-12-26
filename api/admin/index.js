import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";

/* ---------------------------
   Utils
--------------------------- */

function json(res, status, payload) {
  res.status(status).json(payload);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAction(req) {
  return String(req.query?.action || "").trim();
}

function getQueryParam(req, key) {
  return req.query?.[key] != null ? String(req.query[key]) : null;
}

function assertAdmin(req) {
  const x = req.headers["x-admin-token"];
  const expected = requireEnv("ADMIN_TOKEN");
  if (!x || String(x) !== expected) {
    const err = new Error("Unauthorized (admin token invalid)");
    err.statusCode = 401;
    throw err;
  }
}

function sbService() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function insertInboxNotification({ title, body, url, createdBy }) {
  // Table réelle = notifications
  const sb = sbService();
  const { data, error } = await sb
    .from("notifications")
    .insert({
      title,
      body,
      url: url || null,
      created_by: createdBy || "admin_system",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message || String(error));
  return data; // contient id (bigint)
}

async function sendPushToAll({ title, body, url }) {
  const VAPID_PUBLIC = requireEnv("VITE_VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = requireEnv("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = requireEnv("VAPID_SUBJECT");

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const sb = sbService();
  const { data: subs, error: subErr } = await sb.from("push_subscriptions").select("*");
  if (subErr) throw new Error(subErr.message || String(subErr));

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

  return { sent, failed, subs: (subs || []).length };
}

/* ---------------------------
   Handlers
--------------------------- */

async function handleDaysList(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  const leagueCode = getQueryParam(req, "leagueCode") || "LNJP";

  const { data, error } = await supabaseAdmin
    .from("days")
    .select("id,league_code,sport,competition_code,matchday,title,deadline_at,status,created_by,created_at,published_at,featured_match_external_id,updated_at")
    .eq("league_code", leagueCode)
    .eq("competition_code", "FL1")
    .order("matchday", { ascending: true });

  if (error) return json(res, 500, { ok: false, error: error.message || String(error) });
  return json(res, 200, { ok: true, leagueCode, days: data || [] });
}

/**
 * days-publish:
 * - Crée la journée en BDD uniquement à la validation admin
 * - Statut = PUBLISHED + published_at = now()
 * - Insère les day_matches complets
 * - Push + inbox notification
 */
async function handleDaysPublish(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  const { leagueCode, matchday, deadlineAt, featuredExternalMatchId, matches, adminId } = req.body || {};
  if (!leagueCode || !matchday || !deadlineAt || !featuredExternalMatchId || !Array.isArray(matches) || matches.length === 0) {
    return json(res, 400, { ok: false, error: "Invalid payload" });
  }

  // 1) Upsert day (PUBLISHED)
  const nowIso = new Date().toISOString();

  const { data: day, error: dayError } = await supabaseAdmin
    .from("days")
    .upsert(
      {
        league_code: leagueCode,
        sport: "football",
        competition_code: "FL1",
        matchday: Number(matchday),
        title: `Ligue 1 — Journée ${Number(matchday)}`,
        deadline_at: deadlineAt,
        featured_match_external_id: Number(featuredExternalMatchId),
        status: "PUBLISHED",
        published_at: nowIso,
        created_by: adminId || "admin_system",
        updated_at: nowIso,
      },
      { onConflict: "league_code,competition_code,matchday" }
    )
    .select("*")
    .single();

  if (dayError) return json(res, 500, { ok: false, error: dayError.message || String(dayError) });

  // 2) Reset des matchs de la journée
  const { error: delError } = await supabaseAdmin.from("day_matches").delete().eq("day_id", day.id);
  if (delError) return json(res, 500, { ok: false, error: delError.message || String(delError) });

  // 3) Insert day_matches
  // On attend des objets "football-data" (id, utcDate, status, homeTeam/awayTeam...)
  const rows = matches.map((m) => {
    // Compat : si on reçoit un nombre, on insère minimal
    if (typeof m === "number") {
      return {
        day_id: day.id,
        external_match_id: Number(m),
        is_featured: Number(m) === Number(featuredExternalMatchId),
      };
    }

    const externalId = Number(m.externalMatchId ?? m.id);
    return {
      day_id: day.id,
      external_match_id: externalId,
      utc_date: m.utcDate || null,
      status: m.status || null,

      home_team_id: m.homeTeam?.id ?? null,
      home_team_name: m.homeTeam?.name ?? null,
      home_team_crest: m.homeTeam?.crest ?? null,

      away_team_id: m.awayTeam?.id ?? null,
      away_team_name: m.awayTeam?.name ?? null,
      away_team_crest: m.awayTeam?.crest ?? null,

      is_featured: externalId === Number(featuredExternalMatchId),
    };
  });

  const { error: insError } = await supabaseAdmin.from("day_matches").insert(rows);
  if (insError) return json(res, 500, { ok: false, error: insError.message || String(insError) });

  // 4) Notification inbox + push
  const title = `LNJP — Journée ${Number(matchday)} ouverte`;
  const body = `Pronostics à valider avant ${new Date(deadlineAt).toLocaleString("fr-FR")} .`;
  const url = `/?dayId=${encodeURIComponent(day.id)}`;

  let notif = null;
  let push = null;
  try {
    notif = await insertInboxNotification({ title, body, url, createdBy: adminId || "admin_system" });
    push = await sendPushToAll({ title, body, url });
  } catch (e) {
    // On ne rollback pas la journée; on expose l’info pour debug
    return json(res, 200, { ok: true, dayId: day.id, published: true, notification: null, push: null, warn: e?.message || String(e) });
  }

  return json(res, 200, { ok: true, dayId: day.id, published: true, notificationId: notif.id, push });
}

async function handleFootballFl1Upcoming(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  const count = Math.min(Math.max(Number(req.query?.count || 5), 1), 10);
  const token = process.env.FOOTBALL_DATA_TOKEN || process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) return json(res, 500, { ok: false, error: "Missing FOOTBALL_DATA_TOKEN" });

  const headers = { "X-Auth-Token": token };
  const r = await fetch("https://api.football-data.org/v4/competitions/FL1/matches?status=SCHEDULED", { headers });
  if (!r.ok) return json(res, 500, { ok: false, error: `Football-Data HTTP ${r.status}` });

  const payload = await r.json();
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];

  const mdList = matches.map((m) => m.matchday).filter((x) => Number.isFinite(x));
  const currentMatchday = mdList.length ? Math.min(...mdList) : null;

  const groups = new Map();
  for (const m of matches) {
    const md = Number(m.matchday);
    if (!Number.isFinite(md)) continue;
    if (!groups.has(md)) groups.set(md, []);
    groups.get(md).push(m);
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

async function handleAdminNotify(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  const { title, body, url, createdBy } = req.body || {};
  if (!title || !body) return json(res, 400, { ok: false, error: "title/body required" });

  const notif = await insertInboxNotification({ title, body, url, createdBy: createdBy || "admin_system" });
  const push = await sendPushToAll({ title, body, url });

  return json(res, 200, { ok: true, notificationId: notif.id, ...push });
}

async function handleAdminChat(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  const { message } = req.body || {};
  if (!message) return json(res, 400, { ok: false, error: "message is required" });

  const sb = sbService();
  const { data, error } = await sb.from("chat_messages").insert({ role: "admin", content: message }).select("*").single();
  if (error) return json(res, 500, { ok: false, error: error.message || String(error) });

  return json(res, 200, { ok: true, message: data });
}

/**
 * days-audit: check BDD "jour présent + pronos complets"
 */
async function handleDaysAudit(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  assertAdmin(req);

  const dayId = getQueryParam(req, "dayId");
  if (!dayId) return json(res, 400, { ok: false, error: "Missing dayId" });

  const { data: day, error: dErr } = await supabaseAdmin.from("days").select("*").eq("id", dayId).single();
  if (dErr) return json(res, 500, { ok: false, error: dErr.message || String(dErr) });
  if (!day) return json(res, 404, { ok: false, error: "Day not found" });

  const { data: matches, error: mErr } = await supabaseAdmin.from("day_matches").select("external_match_id").eq("day_id", dayId);
  if (mErr) return json(res, 500, { ok: false, error: mErr.message || String(mErr) });

  const expected = (matches || []).length;

  const { data: preds, error: pErr } = await supabaseAdmin
    .from("predictions")
    .select("user_id, external_match_id")
    .eq("day_id", dayId);

  if (pErr) return json(res, 500, { ok: false, error: pErr.message || String(pErr) });

  const byUser = new Map();
  for (const p of preds || []) {
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, new Set());
    byUser.get(p.user_id).add(Number(p.external_match_id));
  }

  const users = Array.from(byUser.entries()).map(([userId, set]) => ({
    userId,
    nbPred: set.size,
    complete: expected > 0 && set.size === expected,
  }));

  return json(res, 200, { ok: true, day, expectedMatches: expected, users });
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

      // Compat : ancien "days-save" => publish
      case "days-save":
        return await handleDaysPublish(req, res);

      case "days-publish":
        return await handleDaysPublish(req, res);

      case "days-audit":
        return await handleDaysAudit(req, res);

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
