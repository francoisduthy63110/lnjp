import { useEffect, useMemo, useState } from "react";

const DEFAULT_TAB = "home";
const ALLOWED = new Set(["home", "rankings", "predictions", "live", "chat"]);

function readTabFromUrl() {
  try {
    const url = new URL(window.location.href);
    const tab = url.searchParams.get("tab") || DEFAULT_TAB;
    return ALLOWED.has(tab) ? tab : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

export function useV2Nav() {
  const [tab, setTab] = useState(() => readTabFromUrl());
  const [overlay, setOverlay] = useState(null); // 'notifications' | null

  const api = useMemo(
    () => ({
      tab,
      overlay,
      go(nextTab) {
        const safe = ALLOWED.has(nextTab) ? nextTab : DEFAULT_TAB;
        setOverlay(null);
        setTab(safe);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", safe);
        window.history.pushState({}, "", url);
      },
      openNotifications() {
        setOverlay("notifications");
      },
      closeOverlay() {
        setOverlay(null);
      },
    }),
    [tab, overlay]
  );

  useEffect(() => {
    const onPop = () => setTab(readTabFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return api;
}
