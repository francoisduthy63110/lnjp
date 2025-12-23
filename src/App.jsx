import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import Admin from "./admin/Admin";
import PlayerHome from "./components/PlayerHome";

/**
 * App.jsx (réécrit)
 * - garde le routage simple comme avant: /admin => Admin, sinon Player
 * - ajoute Auth OTP + pseudo (écran unique)
 * - stocke user_id dans localStorage pour compat Notifications (qui consomment /api/inbox?userId=...)
 */
export default function App() {
  const isAdminRoute = useMemo(() => window.location.pathname.startsWith("/admin"), []);

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");

  // Boot session + listener
  useEffect(() => {
    let unsub = null;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(data.session ?? null);
      } catch (e) {
        setBootError(e?.message ?? "Erreur session.");
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);

      // Compat Notifications: on stocke l'UUID auth comme userId "technique"
      const uid = s?.user?.id ?? "";
      if (uid) localStorage.setItem("lnjp_user_id", uid);
      else localStorage.removeItem("lnjp_user_id");
    });

    unsub = data?.subscription;

    return () => {
      try {
        unsub?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // Load profile (profiles table) quand connecté
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setBooting(false);
      return;
    }

    let alive = true;
    (async () => {
      setBooting(true);
      setBootError("");
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) throw error;

        if (!alive) return;
        setProfile(data ?? null);
      } catch (e) {
        if (!alive) return;
        setBootError(e?.message ?? "Erreur chargement profil.");
      } finally {
        if (!alive) return;
        setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [session]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Route Admin = écran dédié (comme avant)
  if (isAdminRoute) {
    return <Admin />;
  }

  // Non connecté => onboarding
  if (!session) {
    return <Onboarding />;
  }

  // Connecté mais profil pas prêt => écran safe
  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md mx-auto bg-white border rounded-2xl p-6">
          <div className="text-sm text-slate-600">Chargement…</div>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md mx-auto bg-white border rounded-2xl p-6 space-y-3">
          <div className="text-lg font-bold">Erreur</div>
          <div className="text-sm text-red-600">{bootError}</div>
          <button className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md mx-auto bg-white border rounded-2xl p-6 space-y-3">
          <div className="text-lg font-bold">Profil manquant</div>
          <div className="text-sm text-slate-600">
            Ton profil n’a pas été créé correctement. Déconnecte-toi puis reconnecte-toi.
          </div>
          <button className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return <PlayerHome profile={profile} onSignOut={signOut} />;
}

/* =========================
   ONBOARDING (1 écran)
   - email + pseudo
   - send OTP
   - verify OTP
   - upsert profiles (display_name)
========================= */

function Onboarding() {
  const [email, setEmail] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSend = useMemo(() => {
    const e = email.trim();
    const p = pseudo.trim();
    return e.includes("@") && e.includes(".") && p.length >= 2;
  }, [email, pseudo]);

  async function sendOtp() {
    setError("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setOtpSent(true);
    } catch (e) {
      setError(e?.message ?? "Erreur lors de l’envoi du code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError("");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });
      if (error) throw error;

      const uid = data?.user?.id;
      if (!uid) throw new Error("Connexion impossible (user manquant).");

      // Compat Notifications : stocke userId (UUID) immédiatement
      localStorage.setItem("lnjp_user_id", uid);

      // Upsert profil (pseudo)
      const { error: pe } = await supabase.from("profiles").upsert(
        {
          id: uid,
          display_name: pseudo.trim(),
        },
        { onConflict: "id" }
      );
      if (pe) throw pe;

      // Rien d'autre: App remontera via onAuthStateChange
    } catch (e) {
      setError(e?.message ?? "Code invalide.");
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
            Connexion rapide : e-mail + pseudo, puis code OTP.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Adresse e-mail</span>
            <input
              className="w-full border rounded-xl p-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: prenom.nom@email.com"
              autoComplete="email"
              inputMode="email"
              disabled={busy || otpSent}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Pseudo</span>
            <input
              className="w-full border rounded-xl p-3"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="ex: JoyeuxParieur"
              autoComplete="nickname"
              disabled={busy || otpSent}
            />
          </label>

          {!otpSent ? (
            <button
              className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
              onClick={sendOtp}
              disabled={!canSend || busy}
            >
              {busy ? "Envoi..." : "Recevoir mon code"}
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Code reçu (OTP)</span>
                <input
                  className="w-full border rounded-xl p-3 tracking-widest"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  disabled={busy}
                />
              </label>

              <button
                className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
                onClick={verify}
                disabled={otp.trim().length < 4 || busy}
              >
                {busy ? "Validation..." : "Valider et entrer"}
              </button>

              <button
                className="w-full rounded-xl border py-3 font-semibold"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                }}
                disabled={busy}
              >
                Revenir en arrière
              </button>
            </div>
          )}
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <div className="text-xs text-slate-500 leading-relaxed">
          MVP : pseudo unique globalement (contrainte DB recommandée). Pas de changement de pseudo pour l’instant.
        </div>
      </div>
    </div>
  );
}
