export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h1 className="text-5xl font-bold">LNJP</h1>

        <p className="mt-3 text-slate-600">
          V0 — Home Page statique (React + Vite + Tailwind)
        </p>

        <div className="mt-6 grid gap-3">
          <button
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium opacity-60 cursor-not-allowed"
            disabled
          >
            Se connecter (bientôt)
          </button>

          <button
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium opacity-60 cursor-not-allowed"
            disabled
          >
            Rejoindre une ligue (bientôt)
          </button>
        </div>

        <p className="mt-5 text-xs text-slate-500">
          Objectif : valider la chaîne complète (local → GitHub → Vercel → PWA iPhone).
        </p>
      </div>
    </div>
  );
}

