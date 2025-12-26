import { useEffect, useMemo, useRef, useState } from "react";
import NotificationsPanel from "./NotificationsPanel";

/**
 * PlayerHome (MVP)
 * - 3 onglets: Pronostics / Messagerie / Notifications
 * - aucune dépendance à Supabase Auth
 * - Notifications + Chat restent inchangés
 * - Ajout Pronostics:
 *   - charge les days PUBLISHED
 *   - charge matches + predictions
 *   - force complétude
 *   - POST /api/predictions-save
 */
export default function PlayerHome({ displayName, leagueCode, userId, onSignOut }) {
  const initialDayIdFromUrl = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("dayId");
    } catch {
      return null;
    }
  }, []);

  const [activeTab, setActiveTab] = useState(initialDayIdFromUrl ? "pronos" : "chat");

  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

  // ---------- PRONOS state ----------
  const [daysBusy, setDaysBusy] = useState(false);
  const [daysError, setDaysError] = useState("");
  const [days, setDays] = useState([]);

  const [selectedDayId, setSelectedDayId] = useState(initialDayIdFromUrl || "");
  const [dayBusy, setDayBusy] = useState(false);
  const [dayError, setDayError] = useState("");
  const [dayData, setDayData] = useState(null); // {day, matches, predictions}

  // choices: external_match_id -> "1"|"N"|"2"
  const [choices, setChoices] = useState({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // ---------- Polling global léger: chat + inbox unread ----------
  useEffect(() => {
    let alive = true;

    function getChatLastReadAt() {
      try {
        const key = `lnjp_chat_last_read_${leagueCode}`;
        return localStorage.getItem(key) || "1970-01-01T00:00:00.000Z";
      } catch {
        return "1970-01-01T00:00:00.000Z";
      }
    }

    async function poll() {
      try {
        // 1) Unread Chat
        const chatRes = await fetch(`/api/chat-list?leagueCode=${encodeURIComponent(leagueCode)}&limit=80&offset=0`);
        const chatData = await chatRes.json();
        if (alive && chatRes.ok && chatData?.ok) {
          const items = chatData.items || [];
          const lastReadAt = getChatLastReadAt();
          const unread = items.filter((m) => m.createdAt > lastReadAt).length;
          setChatUnread(unread);
        }

        // 2) Unread Inbox (notifications)
        const inboxRes = await fetch(`/api/inbox?userId=${encodeURIComponent(userId)}&limit=50&offset=0`);
        const inboxData = await inboxRes.json();
        if (alive && inboxRes.ok && inboxData?.ok) {
          const items = inboxData.items || [];
          const unread = items.filter((n) => n.readAt === null).length;
          setNotifUnread(unread);
        }
      } catch {
        // silencieux MVP
      }
    }

    poll();
    const id = setInterval(poll, 2500);

    // refresh immédiat quand le SW pousse un message (push reçu)
    const swHandler = (event) => {
      if (event.data?.type === "INBOX_REFRESH") {
        poll();
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", swHandler);

    return () => {
      alive = false;
      clearInterval(id);
      navigator.serviceWorker?.removeEventListener?.("message", swHandler);
    };
  }, [leagueCode, userId]);

  // ---------- Load days list (PUBLISHED) ----------
  useEffect(() => {
    let alive = true;

    async function loadDays() {
      setDaysError("");
      setDaysBusy(true);
      try {
        // Compat: days-list peut renvoyer soit un tableau, soit {ok:true, days:[...]}
        const r = await fetch(`/api/days-list?leagueCode=${encodeURIComponent(leagueCode)}`);
        const data = await r.json();

        let list = [];
        if (Array.isArray(data)) list = data;
        else if (data?.ok && Array.isArray(data.days)) list = data.days;
        else if (Array.isArray(data?.data)) list = data.data;

        // garde uniquement PUBLISHED si la route ne filtre pas
        list = (list || []).filter((d) => String(d.status || "").toUpperCase() === "PUBLISHED");

        // tri matchday
        list.sort((a, b) => Number(a.matchday) - Number(b.matchday));

        if (!alive) return;
        setDays(list);

        // auto-select: si pas de dayId, prendre la dernière
        if (!selectedDayId && list.length) {
          setSelectedDayId(list[list.length - 1].id);
        }
      } catch (e) {
        if (!alive) return;
        setDaysError(e?.message || String(e));
      } finally {
        if (alive) setDaysBusy(false);
      }
    }

    loadDays();
  }, [leagueCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Load selected day details (matches + predictions) ----------
  useEffect(() => {
    let alive = true;

    async function loadDay() {
      setDayError("");
      setSaveResult(null);

      if (!selectedDayId) {
        setDayData(null);
        setChoices({});
        return;
      }

      setDayBusy(true);
      try {
        const r = await fetch(
          `/api/days-get?dayId=${encodeURIComponent(selectedDayId)}&userId=${encodeURIComponent(userId)}`
        );
        const data = await r.json();

        if (!alive) return;
        setDayData(data);

        // init choices from existing predictions
        const next = {};
        const preds = Array.isArray(data?.predictions) ? data.predictions : [];
        for (const p of preds) {
          const k = Number(p.external_match_id);
          const v = String(p.prediction || "").toUpperCase();
          if (Number.isFinite(k) && ["1", "N", "2"].includes(v)) next[k] = v;
        }
        setChoices(next);

        // keep URL in sync for push deep-linking
        try {
          const u = new URL(window.location.href);
          u.searchParams.set("dayId", selectedDayId);
          window.history.replaceState({}, "", u.toString());
        } catch {
          // ignore
        }
      } catch (e) {
        if (!alive) return;
        setDayError(e?.message || String(e));
        setDayData(null);
        setChoices({});
      } finally {
        if (alive) setDayBusy(false);
      }
    }

    loadDay();
  }, [selectedDayId, userId]);

  const matches = useMemo(() => {
    const list = Array.isArray(dayData?.matches) ? dayData.matches : [];
    // tri stable : featured en haut, puis date, puis id
    return [...list].sort((a, b) => {
      const af = a.is_featured ? 1 : 0;
      const bf = b.is_featured ? 1 : 0;
      if (af !== bf) return bf - af;
      const ad = a.utc_date ? new Date(a.utc_date).getTime() : 0;
      const bd = b.utc_date ? new Date(b.utc_date).getTime() : 0;
      if (ad !== bd) return ad - bd;
      return Number(a.external_match_id) - Number(b.external_match_id);
    });
  }, [dayData]);

  const isComplete = useMemo(() => {
    if (!matches.length) return false;
    return matches.every((m) => {
      const id = Number(m.external_match_id);
      return ["1", "N", "2"].includes(choices[id]);
    });
  }, [matches, choices]);

  function setChoice(externalMatchId, v) {
    setChoices((prev) => ({ ...prev, [Number(externalMatchId)]: v }));
  }

  async function savePredictions() {
    setSaveResult(null);
    setDayError("");

    if (!selectedDayId) {
      setSaveResult({ ok: false, error: "Aucune journée sélectionnée." });
      return;
    }
    if (!matches.length) {
      setSaveResult({ ok: false, error: "Cette journée ne contient aucun match." });
      return;
    }
    if (!isComplete) {
      setSaveResult({ ok: false, error: "Tu dois choisir 1 / N / 2 pour tous les matchs." });
      return;
    }

    setSaveBusy(true);
    try {
      const payload = {
        leagueCode,
        dayId: selectedDayId,
        userId,
        predictions: matches.map((m) => ({
          externalMatchId: Number(m.external_match_id),
          prediction: choices[Number(m.external_match_id)],
        })),
      };

      const r = await fetch("/api/predictions-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));
      setSaveResult(data);

      if (r.ok && data?.ok) {
        // reload day to reflect saved predictions
        const rr = await fetch(
          `/api/days-get?dayId=${encodeURIComponent(selectedDayId)}&userId=${encodeURIComponent(userId)}`
        );
        const dd = await rr.json();
        setDayData(dd);
      }
    } catch (e) {
      setSaveResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setSaveBusy(false);
    }
  }

  const dayMeta = useMemo(() => {
    const d = dayData?.day || null;
    if (!d) return null;
    const deadline = d.deadline_at ? new Date(d.deadline_at) : null;
    return {
      title: d.title || `Journée ${d.matchday || ""}`,
      matchday: d.matchday,
      deadlineLabel: deadline ? deadline.toLocaleString("fr-FR") : "",
      status: d.status,
    };
  }, [dayData]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold">LNJP</div>
            <div className="text-sm text-slate-600">
              {displayName} — Ligue <span className="font-semibold">{leagueCode}</span>
            </div>
          </div>
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={onSignOut}>
            Quitter
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "pronos"} onClick={() => setActiveTab("pronos")}>
            Pronostics
          </TabButton>

          <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")} badge={chatUnread}>
            Messagerie
          </TabButton>

          <TabButton active={activeTab === "notif"} onClick={() => setActiveTab("notif")} badge={notifUnread}>
            Notifications
          </TabButton>
        </div>

        {/* Content */}
        <div className="mt-4">
          {activeTab === "pronos" && (
            <div className="space-y-4">
              {/* Day selector */}
              <div className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-bold">Pronostics</div>
                    <div className="text-sm text-slate-600">
                      Choisis une journée publiée, puis 1 / N / 2 pour chaque match.
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-semibold mb-1">Journée</div>
                    <select
                      className="w-full border rounded-xl p-2"
                      value={selectedDayId}
                      onChange={(e) => setSelectedDayId(e.target.value)}
                      disabled={daysBusy}
                    >
                      <option value="">{daysBusy ? "Chargement..." : "Sélectionne une journée"}</option>
                      {days.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} — deadline {d.deadline_at ? new Date(d.deadline_at).toLocaleString("fr-FR") : "?"}
                        </option>
                      ))}
                    </select>
                    {daysError ? <div className="text-sm text-red-600 mt-2">{daysError}</div> : null}
                    {!daysBusy && !daysError && days.length === 0 ? (
                      <div className="text-sm text-slate-600 mt-2">
                        Aucune journée publiée pour l’instant (demande à l’Admin de publier).
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-1">Statut</div>
                    <div className="rounded-xl bg-slate-50 border p-3 text-sm">
                      {dayBusy ? (
                        <div>Chargement de la journée…</div>
                      ) : dayMeta ? (
                        <div className="space-y-1">
                          <div>
                            <span className="font-semibold">{dayMeta.title}</span>
                          </div>
                          <div className="text-slate-700">
                            Statut: <span className="font-semibold">{dayMeta.status}</span>
                          </div>
                          <div className="text-slate-700">
                            Deadline: <span className="font-semibold">{dayMeta.deadlineLabel || "—"}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-600">Sélectionne une journée.</div>
                      )}
                    </div>
                  </div>
                </div>

                {dayError ? <div className="text-sm text-red-600 mt-3">{dayError}</div> : null}
              </div>

              {/* Matches */}
              {selectedDayId ? (
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-bold">Matchs</div>
                      <div className="text-sm text-slate-600">
                        {matches.length ? `${matches.length} match(s)` : "Aucun match"}
                      </div>
                    </div>

                    <button
                      className="rounded-xl bg-slate-900 text-white px-4 py-2 font-semibold disabled:opacity-50"
                      onClick={savePredictions}
                      disabled={saveBusy || dayBusy || !matches.length || !isComplete}
                      title={!isComplete ? "Complète tous les matchs (1/N/2)" : "Valider mes pronos"}
                    >
                      {saveBusy ? "Validation..." : "Valider"}
                    </button>
                  </div>

                  {!matches.length && !dayBusy ? (
                    <div className="text-sm text-slate-600 mt-3">
                      Cette journée n’a pas de matchs en base (problème côté publish).
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {matches.map((m) => {
                      const id = Number(m.external_match_id);
                      const home = m.home_team_name || "Home";
                      const away = m.away_team_name || "Away";
                      const when = m.utc_date ? new Date(m.utc_date).toLocaleString("fr-FR") : "";
                      const featured = !!m.is_featured;
                      const v = choices[id] || "";

                      return (
                        <div
                          key={id}
                          className={`rounded-2xl border p-3 ${featured ? "bg-amber-50 border-amber-200" : "bg-white"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">
                                {featured ? "★ " : ""}
                                {home} <span className="text-slate-400">vs</span> {away}
                              </div>
                              <div className="text-xs text-slate-600">
                                ID match {id}
                                {when ? ` — ${when}` : ""}
                                {m.status ? ` — ${m.status}` : ""}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <PickButton active={v === "1"} onClick={() => setChoice(id, "1")}>
                                1
                              </PickButton>
                              <PickButton active={v === "N"} onClick={() => setChoice(id, "N")}>
                                N
                              </PickButton>
                              <PickButton active={v === "2"} onClick={() => setChoice(id, "2")}>
                                2
                              </PickButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    {!isComplete && matches.length ? (
                      <div className="text-sm text-slate-700">
                        Il manque des choix. Complète tous les matchs pour activer “Valider”.
                      </div>
                    ) : null}

                    {saveResult ? (
                      <div className={`text-sm mt-2 ${saveResult.ok ? "text-green-700" : "text-red-700"}`}>
                        {saveResult.ok
                          ? `OK — ${saveResult.saved || 0} prono(s) enregistré(s).`
                          : `Erreur — ${saveResult.error || "Impossible d’enregistrer."}`}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === "chat" && (
            <ChatRoom
              leagueCode={leagueCode}
              userId={userId}
              displayName={displayName}
              onUnreadCountChange={setChatUnread}
            />
          )}

          {activeTab === "notif" && <NotificationsPanel userId={userId} />}
        </div>
      </div>
    </div>
  );
}

/* =========================
   UI helpers
========================= */

function TabButton({ active, onClick, badge, children }) {
  return (
    <button
      className={[
        "relative rounded-xl px-4 py-2 text-sm font-semibold border",
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900 hover:bg-slate-50",
      ].join(" ")}
      onClick={onClick}
    >
      {children}
      {badge ? (
        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-xs px-2">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function PickButton({ active, onClick, children }) {
  return (
    <button
      className={[
        "w-10 h-10 rounded-xl border font-extrabold",
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* =========================
   CHAT (salon unique)
   - API server
   - Unread basé sur lastReadAt localStorage
========================= */

function ChatRoom({ leagueCode, userId, displayName, onUnreadCountChange }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const bottomRef = useRef(null);

  const lastReadKey = useMemo(() => `lnjp_chat_last_read_${leagueCode}`, [leagueCode]);

  const scrollToBottom = (smooth = true) =>
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });

  function getLastReadAt() {
    return localStorage.getItem(lastReadKey) || "1970-01-01T00:00:00.000Z";
  }

  function markReadNow() {
    localStorage.setItem(lastReadKey, new Date().toISOString());
  }

  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/chat-list?leagueCode=${encodeURIComponent(leagueCode)}&limit=120&offset=0`);
      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Chat load failed");
      const items = data.items || [];
      setMessages(items);

      // compute unread
      const lastReadAt = getLastReadAt();
      const unread = items.filter((m) => m.createdAt > lastReadAt).length;
      onUnreadCountChange?.(unread);

      // mark as read when chat tab is open (MVP)
      markReadNow();
      onUnreadCountChange?.(0);

      setTimeout(() => scrollToBottom(false), 0);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const v = text.trim();
    if (!v) return;

    setError("");
    setText("");

    try {
      const r = await fetch("/api/chat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueCode, userId, displayName, message: v }),
      });

      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Send failed");
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueCode]);

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold">Messagerie</div>
          <div className="text-sm text-slate-600">Salon unique de la ligue</div>
        </div>
        <button className="rounded-xl border px-3 py-2 text-sm" onClick={load} disabled={busy}>
          Rafraîchir
        </button>
      </div>

      {error ? <div className="text-sm text-red-600 mt-3">{error}</div> : null}

      <div className="mt-4 h-[45vh] overflow-auto border rounded-2xl p-3 bg-slate-50">
        {busy ? (
          <div className="text-sm text-slate-600">Chargement…</div>
        ) : messages.length ? (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{m.displayName || m.userId}</span> —{" "}
                  {m.createdAt ? new Date(m.createdAt).toLocaleString("fr-FR") : ""}
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="text-sm text-slate-600">Aucun message.</div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex gap-2">
          <textarea
            className="flex-1 border rounded-2xl p-3 h-14 resize-none"
            placeholder="Ton message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            className="rounded-xl bg-slate-900 text-white px-4 font-semibold disabled:opacity-50"
            onClick={send}
            disabled={text.trim().length === 0}
          >
            Envoyer
          </button>
        </div>
        <div className="text-xs text-slate-500 mt-2">Entrée pour envoyer. (Shift+Entrée pour sauter une ligne)</div>
      </div>
    </div>
  );
}
