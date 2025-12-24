import { useEffect, useMemo, useState } from "react";
import { enablePushNotifications } from "../lib/push";
import { getCurrentUserId } from "../lib/user";

/**
 * NotificationsPanel (MVP clean)
 * Objectif: rester compatible avec le socle existant (push + inbox), tout en simplifiant l’UX.
 *
 * Règles:
 * - plus de bouton "Ouvrir"
 * - plus de bouton "Rafraîchir" (auto-refresh via SW + polling parent)
 * - afficher 5 dernières par défaut + bouton "Charger l’historique"
 * - bouton "Supprimer"
 * - modale = contenu complet (pas de bouton "Ouvrir le lien")
 * - purge auto des notifs > 7 jours côté API (/api/inbox)
 */
export default function NotificationsPanel({ onUnreadCountChange }) {
  const userId = useMemo(() => getCurrentUserId(), []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // pagination simple
  const [limit, setLimit] = useState(5);
  const [hasMore, setHasMore] = useState(false);

  // Modale
  const [openItem, setOpenItem] = useState(null);

  const unreadCount = useMemo(() => items.filter((i) => i.readAt === null).length, [items]);

  async function loadInbox({ nextLimit } = {}) {
    const lim = typeof nextLimit === "number" ? nextLimit : limit;

    setLoading(true);
    try {
      const res = await fetch(`/api/inbox?userId=${encodeURIComponent(userId)}&limit=${lim}&offset=0`);
      const data = await res.json();
      const next = data.items || [];
      setItems(next);
      setHasMore(Boolean(data.total && data.total > next.length));
    } catch (e) {
      console.error("[Inbox] load error", e);
    } finally {
      setLoading(false);
    }
  }

  // 1) Chargement initial
  useEffect(() => {
    loadInbox({ nextLimit: 5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Auto-refresh quand la push arrive (message depuis SW)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event) => {
      if (event.data?.type === "INBOX_REFRESH") {
        // recharge sans changer la limite courante
        loadInbox();
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  // 3) Badge iOS / PWA via Badging API si supportée
  useEffect(() => {
    const hasBadging =
      typeof navigator !== "undefined" && "setAppBadge" in navigator && "clearAppBadge" in navigator;

    if (!hasBadging) return;

    (async () => {
      try {
        if (unreadCount > 0) {
          await navigator.setAppBadge(unreadCount);
        } else {
          await navigator.clearAppBadge();
        }
      } catch {
        // ignore
      }
    })();
  }, [unreadCount]);

  // 4) Remonte le compteur au parent (pour badge UI)
  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  async function ensurePush() {
    try {
      await enablePushNotifications(userId);
      setPushEnabled(true);
    } catch (e) {
      console.error("[Push] enable error", e);
      alert("Impossible d’activer les notifications push sur cet appareil.");
    }
  }

  // Lire = ouvre modale + mark read (global MVP)
  async function readNotification(n) {
    setOpenItem(n);

    if (n.readAt !== null) return;

    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: nowIso } : x)));

    try {
      await fetch("/api/inbox-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId: n.id }),
      });
    } catch (e) {
      console.error("[Inbox] inbox-read error", e);
      await loadInbox();
    }
  }

  async function deleteNotification(n) {
    const ok = confirm("Supprimer cette notification ?");
    if (!ok) return;

    // optimiste
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (openItem?.id === n.id) setOpenItem(null);

    try {
      await fetch("/api/inbox-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId: n.id }),
      });
      // resync léger
      await loadInbox();
    } catch (e) {
      console.error("[Inbox] inbox-delete error", e);
      await loadInbox();
    }
  }

  function closeModal() {
    setOpenItem(null);
  }

  async function loadHistory() {
    const next = Math.min(limit + 20, 200);
    setLimit(next);
    await loadInbox({ nextLimit: next });
  }

  return (
    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-bold">Notifications</div>
          <div className="text-sm text-slate-600">{unreadCount} non-lu</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold"
            onClick={ensurePush}
            disabled={pushEnabled}
            title={pushEnabled ? "Déjà activé sur cet appareil" : "Activer les notifications push"}
          >
            {pushEnabled ? "Push activé" : "Activer push"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 bg-slate-50">
        {loading ? <div className="text-sm text-slate-600">Chargement…</div> : null}

        {items.length === 0 && !loading ? (
          <div className="text-sm text-slate-600">Aucune notification.</div>
        ) : null}

        {items.map((n) => {
          const ts = n.createdAt
            ? new Date(n.createdAt).toLocaleString([], {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

          return (
            <div
              key={n.id}
              className={[
                "rounded-2xl border bg-white p-4 flex items-center justify-between gap-3",
                n.readAt === null ? "border-slate-900" : "",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  Lire nouveau message
                  {n.readAt === null ? <span className="ml-2 text-xs text-red-600">(nouveau)</span> : null}
                </div>
                <div className="text-xs text-slate-500">{ts}</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="border rounded-xl px-3 py-2 text-sm font-semibold"
                  onClick={() => readNotification(n)}
                >
                  Lire
                </button>
                <button
                  className="border rounded-xl px-3 py-2 text-sm text-slate-600"
                  onClick={() => deleteNotification(n)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}

        {hasMore ? (
          <button
            className="w-full border rounded-xl py-3 text-sm font-semibold bg-white"
            onClick={loadHistory}
            disabled={loading}
          >
            {loading ? "..." : "Charger l’historique"}
          </button>
        ) : null}
      </div>

      {openItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-bold">{openItem.title || "LNJP"}</div>
                <div className="text-sm text-slate-600">
                  {openItem.createdAt ? new Date(openItem.createdAt).toLocaleString() : ""}
                </div>
              </div>

              <button className="border rounded-xl px-4 py-2 text-sm font-semibold" onClick={closeModal}>
                Fermer
              </button>
            </div>

            <div className="mt-4 whitespace-pre-wrap text-slate-900">{openItem.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}
