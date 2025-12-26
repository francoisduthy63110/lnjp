import { useMemo, useState } from "react";

export default function Admin() {
  // Token commun à tous les blocs
  const [token, setToken] = useState("");
  const [leagueCode, setLeagueCode] = useState("LNJP2025");

  // --- Bloc NOTIFS
  const [title, setTitle] = useState("LNJP");
  const [body, setBody] = useState("Attention, pronostics à faire avant demain 19h.");
  const [url, setUrl] = useState("/");
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  // --- Bloc CHAT
  const [chatMessage, setChatMessage] = useState("Salut à tous, pensez à valider vos pronos.");
  const [chatResult, setChatResult] = useState(null);
  const [chatSending, setChatSending] = useState(false);

  // --- Bloc JOURNEES
  const [daysLoading, setDaysLoading] = useState(false);
  const [daysError, setDaysError] = useState("");
  const [days, setDays] = useState([]);

  const [editingMatchday, setEditingMatchday] = useState(null);
  const editingDay = useMemo(() => {
    if (editingMatchday == null) return null;
    return days.find((d) => Number(d.matchday) === Number(editingMatchday)) || null;
  }, [days, editingMatchday]);

  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [featuredId, setFeaturedId] = useState("");
  const [selectedMatches, setSelectedMatches] = useState([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  function adminHeaders() {
    return {
      "Content-Type": "application/json",
      "x-admin-token": token,
      Authorization: `Bearer ${token}`,
    };
  }

  function toDatetimeLocalValue(isoOrNull) {
    if (!isoOrNull) return "";
    const d = new Date(isoOrNull);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function datetimeLocalToISO(dtLocal) {
    if (!dtLocal) return null;
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function startEdit(matchday) {
    setSaveResult(null);
    setDaysError("");
    setEditingMatchday(matchday);

    const d = days.find((x) => Number(x.matchday) === Number(matchday));

    // si jour déjà publié en BDD, on garde sa deadline/featured
    setDeadlineLocal(toDatetimeLocalValue(d?.deadline_at || d?.deadlineAt || d?.deadline_at_db || null));
    setFeaturedId(
      String(
        d?.featured_match_external_id ??
          d?.featuredExternalMatchId ??
          d?.featured_external_match_id ??
          ""
      )
    );

    // Pré-sélection (si tu ajoutes plus tard un chargement depuis day_matches)
    setSelectedMatches(Array.isArray(d?.selectedMatches) ? d.selectedMatches.map((x) => Number(x)) : []);
  }

  function toggleMatch(externalId) {
    const id = Number(externalId);
    setSelectedMatches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /**
   * Charge:
   * 1) les jours déjà publiés en DB (/api/admin/days-list) => status, deadline, featured
   * 2) les prochains matchs via Football API (/api/admin/football/fl1-upcoming) => matchday + matches[]
   * Puis merge par matchday:
   * - si DB existe => status PUBLISHED + deadline + featured
   * - on garde matches (football) pour cocher et publier
   */
  async function loadDays() {
    setDaysError("");
    setDaysLoading(true);
    try {
      // 1) DB days
      const rDb = await fetch(`/api/admin/days-list?leagueCode=${encodeURIComponent(leagueCode)}`, {
        method: "GET",
        headers: adminHeaders(),
      });
      const db = await rDb.json().catch(() => ({}));
      if (!rDb.ok || !db?.ok) {
        const msg = db?.error || `HTTP ${rDb.status}`;
        throw new Error(msg);
      }
      const dbDays = Array.isArray(db.days) ? db.days : [];

      // index DB par matchday
      const dbByMd = new Map();
      for (const d of dbDays) {
        dbByMd.set(Number(d.matchday), d);
      }

      // 2) Upcoming via football API
      const rUp = await fetch(`/api/admin/football/fl1-upcoming?count=5`, {
        method: "GET",
        headers: adminHeaders(),
      });
      const up = await rUp.json().catch(() => ({}));
      if (!rUp.ok || !up?.ok) {
        const msg = up?.error || `HTTP ${rUp.status}`;
        throw new Error(msg);
      }

      // up.days = [{matchday, matches:[...]}, ...]
      const upcomingDays = Array.isArray(up.days) ? up.days : [];

      // 3) Merge
      const merged = [];

      for (const d of upcomingDays) {
        const md = Number(d.matchday);
        const matches = Array.isArray(d.matches) ? d.matches : [];

        const dbDay = dbByMd.get(md);

        merged.push({
          // affichage
          title: dbDay?.title || `Ligue 1 — Journée ${md}`,
          matchday: md,

          // statut
          status: dbDay?.status || "DRAFT",
          deadline_at: dbDay?.deadline_at || null,
          featured_match_external_id: dbDay?.featured_match_external_id || null,

          // utile pour publish
          matches, // objets football-data (id, utcDate, homeTeam, awayTeam, status...)

          // pour clé react
          id: dbDay?.id || `upcoming-${md}`,
        });
      }

      // Bonus: si DB contient des journées hors upcoming, on les ajoute à la fin
      for (const dbDay of dbDays) {
        const md = Number(dbDay.matchday);
        const already = merged.some((x) => Number(x.matchday) === md);
        if (already) continue;
        merged.push({
          title: dbDay.title || `Ligue 1 — Journée ${md}`,
          matchday: md,
          status: dbDay.status || "PUBLISHED",
          deadline_at: dbDay.deadline_at || null,
          featured_match_external_id: dbDay.featured_match_external_id || null,
          matches: [], // pas de matches connus sans football API
          id: dbDay.id || `db-${md}`,
        });
      }

      // tri par matchday
      merged.sort((a, b) => Number(a.matchday) - Number(b.matchday));

      setDays(merged);
    } catch (e) {
      setDaysError(e?.message || String(e));
    } finally {
      setDaysLoading(false);
    }
  }

  async function saveDay() {
    if (!editingDay) return;
    setSaveResult(null);
    setSaveBusy(true);
    try {
      // Ici editingDay.matches vient de football-fl1-upcoming
      const selectedMatchObjects = (editingDay.matches || [])
        .filter((m) => selectedMatches.includes(Number(m.id)))
        .map((m) => ({
          externalMatchId: Number(m.id),
          utcDate: m.utcDate || null,
          status: m.status || null,
          homeTeam: m.homeTeam || null,
          awayTeam: m.awayTeam || null,
        }));

      const payload = {
        leagueCode,
        matchday: Number(editingDay.matchday),
        deadlineAt: datetimeLocalToISO(deadlineLocal),
        featuredExternalMatchId: featuredId ? Number(featuredId) : null,
        matches: selectedMatchObjects,
      };

      const r = await fetch("/api/admin/days-publish", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));
      setSaveResult(data);

      if (r.ok && data?.ok) {
        await loadDays();
      }
    } catch (e) {
      setSaveResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Super Admin</h1>

        {/* 1) Notifications */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-lg font-bold">Notifications — Push + Inbox</div>

          <input
            className="w-full border rounded-lg p-2"
            placeholder="ADMIN_TOKEN (MVP)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          <input
            className="w-full border rounded-lg p-2"
            placeholder="LEAGUE_CODE"
            value={leagueCode}
            onChange={(e) => setLeagueCode(e.target.value)}
          />

          <input
            className="w-full border rounded-lg p-2"
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full border rounded-lg p-2"
            placeholder="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <input
            className="w-full border rounded-lg p-2"
            placeholder="URL (optionnel)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />

          <button
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
            disabled={sending}
            onClick={async () => {
              setResult(null);
              setSending(true);
              try {
                const r = await fetch("/api/admin-notify", {
                  method: "POST",
                  headers: adminHeaders(),
                  body: JSON.stringify({ title, body, url }),
                });
                const data = await r.json().catch(() => ({}));
                setResult(data);
              } catch (e) {
                setResult({ error: e?.message || String(e) });
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Envoi..." : "Envoyer push + Inbox"}
          </button>

          {result && (
            <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>

        {/* 2) Messagerie */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-lg font-bold">Messagerie — Message dans le salon</div>
          <div className="text-sm text-slate-600">Envoie un message dans le salon unique de la ligue (comme un utilisateur).</div>

          <textarea
            className="w-full border rounded-lg p-2"
            placeholder="Message à publier"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
          />

          <button
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
            disabled={chatSending || chatMessage.trim().length === 0}
            onClick={async () => {
              setChatResult(null);
              setChatSending(true);
              try {
                const r = await fetch("/api/admin-chat", {
                  method: "POST",
                  headers: adminHeaders(),
                  // IMPORTANT: backend attend {message: "..."}
                  body: JSON.stringify({ message: chatMessage }),
                });
                const data = await r.json().catch(() => ({}));
                setChatResult(data);
              } catch (e) {
                setChatResult({ error: e?.message || String(e) });
              } finally {
                setChatSending(false);
              }
            }}
          >
            {chatSending ? "Envoi..." : "Envoyer dans la messagerie"}
          </button>

          {chatResult && (
            <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">
              {JSON.stringify(chatResult, null, 2)}
            </pre>
          )}
        </div>

        {/* 3) Journées */}
        <div className="rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold">Journées — workflow (MVP)</div>
              <div className="text-sm text-slate-600">
                1) Charger les prochaines journées (Football API) + états DB, 2) sélectionner les matchs, 3) définir deadline + match phare, 4) publier.
              </div>
            </div>

            <button
              className="rounded-xl bg-slate-900 text-white px-4 py-2 font-semibold hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              disabled={daysLoading}
              onClick={loadDays}
            >
              {daysLoading ? "Chargement..." : "Charger les journées"}
            </button>
          </div>

          <input
            className="w-full border rounded-lg p-2"
            placeholder="ADMIN_TOKEN (utilisé pour days-list et days-publish)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          {daysError ? <div className="text-sm text-red-600">{daysError}</div> : null}

          <div className="space-y-3">
            {days.length === 0 ? (
              <div className="text-sm text-slate-600">
                Aucune journée chargée. Clique sur <span className="font-semibold">Charger les journées</span>.
              </div>
            ) : (
              days.map((d) => {
                const md = Number(d.matchday);
                const status = d.status || "—";
                const title = d.title || `Journée ${md}`;
                const deadline = d.deadline_at || null;
                const isEditing = Number(editingMatchday) === md;

                return (
                  <div key={String(d.id || md)} className="border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-semibold">{title}</div>
                        <div className="text-xs text-slate-600">
                          Matchday: <span className="font-mono">{md}</span> • Statut: <span className="font-mono">{status}</span>
                        </div>
                        <div className="text-xs text-slate-600">
                          Deadline: <span className="font-mono">{deadline ? new Date(deadline).toLocaleString() : "—"}</span>
                        </div>
                      </div>

                      <button className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => startEdit(md)}>
                        {isEditing ? "Réglages (ouvert)" : "Configurer"}
                      </button>
                    </div>

                    {isEditing && (
                      <div className="mt-4 border-t pt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <label className="block space-y-1">
                            <span className="text-sm font-medium">Deadline</span>
                            <input
                              type="datetime-local"
                              className="w-full border rounded-lg p-2"
                              value={deadlineLocal}
                              onChange={(e) => setDeadlineLocal(e.target.value)}
                            />
                          </label>

                          <label className="block space-y-1">
                            <span className="text-sm font-medium">Match phare (externalMatchId)</span>
                            <input
                              className="w-full border rounded-lg p-2"
                              value={featuredId}
                              onChange={(e) => setFeaturedId(e.target.value)}
                              placeholder="ex: 123"
                              inputMode="numeric"
                            />
                          </label>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Matchs proposés aux paris</div>

                          {Array.isArray(d.matches) && d.matches.length > 0 ? (
                            <div className="space-y-2">
                              {d.matches.map((m) => {
                                const mid = Number(m.id);
                                const home = m.homeTeam?.name || "Home";
                                const away = m.awayTeam?.name || "Away";
                                const when = m.utcDate ? new Date(m.utcDate).toLocaleString("fr-FR") : "";
                                const checked = selectedMatches.includes(mid);

                                return (
                                  <label key={String(mid)} className="flex items-center gap-3 border rounded-lg p-2">
                                    <input type="checkbox" checked={checked} onChange={() => toggleMatch(mid)} />
                                    <div className="flex-1">
                                      <div className="text-sm">
                                        {home} <span className="text-slate-400">vs</span> {away}
                                      </div>
                                      <div className="text-xs text-slate-500 font-mono">
                                        externalId: {mid}
                                        {when ? ` — ${when}` : ""}
                                        {m.status ? ` — ${m.status}` : ""}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-600">
                              Aucun match chargé pour cette journée (reclique “Charger les journées”).
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col md:flex-row gap-2">
                          <button
                            className="flex-1 rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
                            disabled={saveBusy}
                            onClick={saveDay}
                            title={selectedMatches.length === 0 ? "Sélectionne au moins 1 match" : "Publier la journée"}
                          >
                            {saveBusy ? "Publication..." : "Publier (days-publish)"}
                          </button>

                          <button className="rounded-xl border px-4 py-3 font-semibold hover:bg-slate-50" onClick={() => setEditingMatchday(null)}>
                            Fermer
                          </button>
                        </div>

                        {saveResult && (
                          <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">
                            {JSON.stringify(saveResult, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Astuce : ouvre <span className="font-mono">/admin</span> sur ton ordinateur.
        </p>
      </div>
    </div>
  );
}
