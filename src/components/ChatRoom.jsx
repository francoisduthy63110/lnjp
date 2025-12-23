import { useEffect, useMemo, useRef, useState } from "react";
import { fetchLatestMessages, markChatRead, sendMessage, subscribeToMessages } from "../lib/chat";
import { supabase } from "../lib/supabase";

export default function ChatRoom({ league }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const leagueId = league?.id;

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const myUserIdRef = useRef(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      myUserIdRef.current = data?.user?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!leagueId) return;

    let unsub = null;
    (async () => {
      setBusy(true);
      setError("");
      try {
        const initial = await fetchLatestMessages({ leagueId, limit: 80 });
        setMessages(initial);
        await markChatRead({ leagueId });
        setTimeout(scrollToBottom, 50);

        unsub = subscribeToMessages({
          leagueId,
          onInsert: async (newMsg) => {
            // On recharge "léger" pour récupérer profiles.display_name via select joint (simple et safe en MVP)
            // Optimisation possible plus tard.
            const refreshed = await fetchLatestMessages({ leagueId, limit: 80 });
            setMessages(refreshed);
            await markChatRead({ leagueId });
            setTimeout(scrollToBottom, 30);
          },
        });
      } catch (e) {
        setError(e?.message ?? "Erreur chat.");
      } finally {
        setBusy(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [leagueId]);

  const canSend = useMemo(() => text.trim().length > 0 && text.trim().length <= 2000, [text]);

  async function handleSend() {
    if (!canSend) return;
    setError("");
    try {
      await sendMessage({ leagueId, content: text });
      setText("");
      setTimeout(scrollToBottom, 30);
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
              <div className={["inline-block rounded-2xl px-4 py-2 border", isMe ? "bg-white" : "bg-white"].join(" ")}>
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
                handleSend();
              }
            }}
          />
          <button
            className="rounded-xl bg-slate-900 text-white px-4 font-semibold disabled:opacity-50"
            onClick={handleSend}
            disabled={!canSend}
          >
            Envoyer
          </button>
        </div>
        <div className="text-xs text-slate-500 mt-2">Entrée pour envoyer. (Shift+Entrée pour sauter une ligne)</div>
      </div>
    </div>
  );
}
