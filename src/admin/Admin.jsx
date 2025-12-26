import { useMemo, useState } from "react";

export default function Admin() {
  // Token commun à tous les blocs
  const [token, setToken] = useState("");

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
    // Compat: le backend peut lire x-admin-token (comme ton curl) ou Authorization
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
    setDeadlineLocal(toDatetimeLocalValue(d?.deadline_at || d?.deadlineAt));
    setFeaturedId(String(d?.featured_match_external_id ?? d?.featuredExternalMatchId ?? d?.featured_external_match_id ?? ""));
    const raw = d?.matches ?? d?.selectedMatches ?? d?.match_external_ids ?? [];
    setSelectedMatches(Array.isArray(raw) ? raw.map((x) => Number(x)) : []);
  }

  async function loadDays() {
    setDaysError("");
    setDaysLoading(true);
    try {
      const r = await fetch("/api/admin/days-list", {
        method: "GET",
        headers: adminHeaders(),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        const msg = data?.error || `HTTP ${r.status}`;
        throw new Error(msg);
      }

      setDays(Array.isArray(data.days) ? data.days : []);
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
      const selectedMatchObjects = (editingDay.matches || [])
        .filter((m) => selectedMatches.includes(Number(m.id)))
        .map((m) => ({
          // format attendu côté backend (compat)
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

  function toggleMatch(externalId) {
    const id = Number(externalId);
    setSelectedMatches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
          <input className="w-full border rounded-lg p-2" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="w-full border rounded-lg p-2" placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
          <input className="w-full border rounded-lg p-2" placeholder="URL (optionnel)" value={url} onChange={(e) => setUrl(e.target.value)} />

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

          {result && <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
        </div>

        {/* 2) Messagerie */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-lg font-bold">Messagerie — Message dans le salon</div>
          <div className="text-sm text-slate-600">Envoie un message dans le salon unique de la ligue (comme un utilisateur).</div>

          <input
            className="w-full border rounded-lg p-2"
            placeholder="ADMIN_TOKEN (MVP)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          <textarea className="w-full border rounded-lg p-2" placeholder="Message à publier" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} />

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
                  body: JSON.stringify({ content: chatMessage }),
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

          {chatResult && <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">{JSON.stringify(chatResult, null, 2)}</pre>}
        </div>

        {/* 3) Journées */}
        <div className="rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold">Journées — workflow (MVP)</div>
              <div className="text-sm text-slate-600">
                Charger les prochaines journées, sélectionner les matchs, définir la deadline et le match phare, puis enregistrer via{" "}
                <span className="font-mono">/api/admin/days-save</span>.
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
            placeholder="ADMIN_TOKEN (utilisé pour days-list et days-save)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          {daysError ? <div className="text-sm text-red-600">{daysError}</div> : null}

          <div className="space-y-3">
            {days.length === 0 ? (
              <div className="text-sm text-slate-600">Aucune journée chargée. Clique sur <span className="font-semibold">Charger les journées</span>.</div>
            ) : (
              days.map((d) => {
                const md = Number(d.matchday);
                const status = d.status || "—";
                const title = d.title || `Journée ${md}`;
                const deadline = d.deadline_at || d.deadlineAt || null;
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
                            <input type="datetime-local" className="w-full border rounded-lg p-2" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} />
                          </label>

                          <label className="block space-y-1">
                            <span className="text-sm font-medium">Match phare (externalMatchId)</span>
                            <input className="w-full border rounded-lg p-2" value={featuredId} onChange={(e) => setFeaturedId(e.target.value)} placeholder="ex: 123" inputMode="numeric" />
                          </label>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Matchs proposés aux paris</div>

                          {Array.isArray(d.matches_details) && d.matches_details.length > 0 ? (
                            <div className="space-y-2">
                              {d.matches_details.map((m) => {
                                const mid = Number(m.externalMatchId ?? m.id ?? m.external_id);
                                const label = m.label || m.name || `${m.homeTeam ?? m.home ?? "Home"} - ${m.awayTeam ?? m.away ?? "Away"}`;
                                const checked = selectedMatches.includes(mid);

                                return (
                                  <label key={String(mid)} className="flex items-center gap-3 border rounded-lg p-2">
                                    <input type="checkbox" checked={checked} onChange={() => toggleMatch(mid)} />
                                    <div className="flex-1">
                                      <div className="text-sm">{label}</div>
                                      <div className="text-xs text-slate-500 font-mono">externalId: {mid}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-600">
                              matches_details n’est pas renvoyé par l’API (c’est OK pour l’instant).
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col md:flex-row gap-2">
                          <button
                            className="flex-1 rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
                            disabled={saveBusy}
                            onClick={saveDay}
                          >
                            {saveBusy ? "Enregistrement..." : "Enregistrer (day-save)"}
                          </button>

                          <button className="rounded-xl border px-4 py-3 font-semibold hover:bg-slate-50" onClick={() => setEditingMatchday(null)}>
                            Fermer
                          </button>
                        </div>

                        {saveResult && <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">{JSON.stringify(saveResult, null, 2)}</pre>}
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
