import webpush from "web-push";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";

function json(res, status, payload) {
  res.status(status).json(payload);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function readAdminToken(req) {
  const x = req.headers["x-admin-token"];
  if (x) return String(x);
  const auth = req.headers["authorization"] || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7);
  return "";
}

function assertAdmin(req) {
  const token = readAdminToken(req);
  const expected = process.env.ADMIN_TOKEN || "lnjp_super_admin_2025_secret_token";
  if (!token || token !== expected) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
}

function getQueryParam(req, key) {
  return req.query?.[key] ?? null;
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

function computeDeadlineFromMatches(matches, hoursBefore = 1) {
  const times = (matches || [])
    .map((m) => (m.utcDate ? new Date(m.utcDate).getTime() : null))
    .filter((t) => typeof t === "number" && Number.isFinite(t));
  if (!times.length) return null;
  const first = Math.min(...times);
  return new Date(first - hoursBefore * 60 * 60 * 1000).toISOString();
}

function pickDefaultFeatured(matches) {
  const list = (matches || [])
    .map((m) => ({
      id: Number(m.externalMatchId ?? m.external_match_id ?? m.id),
      t: m.utcDate ? new Date(m.utcDate).getTime() : null,
    }))
    .filter((x) => Number.isFinite(x.id) && Number.isFinite(x.t));
  if (!list.length) return null;
  list.sort((a, b) => a.t - b.t);
  return list[list.length - 1].id; // dernier match
}

/**
 * Push + Inbox
 */
function initWebPushIfPossible() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails("mailto:admin@lnjp.local", publicKey, privateKey);
  return true;
}

async function sendInboxAndPushToLeague({ leagueCode, title, body, url }) {
  // Inbox
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("*")
    .eq("league_code", leagueCode);

  // inbox_notifications: on en crée une par userId (device agnostique)
  const userIds = [...new Set((subs || []).map((s) => s.user_id).filter(Boolean))];

  let notificationId = null;
  const { data: notifRow } = await supabaseAdmin
    .from("notifications")
    .insert([{ league_code: leagueCode, title, body, url }])
    .select("id")
    .single();

  notificationId = notifRow?.id ?? null;

  if (userIds.length) {
    const inboxRows = userIds.map((userId) => ({
      user_id: userId,
      notification_id: notificationId,
      league_code: leagueCode,
      read_at: null,
    }));
    await supabaseAdmin.from("inbox_notifications").insert(inboxRows);
  }

  // push
  const push = { sent: 0, failed: 0, subs: (subs || []).length };
  if (initWebPushIfPossible() && subs?.length) {
    const payload = JSON.stringify({ title, body, url, type: "LNJP" });
    for (const s of subs) {
      try {
        await webpush.sendNotification(s.subscription, payload);
        push.sent++;
      } catch {
        push.failed++;
      }
    }
  }
  return { notificationId, push };
}

/**
 * Football API helpers
 */
async function footballFetch(path) {
  const token = requireEnv("FOOTBALL_DATA_TOKEN");
  const r = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: { "X-Auth-Token": token },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Football API error ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json();
}

function groupByMatchday(matches) {
  const map = new Map();
  for (const m of matches || []) {
    const md = Number(m.matchday);
    if (!Number.isFinite(md)) continue;
    const arr = map.get(md) || [];
    arr.push(m);
    map.set(md, arr);
  }
  const days = [];
  for (const [matchday, arr] of map.entries()) {
    arr.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    days.push({ matchday, matches: arr });
  }
  days.sort((a, b) => a.matchday - b.matchday);
  return days;
}

async function handleFootballUpcoming(req, res) {
  assertAdmin(req);
  const count = Number(getQueryParam(req, "count") || 5);
  // scheduled matches, group by matchday, take next matchdays
  const data = await footballFetch(`/competitions/FL1/matches?status=SCHEDULED`);
  const grouped = groupByMatchday(data.matches || []);
  const sliced = grouped.slice(0, Math.max(1, Math.min(10, count)));
  return json(res, 200, { ok: true, days: sliced });
}

async function handleFootballMatchday(req, res) {
  assertAdmin(req);
  const matchday = Number(getQueryParam(req, "matchday"));
  if (!Number.isFinite(matchday)) return json(res, 400, { ok: false, error: "Missing matchday" });

  const data = await footballFetch(`/competitions/FL1/matches?matchday=${matchday}`);
  const matches = (data.matches || []).sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  return json(res, 200, { ok: true, matchday, matches });
}

/**
 * Days list: published days from DB + recall selections
 */
