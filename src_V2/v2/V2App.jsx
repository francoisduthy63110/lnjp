import { useMemo } from "react";
import AppShell from "../ui/AppShell";
import { getIdentity } from "../lib/user";
import { useV2Nav } from "./useV2Nav";

import Dashboard from "./pages/Dashboard";
import Rankings from "./pages/Rankings";
import Predictions from "./pages/Predictions";
import Live from "./pages/Live";
import Chat from "./pages/Chat";
import Notifications from "./pages/Notifications";

/**
 * V2App
 * - UI/UX sandbox (non connecté au fonctionnel)
 * - navigation via query param (?tab=...)
 */
export default function V2App() {
  const identity = useMemo(() => getIdentity(), []);
  const nav = useV2Nav();

  const header = useMemo(
    () => ({
      displayName: identity?.displayName || "Joueur",
      leagueName: identity?.leagueCode ? `Ligue ${identity.leagueCode}` : "Ma ligue",
      avatarEmoji: "🙂",
      onOpenNotifications: nav.openNotifications,
      onLogoClick: () => nav.go("home"),
    }),
    [identity, nav]
  );

  // mock counts (à brancher plus tard sur les vrais endpoints)
  const notificationCount = 1;
  const chatBadgeCount = 1;

  let content = null;
  switch (nav.tab) {
    case "rankings":
      content = <Rankings />;
      break;
    case "predictions":
      content = <Predictions onGoLive={() => nav.go("live")} />;
      break;
    case "live":
      content = <Live />;
      break;
    case "chat":
      content = <Chat />;
      break;
    case "home":
    default:
      content = <Dashboard onGoPredictions={() => nav.go("predictions")} />;
      break;
  }

  return (
    <>
      <AppShell
        header={header}
        activeTab={nav.tab} // 'home' => aucun item actif dans le bottom nav
        onTab={(k) => nav.go(k)}
        notificationCount={notificationCount}
        chatBadgeCount={chatBadgeCount}
      >
        {content}
      </AppShell>

      {nav.overlay === "notifications" ? <Notifications onClose={nav.closeOverlay} /> : null}
    </>
  );
}
