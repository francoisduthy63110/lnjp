import { useMemo, useState } from "react";
import { signInWithOtp, verifyOtp } from "../lib/auth";
import { upsertMyProfile } from "../lib/profile";

export default function Onboarding({ onDone }) {
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

  async function handleSendOtp() {
    setError("");
    setBusy(true);
    try {
      await signInWithOtp(email.trim());
      setOtpSent(true);
    } catch (e) {
      setError(e?.message ?? "Erreur lors de l’envoi du code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setError("");
    setBusy(true);
    try {
      await verifyOtp({ email: email.trim(), token: otp.trim() });

      // important : on crée le profil AVANT d’entrer dans l’app
      await upsertMyProfile({ displayName: pseudo.trim() });

      onDone?.();
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
            Connexion rapide (e-mail + pseudo). On t’envoie un code de validation.
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
            />
          </label>

          {!otpSent ? (
            <button
              className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
              onClick={handleSendOtp}
              disabled={!canSend || busy}
            >
              Recevoir mon code
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
                />
              </label>

              <button
                className="w-full rounded-xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
                onClick={handleVerify}
                disabled={otp.trim().length < 4 || busy}
              >
                Valider et entrer
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
          En MVP : pseudo unique globalement. Pas de changement de pseudo pour l’instant.
        </div>
      </div>
    </div>
  );
}
