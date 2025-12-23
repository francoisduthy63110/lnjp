import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import NotificationsPanel from "./NotificationsPanel";

/**
 * PlayerHome : UX friendly avec 2 onglets
 * - Messagerie (salon unique par ligue) + badge unread
 * - Notifications (socle inchangé extrait) + badge unread
 */
export default function PlayerHome({ profile, onSignOut }) {
  const [activeTab, setActiveTab] = useState("chat");
  const [notifUnread, setNotifUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  const meLabel = useMemo(() => {
    if (!profile?.display_name) return "";
    return `${profile.display_name}${profile.role === "admin" ? " (Admin)" : ""}`;
  }, [profile]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">LNJP</div>
            <div className="text-sm text-slate-600 truncate max-w-[65vw]">{meLabel}</div>
          </div>

          <button className="text-sm underline text-slate-600" onClick={onSignOut}>
            Se déconnecter
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
          <ChatRoom onUnreadCountChange={(n) => setChatUnread(n)} />
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
   - tables: leagues, profiles, messages, league_reads
========================= */

function ChatRoom({ onUnreadCountChange }) {
  const [league, setLeague] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const myUserIdRef = useRef(null);

  const scrollToBottom = (smooth = true) =>
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      myUserIdRef.current = data?.user?.id ?? null;
    });
  }, []);

  // Unread refresh (poll léger, MVP)
  useEffect(() => {
    if (!league?.id) return;

    let alive = true;
    const tick = async () => {
      try {
        const n = await getChatUnreadCount(league.id);
        if (!alive) return;
        onUnreadCountChange?.(n);
      } catch {
        // silencieux MVP
      }
    };

    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [league?.id, onUnreadCountChange]);

  useEffect(() => {
    let alive = true;
    let channel = null;

    (async () => {
      setBusy(true);
      setError("");
      try {
        // ligue unique = première ligue
        const { data: l, error: le } = await supabase
          .from("leagues")
          .select("id, name, created_at")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (le) throw le;
        if (!l) throw new Error("Aucune ligue trouvée (seed requis).");

        if (!alive) return;
        setLeague(l);

        const initial = await loadMessages(l.id);
        if (!alive) return;
        setMessages(initial);

        // IMPORTANT: on marque lu dès l'ouverture
        await markRead(l.id);
        onUnreadCountChange?.(0);

        setTimeout(() => scrollToBottom(false), 50);

        // Realtime : refresh simple (MVP)
        channel = supabase
          .channel(`messages:${l.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages", filter: `league_id=eq.${l.id}` },
            async () => {
              const refreshed = await loadMessages(l.id);
              if (!alive) return;
              setMessages(refreshed);

              // si la conversation est ouverte, on considère lu
              await markRead(l.id);
              onUnreadCountChange?.(0);

              setTimeout(() => scrollToBottom(true), 30);
            }
          )
          .subscribe();
      } catch (e) {
        setError(e?.message ?? "Erreur chat.");
      } finally {
        setBusy(false);
      }
    })();

    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [onUnreadCountChange]);

  async function loadMessages(leagueId) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, content, created_at, user_id, profiles(display_name, role)")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw error;
    return (data ?? []).slice().reverse();
  }

  async function markRead(leagueId) {
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;
    if (!user) return;

    const { error } = await supabase.from("league_reads").upsert(
      {
        league_id: leagueId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "league_id,user_id" }
    );

    if (error) {
      // ne bloque pas le chat en MVP
      console.warn("[Chat] markRead error", error.message);
    }
  }

  async function getChatUnreadCount(leagueId) {
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;
    if (!user) return 0;

    // last_read_at
    const { data: readRow, error: re } = await supabase
      .from("league_reads")
      .select("last_read_at")
      .eq("league_id", leagueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (re) throw re;

    const lastReadAt = readRow?.last_read_at ?? "1970-01-01T00:00:00.000Z";

    // count messages after lastReadAt
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .gt("created_at", lastReadAt);

    if (error) throw error;

    // si tu es dans l'onglet chat, on ne veut pas afficher un badge
    return count ?? 0;
  }

  async function send() {
    if (!league?.id) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setError("");
    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u?.user;
      if (!user) throw new Error("Non connecté.");

      const { error } = await supabase.from("messages").insert({
        league_id: league.id,
        user_id: user.id,
        content: trimmed,
      });
      if (error) throw error;

      setText("");
      setTimeout(() => scrollToBottom(true), 30);
    } catch (e) {
      setError(e?.message ?? "Impossible d’envoyer le message.");
    }
  }

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 border-b">
        <div className="font-bold">{league?.name ?? "Messagerie"}</div>
        <div className="text-sm text-slate-600">Salon unique de la ligue</div>
      </div>

      <div className="h-[55vh] overflow-auto p-4 space-y-3 bg-slate-50">
        {busy ? <div className="text-sm text-slate-600">Chargement…</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {messages.map((m) => {
          const name = m?.profiles?.display_name ?? "…";
          const isMe = myUserIdRef.current && m.user_id === myUserIdRef.current;
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
