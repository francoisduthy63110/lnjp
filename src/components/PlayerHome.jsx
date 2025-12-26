import { useEffect, useMemo, useRef, useState } from "react";
import NotificationsPanel from "./NotificationsPanel";

export default function PlayerHome({ displayName, leagueCode, userId, onSignOut }) {
  const [active, setActive] = useState("days"); // days | chat | notif

  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

  // days overview
  const [daysBusy, setDaysBusy] = useState(false);
  const [daysError, setDaysError] = useState("");
  const [days, setDays] = useState([]);

  const [selectedDayId, setSelectedDayId] = useState("");
  const [dayBusy, setDayBusy] = useState(false);
  const [dayError, setDayError] = useState("");
  const [dayData, setDayData] = useState(null);

  const [editing, setEditing] = useState(false);
  const [choices, setChoices] = useState({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // deep link dayId
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const dayId = u.searchParams.get("dayId");
      if (dayId) {
        setActive("days");
        setSelectedDayId(dayId);
      }
    } catch {
      // ignore
    }
  }, []);

  // polling unread badges (chat + inbox) — conserve la feature notifications
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
        const chatRes = await fetch(`/api/chat-list?leagueCode=${encodeURIComponent(leagueCode)}&limit=80&offset=0`);
        const chatData = await chatRes.json();
        if (alive && chatRes.ok && chatData?.ok) {
          const items = chatData.items || [];
          const lastReadAt = getChatLastReadAt();
          const unread = items.filter((m) => m.createdAt > lastReadAt).length;
          setChatUnread(unread);
        }

        const inboxRes = await fetch(`/api/inbox?userId=${encodeURIComponent(userId)}&limit=50&offset=0`);
        const inboxData = await inboxRes.json();
        if (alive && inboxRes.ok && inboxData?.ok) {
          const items = inboxData.items || [];
          const unread = items.filter((n) => n.readAt === null).length;
          setNotifUnread(unread);
        }
      } catch {
        // silent
      }
    }

    poll();
    const id = setInterval(poll, 2500);

    const swHandler = (event) => {
      if (event.data?.type === "INBOX_REFRESH") poll();
    };
    navigator.serviceWorker?.addEventListener?.("message", swHandler);

    return () => {
      alive = false;
      clearInterval(id);
      navigator.serviceWorker?.removeEventListener?.("message", swHandler);
    };
  }, [leagueCode, userId]);

  async function loadDays() {
    setDaysError("");
    setDaysBusy(true);
    try {
      const r = await fetch(
        `/api/days-overview?leagueCode=${encodeURIComponent(leagueCode)}&userId=${encodeURIComponent(userId)}`
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setDays(Array.isArray(data.days) ? data.days : []);
    } catch (e) {
      setDaysError(e?.message || String(e));
    } finally {
      setDaysBusy(false);
    }
  }

  useEffect(() => {
    loadDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueCode, userId]);

  async function loadDay(dayId) {
    setDayError("");
    setSaveResult(null);
    setDayBusy(true);
    try {
      const r = await fetch(`/api/days-get?dayId=${encodeURIComponent(dayId)}&userId=${encodeURIComponent(userId)}`);
      const data = await r.json().catch(() => ({}));
      setDayData(data);

      // init choices from predictions
      const next = {};
      for (const p of data?.predictions || []) {
        const id = Number(p.external_match_id);
        const v = String(p.prediction || "").toUpperCase();
        if (Number.isFinite(id) && ["1", "N", "2"].includes(v)) next[id] = v;
      }
      setChoices(next);

      // update URL
      try {
        const u = new URL(window.location.href);
        u.searchParams.set("dayId", dayId);
        window.history.replaceState({}, "", u.toString());
      } catch {
        // ignore
      }
    } catch (e) {
      setDayError(e?.message || String(e));
      setDayData(null);
      setChoices({});
    } finally {
      setDayBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedDayId) return;
    loadDay(selectedDayId);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId]);

  const matches = useMemo(() => {
    const list = Array.isArray(dayData?.matches) ? dayData.matches : [];
    return [...list].sort((a, b) => new Date(a.utc_date).getTime() - new Date(b.utc_date).getTime());
  }, [dayData]);

  const isComplete = useMemo(() => {
    if (!matches.length) return false;
    return matches.every((m) => ["1", "N", "2"].includes(choices[Number(m.external_match_id)]));
  }, [matches, choices]);

  const dayIsAlreadyComplete = useMemo(() => {
    const d = days.find((x) => x.id === selectedDayId);
    return !!d?.complete;
  }, [days, selectedDayId]);

  function setChoice(externalMatchId, v) {
    setChoices((prev) => ({ ...prev, [Number(externalMatchId)]: v }));
  }

  async function savePredictions() {
    setSaveResult(null);
    if (!selectedDayId) return;

    if (!matches.length) {
      setSaveResult({ ok: false, error: "Aucun match sur cette journée." });
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
        await loadDays(); // recatégorise (à faire / faite)
        await loadDay(selectedDayId);
        setEditing(false);
      }
    } catch (e) {
      setSaveResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setSaveBusy(false);
    }
  }

  const toPredict = days.filter((d) => !d.complete);
  const predicted = days.filter((d) => d.complete);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 border-r min-h-screen p-4">
          <div className="text-2xl font-extrabold">LNJP</div>
          <div className="text-xs text-slate-600 mt-1">
            {displayName} — Ligue {leagueCode}
          </div>

          <div className="mt-6 space-y-2">
            <SideItem active={active === "days"} onClick={() => setActive("days")}>
              Journées
            </SideItem>
            <SideItem active={active === "chat"} onClick={() => setActive("chat")} badge={chatUnread}>
              Messagerie
            </SideItem>
            <SideItem active={active === "notif"} onClick={() => setActive("notif")} badge={notifUnread}>
              Notifications
            </SideItem>
          </div>

          <div className="mt-8 pt-4 border-t">
            <button className="w-full rounded-xl border px-3 py-2 text-sm" onClick={onSignOut}>
              Quitter
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 p-6">
          {active === "days" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-extrabold">Journées</div>
                  <div className="text-sm text-slate-600">À pronostiquer / pronostiquées.</div>
                </div>
                <button className="rounded-xl border px-3 py-2 text-sm" onClick={loadDays} disabled={daysBusy}>
                  {daysBusy ? "Chargement..." : "Rafraîchir"}
                </button>
              </div>

              {daysError ? <div className="text-sm text-red-600">{daysError}</div> : null}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border p-4">
                  <div className="font-bold">À pronostiquer</div>
                  <div className="mt-3 space-y-2">
                    {toPredict.length === 0 ? (
                      <div className="text-sm text-slate-600">Rien à faire.</div>
                    ) : (
                      toPredict.map((d) => (
                        <DayRow key={d.id} d={d} active={d.id === selectedDayId} onClick={() => setSelectedDayId(d.id)} />
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="font-bold">Pronostiquées</div>
                  <div className="mt-3 space-y-2">
                    {predicted.length === 0 ? (
                      <div className="text-sm text-slate-600">Aucune journée terminée.</div>
                    ) : (
                      predicted.map((d) => (
                        <DayRow key={d.id} d={d} active={d.id === selectedDayId} onClick={() => setSelectedDayId(d.id)} />
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Day details */}
              {selectedDayId ? (
                <div className="rounded-2xl border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">{dayData?.day?.title || "Journée"}</div>
                      <div className="text-sm text-slate-600">
                        Deadline{" "}
                        {dayData?.day?.deadline_at ? new Date(dayData.day.deadline_at).toLocaleString("fr-FR") : "—"}
                      </div>
                    </div>

                    {dayIsAlreadyComplete && !editing ? (
                      <button className="rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => setEditing(true)}>
                        Modifier mes pronos
                      </button>
                    ) : (
                      <button
                        className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        onClick={savePredictions}
                        disabled={saveBusy || dayBusy || !isComplete}
                        title={!isComplete ? "Complète tous les matchs" : "Valider"}
                      >
                        {saveBusy ? "Validation..." : "Valider"}
                      </button>
                    )}
                  </div>

                  {dayError ? <div className="text-sm text-red-600">{dayError}</div> : null}

                  <div className="space-y-2">
                    {matches.map((m) => {
                      const id = Number(m.external_match_id);
                      const v = choices[id] || "";
                      const home = m.home_team_name || "Home";
                      const away = m.away_team_name || "Away";
                      const when = m.utc_date ? new Date(m.utc_date).toLocaleString("fr-FR") : "";

                      const readOnly = dayIsAlreadyComplete && !editing;

                      return (
                        <div key={id} className="rounded-2xl border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">
                                {home} <span className="text-slate-400">vs</span> {away}
                              </div>
                              <div className="text-xs text-slate-500">{when}</div>
                            </div>

                            {readOnly ? (
                              <div className="text-sm font-bold rounded-xl border px-4 py-2 bg-slate-50">
                                Prono: {v || "—"}
                              </div>
                            ) : (
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
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!isComplete && (!dayIsAlreadyComplete || editing) ? (
                    <div className="text-sm text-slate-700">Il manque des choix pour valider.</div>
                  ) : null}

                  {saveResult ? (
                    <div className={`text-sm ${saveResult.ok ? "text-green-700" : "text-red-700"}`}>
                      {saveResult.ok ? `OK — ${saveResult.saved || 0} prono(s) enregistré(s).` : `Erreur — ${saveResult.error || "Impossible."}`}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {active === "chat" && <ChatRoom leagueCode={leagueCode} userId={userId} displayName={displayName} onUnreadCountChange={setChatUnread} />}

          {active === "notif" && <NotificationsPanel userId={userId} />}
        </div>
      </div>
    </div>
  );
}

function SideItem({ active, onClick, badge, children }) {
  return (
    <button
      className={[
        "w-full text-left rounded-xl px-3 py-2 font-semibold border",
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50",
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

function DayRow({ d, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border p-3",
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="font-semibold">{d.title}</div>
      <div className="text-xs opacity-80">
        Matchday {d.matchday} — {d.predCount}/{d.matchCount}
      </div>
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

/**
 * Chat UI (API server)
 */
function ChatRoom({ leagueCode, userId, displayName, onUnreadCountChange }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const lastReadKey = useMemo(() => `lnjp_chat_last_read_${leagueCode}`, [leagueCode]);
  const scrollToBottom = (smooth = true) => bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });

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

      const lastReadAt = getLastReadAt();
      const unread = items.filter((m) => m.createdAt > lastReadAt).length;
      onUnreadCountChange?.(unread);

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

      <div className="mt-4 h-[55vh] overflow-auto border rounded-2xl p-3 bg-slate-50">
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
