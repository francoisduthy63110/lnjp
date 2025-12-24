import { useMemo, useState } from "react";
import Admin from "./admin/Admin";
import PlayerHome from "./components/PlayerHome";
import { getIdentity, setIdentity, clearIdentity } from "./lib/user";

/**
 * App.jsx (MVP clean)
 * - /admin => Admin
 * - sinon => Join (Pseudo + Code ligue)
 * - aucune Auth email / Supabase Auth
 * - identité stockée en localStorage pour:
 *   - messagerie (API server)
 *   - inbox notifications (userId en querystring)
 */
export default function App() {
  const isAdminRoute = useMemo(() => window.location.pathname.startsWith("/admin"), []);
  if (isAdminRoute) return <Admin />;

  const [identity, setIdentityState] = useState(() => getIdentity());

  function onJoin({ displayName, leagueCode }) {
    const next = setIdentity({ displayName, leagueCode });
    setIdentityState(next);
  }

  function onSignOut() {
    clearIdentity();
    setIdentityState(getIdentity());
  }

  if (!identity?.isJoined) {
    return <Join onJoin={onJoin} />;
  }

  return (
    <PlayerHome
      displayName={identity.displayName}
      leagueCode={identity.leagueCode}
      userId={identity.userId}
      onSignOut={onSignOut}
    />
  );
}

/* =========================
   JOIN (1 écran)
   - pseudo + code ligue
   - validation via /api/league-validate (server)
========================= */

function Join({ onJoin }) {
  const [displayName, setDisplayName] = useState("");
  const [leagueCode, setLeagueCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    const p = displayName.trim();
    const c = leagueCode.trim();
    return p.length >= 2 && c.length >= 3;
  }, [displayName, leagueCode]);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/league-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueCode: leagueCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Code invalide.");
      }

      onJoin({ displayName: displayName.trim(), leagueCode: leagueCode.trim() });
    } catch (e) {
      setError(e?.message ?? "Impossible d’entrer dans la ligue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">LNJP</h1>
          <p className="text-sm text-slate-600">
            Entre ton pseudo et le code d’invitation de la ligue.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Pseudo</span>
            <input
              className="w-full border rounded-xl p-3"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ex: Joueur 1"
              autoComplete="nickname"
              disabled={busy}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Code ligue (carton)</span>
            <input
              className="w-full border rounded-xl p-3 tracking-widest"
              value={leagueCode}
              onChange={(e) => setLeagueCode(e.target.value)}
              placeholder="ex: LNJP2025"
              autoComplete="one-time-code"
              disabled={busy}
            />
          </label>

          <button
            className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
            onClick={submit}
            disabled={!canSubmit || busy}
          >
            {busy ? "Vérification..." : "Entrer dans la ligue"}
          </button>
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <div className="text-xs text-slate-500 leading-relaxed">
          MVP : pas d’e-mail, pas de mot de passe. Accès via code d’invitation uniquement.
        </div>
      </div>
    </div>
  );
}
