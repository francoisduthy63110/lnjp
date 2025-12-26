import { useEffect, useMemo, useState } from "react";

const LS_ADMIN_TOKEN = "lnjp_admin_token";
const LS_ADMIN_LEAGUE = "lnjp_admin_league";

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem(LS_ADMIN_TOKEN) || "");
  const [leagueCode, setLeagueCode] = useState(() => localStorage.getItem(LS_ADMIN_LEAGUE) || "LNJP2025");

  const [isAuthed, setIsAuthed] = useState(() => !!localStorage.getItem(LS_ADMIN_TOKEN));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [active, setActive] = useState("days"); // days | notify | chat

  function headers() {
    return {
      "Content-Type": "application/json",
      "x-admin-token": token,
      Authorization: `Bearer ${token}`,
    };
  }

  async function verifyAndLogin() {
    setAuthError("");
    setAuthBusy(true);
    try {
      const r = await fetch(`/api/admin/days-list?leagueCode=${encodeURIComponent(leagueCode)}`, {
        headers: headers(),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);

      localStorage.setItem(LS_ADMIN_TOKEN, token);
      localStorage.setItem(LS_ADMIN_LEAGUE, leagueCode);
      setIsAuthed(true);
    } catch (e) {
      setAuthError(e?.message || String(e));
      setIsAuthed(false);
      localStorage.removeItem(LS_ADMIN_TOKEN);
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(LS_ADMIN_TOKEN);
    setIsAuthed(false);
    setToken("");
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-white text-slate-900 p-6">
        <div className="max-w-lg mx-auto space-y-4">
          <h1 className="text-3xl font-extrabold">Admin — Connexion</h1>
          <div className="rounded-2xl border p-4 space-y-3">
            <input
              className="w-full border rounded-xl p-3"
              placeholder="ADMIN_TOKEN"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <input
              className="w-full border rounded-xl p-3"
              placeholder="LEAGUE_CODE"
              value={leagueCode}
              onChange={(e) => setLeagueCode(e.target.value)}
            />
            <button
              className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold disabled:opacity-50"
              onClick={verifyAndLogin}
              disabled={authBusy || token.trim().length < 10 || leagueCode.trim().length < 3}
            >
              {authBusy ? "Connexion..." : "Se connecter"}
            </button>
            {authError ? <div className="text-sm text-red-600">{authError}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 border-r min-h-screen p-4">
          <div className="text-2xl font-extrabold">LNJP</div>
          <div className="text-xs text-slate-600 mt-1">Admin — Ligue {leagueCode}</div>

          <div className="mt-6 space-y-2">
            <SideItem active={active === "days"} onClick={() => setActive("days")}>
              Journées
            </SideItem>
            <SideItem active={active === "notify"} onClick={() => setActive("notify")}>
              Notifications
            </SideItem>
            <SideItem active={active === "chat"} onClick={() => setActive("chat")}>
              Messagerie
            </SideItem>
          </div>

          <div className="mt-8 pt-4 border-t space-y-2">
            <div className="text-xs text-slate-500">LEAGUE_CODE</div>
            <input
              className="w-full border rounded-xl p-2 text-sm"
              value={leagueCode}
              onChange={(e) => {
                setLeagueCode(e.target.value);
                localStorage.setItem(LS_ADMIN_LEAGUE, e.target.value);
              }}
            />
            <button className="w-full rounded-xl border px-3 py-2 text-sm" onClick={logout}>
              Déconnexion
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 p-6">
          {active === "days" && <AdminDays leagueCode={leagueCode} headers={headers} />}
          {active === "notify" && <AdminNotify leagueCode={leagueCode} headers={headers} />}
          {active === "chat" && <AdminChat leagueCode={leagueCode} headers={headers} />}
        </div>
      </div>
    </div>
  );
}

function SideItem({ active, onClick, children }) {
  return (
    <button
      className={[
        "w-full text-left rounded-xl px-3 py-2 font-semibold border",
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50",
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function computeDeadlineFromMatches(matches, hoursBefore = 1) {
  const times = (matches || [])
    .map((m) => (m.utcDate ? new Date(m.utcDate).getTime() : null))
    .filter((t) => typeof t === "number" && Number.isFinite(t));
  if (!times.length) return null;
  const first = Math.min(...times);
  return new Date(first - hoursBefore * 60 * 60 * 1000);
}

function sortByDate(matches) {
  return [...(matches || [])].sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
}

function pickDefaultFeatured(matches) {
  const s = sortByDate(matches || []);
  if (!s.length) return "";
  return String(s[s.length - 1].id);
}

/**
 * ADMIN — DAYS
 */
function AdminDays({ leagueCode, headers }) {
  // Published from DB
  const [publishedBusy, setPublishedBusy] = useState(false);
  const [publishedError, setPublishedError] = useState("");
  const [published, setPublished] = useState([]);

  // Other days from Football API
  const [otherBusy, setOtherBusy] = useState(false);
  const [otherError, setOtherError] = useState("");
  const [otherDays, setOtherDays] = useState([]);

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create"); // create | update
  const [editorMatchday, setEditorMatchday] = useState(null);
  const [editorMatches, setEditorMatches] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [featuredId, setFeaturedId] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  const selectedMatchObjects = useMemo(() => {
    const set = new Set(selectedIds.map((x) => Number(x)));
    return (editorMatches || []).filter((m) => set.has(Number(m.id)));
  }, [editorMatches, selectedIds]);

  const deadline = useMemo(() => computeDeadlineFromMatches(selectedMatchObjects, 1), [selectedMatchObjects]);

  // auto featured: si vide, ou si featured plus dans la sélection => default dernier match sélectionné
  useEffect(() => {
    if (!selectedMatchObjects.length) return;
    const ids = new Set(selectedMatchObjects.map((m) => Number(m.id)));
    const current = Number(featuredId);
    if (!featuredId || !ids.has(current)) {
      setFeaturedId(pickDefaultFeatured(selectedMatchObjects));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchObjects]);

  async function loadPublished() {
    setPublishedError("");
    setPublishedBusy(true);
    try {
      const r = await fetch(`/api/admin/days-list?leagueCode=${encodeURIComponent(leagueCode)}`, { headers: headers() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      const list = Array.isArray(data.days) ? data.days : [];
      const pub = list.filter((d) => String(d.status).toUpperCase() === "PUBLISHED");
      setPublished(pub);
    } catch (e) {
      setPublishedError(e?.message || String(e));
    } finally {
      setPublishedBusy(false);
    }
  }

  useEffect(() => {
    loadPublished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueCode]);

  async function loadOtherDays() {
    setOtherError("");
    setOtherBusy(true);
    try {
      const r = await fetch(`/api/admin/football/fl1-upcoming?count=5`, { headers: headers() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setOtherDays(Array.isArray(data.days) ? data.days : []);
    } catch (e) {
      setOtherError(e?.message || String(e));
    } finally {
      setOtherBusy(false);
    }
  }

  function openCreate(matchday, matches) {
    setSaveResult(null);
    setEditorMode("create");
    setEditorMatchday(Number(matchday));
    const sorted = sortByDate(matches || []);
    setEditorMatches(sorted);
    setSelectedIds([]); // admin coche
    setFeaturedId(pickDefaultFeatured(sorted));
    setEditorOpen(true);
  }

  async function openUpdateFromPublished(day) {
    // modale avertissement
    const ok = window.confirm(
      "Modifier une journée publiée va:\n\n- Mettre à jour les matchs / match phare / deadline\n- Supprimer tous les pronostics déjà saisis pour cette journée\n- Envoyer une notification aux joueurs\n\nConfirmer ?"
    );
    if (!ok) return;

    setSaveResult(null);
    setEditorMode("update");
    setEditorMatchday(Number(day.matchday));

    // re-fetch matches of matchday from Football API
    setEditorOpen(true);
    setEditorMatches([]);
    setSelectedIds([]);
    setFeaturedId("");

    try {
      const r = await fetch(`/api/admin/football/fl1-matchday?matchday=${Number(day.matchday)}`, { headers: headers() });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);

      const matches = sortByDate(data.matches || []);
      setEditorMatches(matches);

      // recall selection from DB (selectedMatchIds)
      const recalled = Array.isArray(day.selectedMatchIds) ? day.selectedMatchIds.map((x) => Number(x)) : [];
      setSelectedIds(recalled);

      // recall featured if possible, else default last match
      const fid = day.featured_match_external_id != null ? String(day.featured_match_external_id) : "";
      setFeaturedId(fid || pickDefaultFeatured(matches.filter((m) => recalled.includes(Number(m.id)))));
    } catch (e) {
      setSaveResult({ ok: false, error: e?.message || String(e) });
    }
  }

  function toggle(id) {
    const n = Number(id);
    setSelectedIds((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  async function save() {
    setSaveResult(null);

    if (!editorMatchday || !selectedMatchObjects.length) {
      setSaveResult({ ok: false, error: "Sélectionne au moins 1 match." });
      return;
    }
    if (!deadline) {
      setSaveResult({ ok: false, error: "Impossible de calculer la deadline (dates match manquantes)." });
      return;
    }
    if (!featuredId) {
      setSaveResult({ ok: false, error: "Choisis un match phare." });
      return;
    }

    setSaveBusy(true);
    try {
      const payload = {
        leagueCode,
        matchday: editorMatchday,
        featuredExternalMatchId: Number(featuredId),
        matches: selectedMatchObjects.map((m) => ({
          externalMatchId: Number(m.id),
          utcDate: m.utcDate,
          status: m.status,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
        })),
      };

      const r = await fetch(`/api/admin/days-publish`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      setSaveResult(data);

      if (r.ok && data?.ok) {
        await loadPublished(); // visible sans “recharger”
        setEditorOpen(false);
      }
    } catch (e) {
      setSaveResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-extrabold">Journées</div>
        <div className="text-sm text-slate-600">Publié (BDD) + configuration (Football API).</div>
      </div>

      {/* Published */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-bold">Journées publiées</div>
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={loadPublished} disabled={publishedBusy}>
            {publishedBusy ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>

        {publishedError ? <div className="text-sm text-red-600">{publishedError}</div> : null}

        {published.length === 0 ? (
          <div className="text-sm text-slate-600">Aucune journée publiée.</div>
        ) : (
          <div className="space-y-2">
            {published.map((d) => (
              <div key={d.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-xs text-slate-600">
                    Matchday {d.matchday} — Deadline {d.deadline_at ? new Date(d.deadline_at).toLocaleString("fr-FR") : "—"}
                  </div>
                  <div className="text-xs text-slate-600">
                    Match phare: <span className="font-mono">{d.featured_match_external_id ?? "—"}</span> — Matchs:{" "}
                    <span className="font-mono">{Array.isArray(d.selectedMatchIds) ? d.selectedMatchIds.length : 0}</span>
                  </div>
                </div>
                <button className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold" onClick={() => openUpdateFromPublished(d)}>
                  Modifier
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Other days */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-bold">Charger autres journées</div>
          <button className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold" onClick={loadOtherDays} disabled={otherBusy}>
            {otherBusy ? "Chargement..." : "Charger"}
          </button>
        </div>

        {otherError ? <div className="text-sm text-red-600">{otherError}</div> : null}

        {otherDays.length === 0 ? (
          <div className="text-sm text-slate-600">Clique sur “Charger” pour récupérer les prochaines journées.</div>
        ) : (
          <div className="space-y-2">
            {otherDays.map((d) => (
              <div key={d.matchday} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">Ligue 1 — Journée {d.matchday}</div>
                  <div className="text-xs text-slate-600">{(d.matches || []).length} match(s) disponibles</div>
                </div>
                <button
                  className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => openCreate(d.matchday, d.matches)}
                >
                  Configurer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal (simple) */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold">
                  {editorMode === "update" ? "Modifier" : "Publier"} — Journée {editorMatchday}
                </div>
                <div className="text-sm text-slate-600">
                  Deadline auto = 1h avant le premier match sélectionné. Match phare par défaut = dernier match.
                </div>
              </div>
              <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => setEditorOpen(false)}>
                Fermer
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 bg-slate-50">
                <div className="text-sm font-semibold">Deadline (auto)</div>
                <div className="text-sm mt-1 font-mono">
                  {deadline ? deadline.toLocaleString("fr-FR") : "— (sélectionne des matchs)"}
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-sm font-semibold">Match phare</div>
                <select
                  className="w-full border rounded-xl p-2 mt-2"
                  value={featuredId}
                  onChange={(e) => setFeaturedId(e.target.value)}
                  disabled={!selectedMatchObjects.length}
                >
                  {!selectedMatchObjects.length ? <option value="">Sélectionne d’abord des matchs</option> : null}
                  {selectedMatchObjects.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.homeTeam?.name || "Home"} vs {m.awayTeam?.name || "Away"} — {m.utcDate ? new Date(m.utcDate).toLocaleString("fr-FR") : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Matchs proposés aux paris</div>
              <div className="max-h-[45vh] overflow-auto space-y-2">
                {(editorMatches || []).map((m) => {
                  const mid = Number(m.id);
                  const checked = selectedIds.includes(mid);
                  return (
                    <label key={mid} className="flex items-center gap-3 rounded-xl border p-2">
                      <input type="checkbox" checked={checked} onChange={() => toggle(mid)} />
                      <div className="flex-1">
                        <div className="text-sm">
                          {m.homeTeam?.name || "Home"} <span className="text-slate-400">vs</span> {m.awayTeam?.name || "Away"}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {mid} — {m.utcDate ? new Date(m.utcDate).toLocaleString("fr-FR") : ""} {m.status ? `— ${m.status}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold disabled:opacity-50"
                onClick={save}
                disabled={saveBusy}
              >
                {saveBusy ? "Enregistrement..." : editorMode === "update" ? "Valider modification" : "Publier"}
              </button>
              <button className="rounded-xl border px-4 py-3 font-semibold" onClick={() => setEditorOpen(false)}>
                Annuler
              </button>
            </div>

            {saveResult ? (
              <pre className="text-xs bg-slate-50 border rounded-xl p-3 mt-3 overflow-auto">
                {JSON.stringify(saveResult, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ADMIN — NOTIFY
 */
function AdminNotify({ leagueCode, headers }) {
  const [title, setTitle] = useState("LNJP");
  const [body, setBody] = useState("Attention, pronostics à faire.");
  const [url, setUrl] = useState("/");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-extrabold">Notifications</div>
        <div className="text-sm text-slate-600">Push + Inbox.</div>
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <input className="w-full border rounded-xl p-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
        <textarea className="w-full border rounded-xl p-2" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" />
        <input className="w-full border rounded-xl p-2" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" />

        <button
          className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold disabled:opacity-50"
          disabled={sending}
          onClick={async () => {
            setResult(null);
            setSending(true);
            try {
              const r = await fetch("/api/admin-notify", {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({ leagueCode, title, body, url }),
              });
              const data = await r.json().catch(() => ({}));
              setResult(data);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? "Envoi..." : "Envoyer"}
        </button>

        {result ? (
          <pre className="text-xs bg-slate-50 border rounded-xl p-3 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ADMIN — CHAT
 */
function AdminChat({ leagueCode, headers }) {
  const [message, setMessage] = useState("Salut à tous.");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-extrabold">Messagerie</div>
        <div className="text-sm text-slate-600">Publie un message “Admin” dans le chat.</div>
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <textarea className="w-full border rounded-xl p-2" value={message} onChange={(e) => setMessage(e.target.value)} />

        <button
          className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-semibold disabled:opacity-50"
          disabled={sending || message.trim().length === 0}
          onClick={async () => {
            setResult(null);
            setSending(true);
            try {
              const r = await fetch("/api/admin-chat", {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({ leagueCode, message }),
              });
              const data = await r.json().catch(() => ({}));
              setResult(data);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? "Envoi..." : "Envoyer"}
        </button>

        {result ? (
          <pre className="text-xs bg-slate-50 border rounded-xl p-3 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        ) : null}
      </div>
    </div>
  );
}