async function handleDaysList(req, res) {
  assertAdmin(req);
  const leagueCode = getQueryParam(req, "leagueCode") || "LNJP";

  const { data: days, error } = await supabaseAdmin
    .from("days")
    .select("id,league_code,competition_code,matchday,title,deadline_at,status,featured_match_external_id,updated_at,published_at")
    .eq("league_code", leagueCode)
    .eq("competition_code", "FL1")
    .order("matchday", { ascending: true });

  if (error) return json(res, 500, { ok: false, error: error.message || String(error) });

  const dayIds = (days || []).map((d) => d.id);
  const { data: dms } = dayIds.length
    ? await supabaseAdmin
        .from("day_matches")
        .select("day_id,external_match_id,utc_date,home_team_name,away_team_name,status,is_featured")
        .in("day_id", dayIds)
    : { data: [] };

  const byDay = new Map();
  for (const m of dms || []) {
    const arr = byDay.get(m.day_id) || [];
    arr.push(m);
    byDay.set(m.day_id, arr);
  }

  const out = (days || []).map((d) => ({
    ...d,
    selectedMatchIds: (byDay.get(d.id) || []).map((m) => Number(m.external_match_id)),
    matches: byDay.get(d.id) || [],
  }));

  return json(res, 200, { ok: true, days: out });
}

/**
 * Publish / Update day (deadline auto + match phare default + optional reset predictions)
 */
async function handleDaysPublish(req, res) {
  assertAdmin(req);

  const body = await readJsonBody(req);
  const leagueCode = String(body.leagueCode || "").trim();
  const matchday = Number(body.matchday);
  const matches = Array.isArray(body.matches) ? body.matches : [];
  const featuredProvided = body.featuredExternalMatchId != null ? Number(body.featuredExternalMatchId) : null;

  if (!leagueCode || !Number.isFinite(matchday) || matches.length === 0) {
    return json(res, 400, { ok: false, error: "Invalid payload" });
  }

  // normalize matches
  const normalized = matches.map((m) => ({
    externalMatchId: Number(m.externalMatchId ?? m.id),
    utcDate: m.utcDate || null,
    status: m.status || null,
    homeTeam: m.homeTeam || null,
    awayTeam: m.awayTeam || null,
  }));

  if (normalized.some((m) => !Number.isFinite(m.externalMatchId))) {
    return json(res, 400, { ok: false, error: "Invalid matches" });
  }

  // compute deadline + default featured
  const deadlineAt = computeDeadlineFromMatches(normalized, 1);
  if (!deadlineAt) return json(res, 400, { ok: false, error: "Cannot compute deadline (missing utcDate)" });

  const featuredExternalMatchId = Number.isFinite(featuredProvided) ? featuredProvided : pickDefaultFeatured(normalized);
  if (!Number.isFinite(featuredExternalMatchId)) {
    return json(res, 400, { ok: false, error: "Cannot pick featured match" });
  }

  // detect existing day (unique key: league_code + competition_code + matchday)
  const { data: existing } = await supabaseAdmin
    .from("days")
    .select("id,status")
    .eq("league_code", leagueCode)
    .eq("competition_code", "FL1")
    .eq("matchday", matchday)
    .maybeSingle();

  const isUpdate = !!existing?.id;

  // upsert day
  const title = `Ligue 1 — Journée ${matchday}`;

// upsert day (IMPORTANT: ne pas envoyer "id" en création)
const dayRow = {
  league_code: leagueCode,
  sport: "football",
  competition_code: "FL1",
  matchday,
  title,
  deadline_at: deadlineAt,
  featured_match_external_id: featuredExternalMatchId,
  status: "PUBLISHED",
  published_at: new Date().toISOString(),
  created_by: "admin_system",
  updated_at: new Date().toISOString(),
};

if (existing?.id) dayRow.id = existing.id; // uniquement en update

const { data: day, error: upErr } = await supabaseAdmin
  .from("days")
  .upsert([dayRow], { onConflict: "league_code,competition_code,matchday" })
  .select("*")
  .single();


  if (upErr) return json(res, 500, { ok: false, error: upErr.message || String(upErr) });

  // replace day_matches
  await supabaseAdmin.from("day_matches").delete().eq("day_id", day.id);

  const dmRows = normalized.map((m) => ({
    day_id: day.id,
    external_match_id: m.externalMatchId,
    utc_date: m.utcDate,
    status: m.status,
    home_team_id: m.homeTeam?.id ?? null,
    home_team_name: m.homeTeam?.name ?? null,
    away_team_id: m.awayTeam?.id ?? null,
    away_team_name: m.awayTeam?.name ?? null,
    is_featured: Number(m.externalMatchId) === Number(featuredExternalMatchId),
  }));

  const { error: dmInsErr } = await supabaseAdmin.from("day_matches").insert(dmRows);
  if (dmInsErr) return json(res, 500, { ok: false, error: dmInsErr.message || String(dmInsErr) });

  // if update => delete predictions
  let deletedPredictions = 0;
  if (isUpdate) {
    const { count } = await supabaseAdmin
      .from("predictions")
      .delete({ count: "exact" })
      .eq("day_id", day.id);

    deletedPredictions = count || 0;
  }

  // notify
  const notifTitle = isUpdate ? "LNJP — Journée modifiée" : "LNJP — Nouvelle journée publiée";
  const notifBody = isUpdate
    ? `La journée ${matchday} a été modifiée. Tes pronostics ont été réinitialisés, merci de les refaire.`
    : `Journée ${matchday} publiée. Fais tes pronostics avant la deadline.`;

  const url = `/?dayId=${encodeURIComponent(day.id)}`;

  const { notificationId, push } = await sendInboxAndPushToLeague({
    leagueCode,
    title: notifTitle,
    body: notifBody,
    url,
  });

  return json(res, 200, {
    ok: true,
    mode: isUpdate ? "updated" : "created",
    dayId: day.id,
    published: true,
    deadlineAt,
    featuredExternalMatchId,
    deletedPredictions,
    notificationId,
    push,
  });
}

