function BellIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function Badge({ count }) {
  if (!count) return null;
  const label = count > 9 ? "9+" : String(count);
  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] text-white text-[11px] leading-[18px] text-center font-semibold">
      {label}
    </span>
  );
}

/**
 * Header V2
 * - gauche : avatar + pseudo + ligue
 * - centre : logo
 * - droite : cloche + badge
 */
export default function Header({
  displayName = "Joueur",
  leagueName = "Ma ligue",
  avatarEmoji = "🙂",
  notificationCount = 0,
  onOpenNotifications,
  onLogoClick,
}) {
  return (
    <div
      className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(6,8,12,0.75)] backdrop-blur"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="mx-auto w-full max-w-xl px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-white/10 flex items-center justify-center text-lg">
            {avatarEmoji}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            <div className="text-xs text-[var(--muted)] truncate">{leagueName}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center justify-center"
          aria-label="Accueil"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-white/10 flex items-center justify-center shadow-[var(--shadow)]">
            <img
              src="/icons/icon-192.png"
              alt="LNJP"
              className="w-6 h-6 object-contain"
            />
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative w-10 h-10 rounded-xl bg-[var(--surface)] border border-white/10 flex items-center justify-center"
          aria-label="Notifications"
        >
          <BellIcon className="w-5 h-5 text-white/90" />
          <Badge count={notificationCount} />
        </button>
      </div>
    </div>
  );
}
