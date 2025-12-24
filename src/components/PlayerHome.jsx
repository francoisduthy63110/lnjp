import { useEffect, useMemo, useRef, useState } from "react";
import NotificationsPanel from "./NotificationsPanel";

/**
 * PlayerHome (MVP)
 * - 2 onglets: Messagerie / Notifications
 * - aucune dépendance à Supabase Auth
 * - Messagerie via API server (/api/chat-*)
 *
 * Fix MVP demandé :
 * - badges "temps réel" même quand l’onglet n’est pas actif
 *   => polling global léger (chat + inbox)
 */
export default function PlayerHome({ displayName, leagueCode, userId, onSignOut }) {
  const [activeTab, setActiveTab] = useState("chat");
  const [notifUnread, setNotifUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  const meLabel = useMemo(() => `${displayName} — Ligue ${leagueCode}`, [displayName, leagueCode]);

  // Keys de "read" (MVP) : stockées en local (pas par user côté serveur)
  const chatLastReadKey = useMemo(() => `lnjp_chat_last_read_${leagueCode}`, [leagueCode]);

  const getChatLastReadAt = () =>
    localStorage.getItem(chatLastReadKey) || "1970-01-01T00:00:00.000Z";

  // Polling global: update badges même si onglet non monté
  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        // 1) Unread Chat
        const chatRes = await fetch(`/api/chat-list?leagueCode=${encodeURIComponent(leagueCode)}`);
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

    // tick initial + interval
    poll();
    const id = setInterval(poll, 2500);

    // refresh immédiat quand le SW pousse un message (push reçu)
    const swHandler = (event) => {
      if (event.data?.type === "INBOX_REFRESH") {
        poll();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", swHandler);
    }

    return () => {
      alive = false;
      clearInterval(id);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", swHandler);
      }
    };
  }, [leagueCode, userId, chatLastReadKey]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">LNJP</div>
            <div className="text-sm text-slate-600 truncate max-w-[65vw]">{meLabel}</div>
          </div>

          <button className="text-sm underline text-slate-600" onClick={onSignOut}>
            Quitter
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TabButton
            label="Messagerie"
            active={activeTab === "chat"}
            onClick={() => setActiveTab("chat")}
            badge={activeTab === "chat" ? 0 : chatUnread}
          />
          <TabButton
            label="Notifications"
            active={activeTab === "notifs"}
            onClick={() => setActiveTab("notifs")}
            badge={activeTab === "notifs" ? 0 : notifUnread}
          />
        </div>

        {activeTab === "chat" ? (
          <ChatRoom
            leagueCode={leagueCode}
            userId={userId}
            displayName={displayName}
            onUnreadCountChange={(n) => setChatUnread(n)}
          />
        ) : (
          <NotificationsPanel onUnreadCountChange={(n) => setNotifUnread(n)} />
        )}
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={[
        "py-3 rounded-xl font-semibold border",
        active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900",
      ].join(" ")}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {label}
        {badge > 0 ? (
          <span className="text-xs bg-red-600 text-white rounded-full px-2 py-0.5">
            {badge}
          </span>
        ) : null}
      </span>
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
    onUnreadCountChange?.(0);
  }

  function computeUnread(list) {
    const lastReadAt = getLastReadAt();
    const n = (list || []).filter((m) => m.createdAt > lastReadAt).length;
    return n;
  }

  async function load() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/chat-list?leagueCode=${encodeURIComponent(leagueCode)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Erreur chargement chat.");

      setMessages(data.items || []);

      // Si la conversation est ouverte, on marque lu
      markReadNow();
      setTimeout(() => scrollToBottom(false), 20);
    } catch (e) {
      setError(e?.message ?? "Erreur chat.");
    } finally {
      setBusy(false);
    }
  }

  // Chargement initial + polling (MVP)
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const res = await fetch(`/api/chat-list?leagueCode=${encodeURIComponent(leagueCode)}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok || !data?.ok) return;

        const next = data.items || [];
        setMessages(next);

        const unread = computeUnread(next);
        onUnreadCountChange?.(unread);
      } catch {
        // silencieux MVP
      }
    };

    // première charge “propre”
    load();

    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueCode]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setError("");
    try {
      const res = await fetch("/api/chat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueCode,
          userId,
          displayName,
          content: trimmed,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Impossible d’envoyer.");

      setText("");

      // refresh
      await load();
      setTimeout(() => scrollToBottom(true), 20);
    } catch (e) {
      setError(e?.message ?? "Impossible d’envoyer le message.");
    }
  }

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 border-b">
        <div className="font-bold">Messagerie</div>
        <div className="text-sm text-slate-600">Salon unique de la ligue</div>
      </div>

      <div className="h-[55vh] overflow-auto p-4 space-y-3 bg-slate-50" onClick={markReadNow}>
        {busy ? <div className="text-sm text-slate-600">Chargement…</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {messages.map((m) => {
          const name = m.displayName || "…";
          const isMe = m.userId === userId;
          const time = m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";

          return (
            <div key={m.id} className={["max-w-[85%]", isMe ? "ml-auto text-right" : ""].join(" ")}>
              <div className="text-xs text-slate-600 mb-1">
                <span className="font-semibold text-slate-900">{name}</span>{" "}
                <span className="text-slate-500">{time}</span>
              </div>
              <div className="inline-block rounded-2xl px-4 py-2 border bg-white">
                <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t bg-white">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl p-3"
            placeholder="Écrire un message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
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
