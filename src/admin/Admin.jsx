import { useState } from "react";

/* =========================
   ADMIN
========================= */
export default function Admin() {
  // --- Bloc NOTIFS (inchangé)
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("LNJP");
  const [body, setBody] = useState("Attention, pronostics à faire avant demain 19h.");
  const [url, setUrl] = useState("/");
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  // --- Bloc CHAT (nouveau)
  const [chatMessage, setChatMessage] = useState("Salut à tous, pensez à valider vos pronos.");
  const [chatResult, setChatResult] = useState(null);
  const [chatSending, setChatSending] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Super Admin</h1>

        {/* =========================
            1) Notifications (socle inchangé)
        ========================= */}
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

        {/* =========================
            2) Messagerie (nouveau)
        ========================= */}
        <div className="rounded-xl border p-4 space-y-3">
          <div className="text-lg font-bold">Messagerie — Message dans le salon</div>
          <div className="text-sm text-slate-600">
            Envoie un message dans le salon unique de la ligue (comme un utilisateur).
          </div>

          <input
            className="w-full border rounded-lg p-2"
            placeholder="ADMIN_TOKEN (MVP)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

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
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
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

          {chatResult && (
            <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">
              {JSON.stringify(chatResult, null, 2)}
            </pre>
          )}
        </div>

        <p className="text-sm text-slate-600">
          Astuce : ouvre <span className="font-mono">/admin</span> sur ton ordinateur.
        </p>
      </div>
    </div>
  );
}
