function uuidv4() {
  // UUID simple, suffisant MVP
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const K_USER_ID = "lnjp_user_id";
const K_DISPLAY_NAME = "lnjp_display_name";
const K_LEAGUE_CODE = "lnjp_league_code";

export function getCurrentUserId() {
  const id = localStorage.getItem(K_USER_ID);
  if (id) return id;

  const created = uuidv4();
  localStorage.setItem(K_USER_ID, created);
  return created;
}

export function getIdentity() {
  const userId = localStorage.getItem(K_USER_ID);
  const displayName = localStorage.getItem(K_DISPLAY_NAME);
  const leagueCode = localStorage.getItem(K_LEAGUE_CODE);

  return {
    isJoined: Boolean(userId && displayName && leagueCode),
    userId: userId || "",
    displayName: displayName || "",
    leagueCode: leagueCode || "",
  };
}

export function setIdentity({ displayName, leagueCode }) {
  const userId = getCurrentUserId();
  localStorage.setItem(K_DISPLAY_NAME, displayName);
  localStorage.setItem(K_LEAGUE_CODE, leagueCode);

  return {
    isJoined: true,
    userId,
    displayName,
    leagueCode,
  };
}

export function clearIdentity() {
  // On garde l’ID device/user si tu veux; mais pour “déconnexion” stricte, on le supprime aussi.
  localStorage.removeItem(K_USER_ID);
  localStorage.removeItem(K_DISPLAY_NAME);
  localStorage.removeItem(K_LEAGUE_CODE);
}

export function getDisplayName() {
  return localStorage.getItem(K_DISPLAY_NAME) || "";
}

export function getLeagueCode() {
  return localStorage.getItem(K_LEAGUE_CODE) || "";
}
