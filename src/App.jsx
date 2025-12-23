import { useEffect, useMemo, useState } from "react";
import { enablePushNotifications } from "./lib/push";
import { getCurrentUserId } from "./lib/user";

/* =========================
   ADMIN
========================= */
function Admin() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("LNJP");
  const [body, setBody] = useState("Attention, pronostics à faire avant demain 19h.");
  const [url, setUrl] = useState("/");
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">Super Admin — Notifications</h1>

        <div className="rounded-xl border p-4 space-y-3">
          <input
            className="w-full border rounded-lg p-2"
            placeholder="ADMIN_TOKEN (MVP)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
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
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
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
      </div>
    </div>
  );
}

/* =========================
   PLAYER
========================= */
function Player() {
  const userId = useMemo(() => getCurrentUserId(), []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // ✅ CORRECTIF : test explicite sur NULL
  const unreadCount = useMemo(
    () => items.filter((i) => i.readAt === null).length,
    [items]
  );

  async function loadInbox() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      console.error("[Inbox] loadInbox error", e);
    } finally {
      setLoading(false);
    }
  }

  /* 1️⃣ Chargement initial */
  useEffect(() => {
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 2️⃣ Auto-refresh quand une push arrive */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event) => {
      if (event.data?.type === "INBOX_REFRESH") {
        loadInbox();
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-5xl font-bold">LNJP</h1>
            <p className="mt-3 text-slate-600">V0+ — Push + Inbox minimale</p>
          </div>

          <div className="text-sm text-slate-600 text-right">
            Inbox : <span className="font-semibold">{unreadCount}</span> non-lu
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <button
            className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 text-base font-semibold hover:bg-slate-800"
            onClick={async () => {
              try {
                await enablePushNotifications();
                setPushEnabled(true);
                alert("Notifications activées.");
              } catch (e) {
                alert(`Erreur: ${e?.message || e}`);
              }
            }}
          >
            {pushEnabled ? "Notifications activées" : "Activer les notifications"}
          </button>

          <button
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium"
            onClick={loadInbox}
            disabled={loading}
          >
            {loading ? "Chargement..." : "Rafraîchir l’Inbox"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {items.length === 0 && (
            <div className="text-sm text-slate-500 border rounded-xl p-4">
              Aucune notification pour l’instant.
            </div>
          )}

          {items.map((n) => (
            <div key={n.id} className="border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{n.body}</div>
                  <div className="text-xs text-slate-400 mt-2">
                    {n.createdAt && new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* ✅ CORRECTIF */}
                {n.readAt === null && (
                  <span className="text-xs bg-slate-900 text-white rounded-full px-2 py-1">
                    Nouveau
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                {n.readAt === null && (
                  <button
                    className="text-sm rounded-lg border px-3 py-2 hover:bg-slate-50"
                    onClick={async () => {
                      await fetch("/api/inbox-read", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId, notificationId: n.id }),
                      });
                      loadInbox();
                    }}
                  >
                    Marquer comme lu
                  </button>
                )}

                {n.url && (
                  <a
                    className="text-sm rounded-lg border px-3 py-2 hover:bg-slate-50"
                    href={n.url}
                  >
                    Ouvrir
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================
   ROOT
========================= */
export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <Admin /> : <Player />;
}
