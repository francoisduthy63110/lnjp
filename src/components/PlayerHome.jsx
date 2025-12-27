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
    // Le fond global est géré par index.css (body). Ici, on évite bg-white.
    <div className="min-h-screen">
      <div className="flex min-h-screen gap-4 p-4">
        {/* Sidebar */}
        <div className="w-72 shrink-0 lnjp-surface rounded-3xl p-4">
          <div className="text-2xl font-extrabold tracking-tight">LNJP</div>
          <div className="text-xs lnjp-muted mt-1">
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

          <div className="mt-8 pt-4 border-t border-white/10">
            <button
              className="w-full rounded-2xl px-3 py-2 text-sm lnjp-chip text-[var(--lnjp-text)] hover:bg-white/10"
              onClick={onSignOut}
            >
              Quitter
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1">
          {active === "days" && (
            <div className="space-y-4">
              <div className="lnjp-surface rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-extrabold tracking-tight">Journées</div>
                    <div className="text-sm lnjp-muted">À pronostiquer / pronostiquées.</div>
                  </div>

                  <button
                    className="rounded-2xl px-3 py-2 text-sm lnjp-chip text-[var(--lnjp-text)] hover:bg-white/10 disabled:opacity-60"
                    onClick={loadDays}
                    disabled={daysBusy}
                  >
                    {daysBusy ? "Chargement..." : "Rafraîchir"}
                  </button>
                </div>

                {daysError ? (
                  <div className="text-sm mt-3" style={{ color: "var(--lnjp-red)" }}>
                    {daysError}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="lnjp-surface rounded-3xl p-4">
                  <div className="font-bold">À pronostiquer</div>
                  <div className="mt-3 space-y-2">
                    {toPredict.length === 0 ? (
                      <div className="text-sm lnjp-muted">Rien à faire.</div>
                    ) : (
                      toPredict.map((d) => (
                        <DayRow key={d.id} d={d} active={d.id === selectedDayId} onClick={() => setSelectedDayId(d.id)} />
                      ))
                    )}
                  </div>
                </div>

                <div className="lnjp-surface rounded-3xl p-4">
                  <div className="font-bold">Pronostiquées</div>
                  <div className="mt-3 space-y-2">
                    {predicted.length === 0 ? (
                      <div className="text-sm lnjp-muted">Aucune journée terminée.</div>
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
                <div className="lnjp-surface rounded-3xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">{dayData?.day?.title || "Journée"}</div>
                      <div className="text-sm lnjp-muted">
                        Deadline{" "}
                        {dayData?.day?.deadline_at ? new Date(dayData.day.deadline_at).toLocaleString("fr-FR") : "—"}
                      </div>
                    </div>

                    {dayIsAlreadyComplete && !editing ? (
                      <button
                        className="rounded-2xl px-3 py-2 text-sm font-semibold lnjp-chip text-[var(--lnjp-text)] hover:bg-white/10"
                        onClick={() => setEditing(true)}
                      >
                        Modifier mes pronos
                      </button>
                    ) : (
                      <button
                        className="rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{
                          background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06))",
                          border: "1px solid rgba(255,255,255,.16)",
                          boxShadow: "0 12px 28px rgba(0,0,0,.35)",
                          color: "var(--lnjp-text)",
                        }}
                        onClick={savePredictions}
                        disabled={saveBusy || dayBusy || !isComplete}
                        title={!isComplete ? "Complète tous les matchs" : "Valider"}
                      >
                        {saveBusy ? "Validation..." : "Valider"}
                      </button>
                    )}
                  </div>

                  {dayError ? (
                    <div className="text-sm" style={{ color: "var(--lnjp-red)" }}>
                      {dayError}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {matches.map((m) => {
                      const id = Number(m.external_match_id);
                      const v = choices[id] || "";
                      const home = m.home_team_name || "Home";
                      const away = m.away_team_name || "Away";
                      const when = m.utc_date ? new Date(m.utc_date).toLocaleString("fr-FR") : "";

                      const readOnly = dayIsAlreadyComplete && !editing;

                      return (
                        <div key={id} className="rounded-3xl lnjp-chip p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">
                                {home} <span className="opacity-70">vs</span> {away}
                              </div>
                              <div className="text-xs lnjp-muted">{when}</div>
                            </div>

                            {readOnly ? (
                              <div className="text-sm font-bold rounded-2xl lnjp-chip px-4 py-2">
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
                    <div className="text-sm lnjp-muted">Il manque des choix pour valider.</div>
                  ) : null}

                  {saveResult ? (
                    <div className="text-sm" style={{ color: saveResult.ok ? "rgba(140, 230, 170, .95)" : "var(--lnjp-red)" }}>
                      {saveResult.ok
                        ? `OK — ${saveResult.saved || 0} prono(s) enregistré(s).`
                        : `Erreur — ${saveResult.error || "Impossible."}`}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {active === "chat" && (
            <ChatRoom leagueCode={leagueCode} userId={userId} displayName={displayName} onUnreadCountChange={setChatUnread} />
          )}

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
        "w-full text-left rounded-2xl px-3 py-2 font-semibold",
        active ? "lnjp-chip bg-white/12 border border-white/20" : "lnjp-chip border border-white/10 hover:bg-white/10",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="text-[var(--lnjp-text)]">{children}</span>
      {badge ? (
        <span
          className="ml-2 inline-flex items-center justify-center rounded-full text-white text-xs px-2"
          style={{ background: "var(--lnjp-red)" }}
        >
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
        "w-full text-left rounded-2xl px-3 py-3 border",
        active ? "bg-white/12 border-white/20" : "bg-white/5 border-white/10 hover:bg-white/8",
      ].join(" ")}
    >
      <div className="font-semibold text-[var(--lnjp-text)]">{d.title}</div>
      <div className="text-xs lnjp-muted">
        Matchday {d.matchday} — {d.predCount}/{d.matchCount}
      </div>
    </button>
  );
}

function PickButton({ active, onClick, children }) {
  return (
    <button
      className={[
        "w-10 h-10 rounded-2xl border font-extrabold",
        active ? "bg-white/18 border-white/25 text-[var(--lnjp-text)]" : "bg-white/6 border-white/12 text-[var(--lnjp-text)] hover:bg-white/10",
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
    <div className="lnjp-surface rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold">Messagerie</div>
          <div className="text-sm lnjp-muted">Salon unique de la ligue</div>
        </div>
        <button
          className="rounded-2xl px-3 py-2 text-sm lnjp-chip text-[var(--lnjp-text)] hover:bg-white/10 disabled:opacity-60"
          onClick={load}
          disabled={busy}
        >
          Rafraîchir
        </button>
      </div>

      {error ? (
        <div className="text-sm mt-3" style={{ color: "var(--lnjp-red)" }}>
          {error}
        </div>
      ) : null}

      <div className="mt-4 h-[55vh] overflow-auto rounded-3xl lnjp-chip p-3">
        {busy ? (
          <div className="text-sm lnjp-muted">Chargement…</div>
        ) : messages.length ? (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <div className="text-xs lnjp-muted">
                  <span className="font-semibold text-[var(--lnjp-text)]">{m.displayName || m.userId}</span> —{" "}
                  {m.createdAt ? new Date(m.createdAt).toLocaleString("fr-FR") : ""}
                </div>
                <div className="whitespace-pre-wrap text-[var(--lnjp-text)]">{m.content}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="text-sm lnjp-muted">Aucun message.</div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex gap-2">
          <textarea
            className="flex-1 rounded-3xl px-4 py-3 h-14 resize-none outline-none lnjp-chip text-[var(--lnjp-text)] placeholder:text-[rgba(233,238,246,.55)]"
            placeholder="Ton message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            className="rounded-2xl px-4 font-semibold disabled:opacity-50"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06))",
              border: "1px solid rgba(255,255,255,.16)",
              boxShadow: "0 12px 28px rgba(0,0,0,.35)",
              color: "var(--lnjp-text)",
            }}
            onClick={send}
            disabled={text.trim().length === 0}
          >
            Envoyer
          </button>
        </div>
        <div className="text-xs lnjp-muted mt-2">Entrée pour envoyer. (Shift+Entrée pour sauter une ligne)</div>
      </div>
    </div>
  );
}
