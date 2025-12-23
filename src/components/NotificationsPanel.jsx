import { useEffect, useMemo, useState } from "react";
import { enablePushNotifications } from "../lib/push";
import { getCurrentUserId } from "../lib/user";

/**
 * Extraction directe de l'ancien Player() (socle Notifications).
 * Objectif : ne rien casser.
 *
 * Différences volontaires (UX) :
 * - on enlève le gros header LNJP + V0
 * - on garde : liste, badge iOS, auto-refresh SW, modale "Lire" => mark read
 * - on garde un bouton d'activation push (utile), mais moins "test"
 */
export default function NotificationsPanel({ onUnreadCountChange }) {
  const userId = useMemo(() => getCurrentUserId(), []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // Modale de lecture
  const [openItem, setOpenItem] = useState(null);

  // Non-lu = readAt strictement NULL (aligné DB)
  const unreadCount = useMemo(() => items.filter((i) => i.readAt === null).length, [items]);

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

  // 1) Chargement initial
  useEffect(() => {
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Auto-refresh quand la push arrive (message depuis SW)
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

  // 3) Badge iOS / PWA (pastille sur l’icône) via Badging API si supportée
  useEffect(() => {
    const hasBadging =
      typeof navigator !== "undefined" &&
      "setAppBadge" in navigator &&
      "clearAppBadge" in navigator;

    if (!hasBadging) return;

    (async () => {
      try {
        if (unreadCount > 0) {
          await navigator.setAppBadge(unreadCount);
        } else {
          await navigator.clearAppBadge();
        }
      } catch {
        // iOS peut refuser selon contexte; ignore
      }
    })();
  }, [unreadCount]);

  // 4) Remonte le compteur au parent (pour badge UI)
  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  // Action: Lire => ouvre la modale + marque lu (sans casser la chaîne)
  async function readNotification(n) {
    // 1) Ouvre la modale tout de suite
    setOpenItem(n);

    // 2) Si déjà lu, on ne refait rien
    if (n.readAt !== null) return;

    // 3) Optimiste: on marque lu côté UI immédiatement (badge baisse sans attendre)
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: nowIso } : x)));

    // 4) Persist côté backend (sans impacter le reste)
    try {
      await fetch("/api/inbox-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId: n.id }),
      });
    } catch (e) {
      // Si erreur, on resynchronise (et on ne casse pas l’expérience)
      console.error("[Inbox] inbox-read error", e);
      await loadInbox();
    }
  }

  function closeModal() {
    setOpenItem(null);
  }

  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="p-4 border-b flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold">Notifications</div>
          <div className="text-sm text-slate-600">
            {unreadCount} non-lu{unreadCount > 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800"
            onClick={async () => {
              try {
                await enablePushNotifications();
                setPushEnabled(true);
                alert("Notifications activées.");
              } catch (e) {
                alert(`Erreur: ${e?.message || e}`);
              }
            }}
            title="Activer les notifications push"
          >
            {pushEnabled ? "Push activées" : "Activer push"}
          </button>

          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            onClick={loadInbox}
            disabled={loading}
            title="Rafraîchir l’inbox"
          >
            {loading ? "..." : "Rafraîchir"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 bg-slate-50">
        {items.length === 0 && (
          <div className="text-sm text-slate-500 border rounded-xl p-4 bg-white">
            Aucune notification pour l’instant.
          </div>
        )}

        {items.map((n) => {
          const isUnread = n.readAt === null;

          return (
            <div key={n.id} className="border rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-1 line-clamp-2">{n.body}</div>
                  <div className="text-xs text-slate-400 mt-2">
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                  </div>
                </div>

                {isUnread && (
                  <span className="text-xs bg-slate-900 text-white rounded-full px-2 py-1">
                    Nouveau
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="text-sm rounded-lg border px-3 py-2 hover:bg-slate-50"
                  onClick={() => readNotification(n)}
                >
                  Lire
                </button>

                {n.url && (
                  <a className="text-sm rounded-lg border px-3 py-2 hover:bg-slate-50" href={n.url}>
                    Ouvrir
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================
          MODALE "Lire"
      ========================= */}
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
                <div className="text-lg font-bold">{openItem.title}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {openItem.createdAt ? new Date(openItem.createdAt).toLocaleString() : ""}
                </div>
              </div>

              <button
                className="text-sm rounded-lg border px-3 py-2 hover:bg-slate-50"
                onClick={closeModal}
              >
                Fermer
              </button>
            </div>

            <div className="mt-4 text-sm text-slate-700 whitespace-pre-wrap">
              {openItem.body}
            </div>

            {openItem.url && (
              <div className="mt-4">
                <a
                  className="inline-flex text-sm rounded-lg border px-3 py-2 hover:bg-slate-50"
                  href={openItem.url}
                >
                  Ouvrir le lien
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