/**
 * Admin notify (manual)
 */
async function handleAdminNotify(req, res) {
  assertAdmin(req);
  const body = await readJsonBody(req);
  const leagueCode = String(body.leagueCode || getQueryParam(req, "leagueCode") || "LNJP").trim();
  const title = String(body.title || "LNJP");
  const msg = String(body.body || "");
  const url = String(body.url || "/");

  const { notificationId, push } = await sendInboxAndPushToLeague({ leagueCode, title, body: msg, url });
  return json(res, 200, { ok: true, notificationId, push });
}

async function handleAdminChat(req, res) {
  assertAdmin(req);
  const body = await readJsonBody(req);
  const message = String(body.message || "").trim();
  if (!message) return json(res, 400, { ok: false, error: "Missing message" });

  // salon unique : leagueCode optionnel dans le body
  const leagueCode = String(body.leagueCode || "LNJP").trim();

  const { error } = await supabaseAdmin
    .from("chat_messages")
    .insert([{ league_code: leagueCode, user_id: "admin_system", display_name: "Admin", content: message }]);

  if (error) return json(res, 500, { ok: false, error: error.message || String(error) });
  return json(res, 200, { ok: true });
}

/**
 * Audit : présence journée + complétude joueurs
 * (utile pour tes tests)
 */
async function handleDaysAudit(req, res) {
  assertAdmin(req);
  const dayId = String(getQueryParam(req, "dayId") || "");
  if (!dayId) return json(res, 400, { ok: false, error: "Missing dayId" });

  const { data: day } = await supabaseAdmin.from("days").select("*").eq("id", dayId).single();
  const { data: matches } = await supabaseAdmin.from("day_matches").select("external_match_id").eq("day_id", dayId);
  const expectedMatches = (matches || []).length;

  const { data: preds } = await supabaseAdmin
    .from("predictions")
    .select("user_id,external_match_id")
    .eq("day_id", dayId);

  const byUser = new Map();
  for (const p of preds || []) {
    const set = byUser.get(p.user_id) || new Set();
    set.add(Number(p.external_match_id));
    byUser.set(p.user_id, set);
  }

  const users = [...byUser.entries()].map(([userId, set]) => ({
    userId,
    nbPred: set.size,
    complete: expectedMatches > 0 && set.size === expectedMatches,
  }));

  return json(res, 200, { ok: true, day, expectedMatches, users });
}

export default async function handler(req, res) {
  try {
    const action = String(getQueryParam(req, "action") || "");
    switch (action) {
      case "days-list":
        return await handleDaysList(req, res);

      case "days-publish":
      case "days-save": // alias
        return await handleDaysPublish(req, res);

      case "football-fl1-upcoming":
        return await handleFootballUpcoming(req, res);

      case "football-fl1-matchday":
        return await handleFootballMatchday(req, res);

      case "admin-notify":
        return await handleAdminNotify(req, res);

      case "admin-chat":
        return await handleAdminChat(req, res);

      case "days-audit":
        return await handleDaysAudit(req, res);

      default:
        return json(res, 404, { ok: false, error: "Unknown admin action" });
    }
  } catch (e) {
    const status = e?.status || 500;
    return json(res, status, { ok: false, error: e?.message || String(e) });
  }
}
