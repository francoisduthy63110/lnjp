function IconTrophy({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M6 4H4v2a4 4 0 0 0 4 4" />
      <path d="M18 4h2v2a4 4 0 0 1-4 4" />
      <path d="M12 13v3" />
      <path d="M10 16h4" />
      <path d="M9 20h6" />
    </svg>
  );
}

function IconList({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function IconActivity({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-4l-3 9-6-18-3 9H2" />
    </svg>
  );
}

function IconChat({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
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

const ITEMS = [
  { key: "rankings", label: "Classement", Icon: IconTrophy },
  { key: "predictions", label: "Pronostics", Icon: IconList },
  { key: "live", label: "Live", Icon: IconActivity },
  { key: "chat", label: "Chat", Icon: IconChat },
];

export default function BottomNav({ activeTab, onTab, chatBadgeCount = 0 }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[rgba(6,8,12,0.75)] backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto w-full max-w-xl px-2">
        <div className="h-[72px] flex items-center justify-between">
          {ITEMS.map(({ key, label, Icon }) => {
            const active = key === activeTab;
            const badge = key === "chat" ? chatBadgeCount : 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTab(key)}
                className="relative flex-1 h-full flex flex-col items-center justify-center gap-1"
                aria-current={active ? "page" : undefined}
              >
                <div
                  className={
                    "w-10 h-10 rounded-xl border flex items-center justify-center transition-colors " +
                    (active
                      ? "bg-[var(--surface-2)] border-white/20 text-white"
                      : "bg-[var(--surface)] border-white/10 text-white/70")
                  }
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className={"text-[11px] " + (active ? "text-white" : "text-white/60")}>{label}</div>
                <Badge count={badge} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
