import Header from "./Header";
import BottomNav from "./BottomNav";

/**
 * AppShell (UI V2)
 * - Header sticky
 * - BottomNav fixe (Instagram-like)
 * - Zone de contenu scrollable
 * - Safe-area iOS pris en compte
 */
export default function AppShell({
  children,
  activeTab,
  onTab,
  header,
  notificationCount = 0,
  chatBadgeCount = 0,
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header {...header} notificationCount={notificationCount} />

      <main className="w-full">
        <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-[calc(88px+var(--safe-bottom))]">
          {children}
        </div>
      </main>

      <BottomNav activeTab={activeTab} onTab={onTab} chatBadgeCount={chatBadgeCount} />
    </div>
  );
}
