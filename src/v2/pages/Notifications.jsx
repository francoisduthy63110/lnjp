import { useMemo, useState } from "react";
import { Divider, Pill, Title, Sub } from "../../ui/Primitives";

function XIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function Item({ n, onRead, onDelete }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-2 pt-2">
        {!n.read ? <div className="w-2 h-2 rounded-full bg-[var(--primary-3)]" /> : null}
      </div>
      <button type="button" onClick={onRead} className="flex-1 text-left min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold truncate">{n.title}</div>
          <div className="text-xs text-[var(--muted)] shrink-0">{n.when}</div>
        </div>
        <div className="mt-1 text-sm text-white/80 overflow-hidden text-ellipsis">{n.body}</div>
        <div className="mt-2 text-xs text-[var(--muted)]">Cliquer pour lire (marqué comme lu).</div>
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="w-9 h-9 rounded-xl bg-[var(--surface-2)] border border-white/10 flex items-center justify-center text-white/70"
        aria-label="Supprimer"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Notifications (overlay)
 * - clic pour lire (marquer comme lu)
 * - croix pour supprimer
 * - pas de bouton Rafraîchir
 */
export default function Notifications({ onClose }) {
  const [items, setItems] = useState(() => [
    { id: 1, title: "Rappel", body: "Pense à faire tes pronos avant 20h.", when: "il y a 2h", read: false },
    { id: 2, title: "Journée publiée", body: "La journée 19 est disponible.", when: "hier", read: true },
  ]);

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/60" aria-label="Fermer" />

      <div className="absolute left-0 right-0 bottom-0">
        <div className="mx-auto w-full max-w-xl rounded-t-[28px] border border-white/10 bg-[var(--bg)] shadow-[var(--shadow)]">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between">
              <Title>Notifications</Title>
              <div className="flex items-center gap-2">
                <Pill variant={unread ? "danger" : "outline"}>{unread ? `${unread} non lue(s)` : "Tout lu"}</Pill>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-[var(--surface)] border border-white/10 text-white/80"
                >
                  Fermer
                </button>
              </div>
            </div>
            <Sub className="mt-2">Liste claire : cliquer pour lire, croix pour supprimer.</Sub>
          </div>

          <Divider />

          <div className="px-4 max-h-[70vh] overflow-auto pb-[calc(16px+var(--safe-bottom))]">
            {items.length ? (
              items.map((n, idx) => (
                <div key={n.id}>
                  <Item
                    n={n}
                    onRead={() =>
                      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
                    }
                    onDelete={() => setItems((prev) => prev.filter((x) => x.id !== n.id))}
                  />
                  {idx < items.length - 1 ? <Divider /> : null}
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-sm text-[var(--muted)]">Aucune notification.</div>
            )}

            <div className="mt-3 text-xs text-[var(--muted)]">
              Option future : purge automatique (ex: +1 semaine) côté base / cron.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
