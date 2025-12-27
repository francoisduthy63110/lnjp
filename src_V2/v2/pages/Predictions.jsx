import { useMemo, useState } from "react";
import { Button, Card, CardSection, Divider, Pill, Sub, Title } from "../../ui/Primitives";

function MatchRow({ match, disabled }) {
  return (
    <div className="rounded-[var(--r-xl)] bg-[var(--surface)] border border-white/10 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {match.home} – {match.away}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <Pill variant="outline">{match.kickoff}</Pill>
              {match.featured ? <Pill variant="primary">Match phare</Pill> : null}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-[var(--muted)]">Deadline</div>
            <div className="text-sm font-semibold">{match.deadline}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={disabled}
            className="h-11 rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 text-sm font-semibold text-white/80 disabled:opacity-50"
          >
            Score (SCT)
          </button>
          <button
            type="button"
            disabled={disabled}
            className="h-11 rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 text-sm font-semibold text-white/80 disabled:opacity-50"
          >
            DCT
          </button>
        </div>

        <div className="mt-3 text-xs text-[var(--muted)]">
          Ici on remplacera le “picker” actuel par une version plus simple et plus agréable.
        </div>
      </div>
    </div>
  );
}

export default function Predictions({ onGoLive }) {
  const [mode, setMode] = useState("to_predict");

  const matches = useMemo(
    () => [
      { id: 1, home: "PSG", away: "OM", kickoff: "Dim 21:00", deadline: "Dim 20:00", featured: true },
      { id: 2, home: "Lyon", away: "Nice", kickoff: "Sam 19:00", deadline: "Sam 18:00", featured: false },
      { id: 3, home: "Lille", away: "Rennes", kickoff: "Sam 21:00", deadline: "Sam 20:00", featured: false },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardSection>
          <div className="flex items-center justify-between">
            <Title>Pronostics</Title>
            <Pill variant="outline">Journée 19</Pill>
          </div>
          <Sub className="mt-2">
            Vue simplifiée : uniquement les infos utiles pour jouer. Les détails techniques actuels seront retirés.
          </Sub>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("to_predict")}
              className={
                "h-9 px-3 rounded-full text-xs font-semibold border transition " +
                (mode === "to_predict"
                  ? "bg-[var(--surface-2)] border-white/15 text-white"
                  : "bg-transparent border-white/10 text-white/70")
              }
            >
              À pronostiquer
            </button>
            <button
              type="button"
              onClick={() => setMode("done")}
              className={
                "h-9 px-3 rounded-full text-xs font-semibold border transition " +
                (mode === "done"
                  ? "bg-[var(--surface-2)] border-white/15 text-white"
                  : "bg-transparent border-white/10 text-white/70")
              }
            >
              Déjà pronostiquée
            </button>
            <button
              type="button"
              onClick={() => setMode("history")}
              className={
                "h-9 px-3 rounded-full text-xs font-semibold border transition " +
                (mode === "history"
                  ? "bg-[var(--surface-2)] border-white/15 text-white"
                  : "bg-transparent border-white/10 text-white/70")
              }
            >
              Historique
            </button>
          </div>
        </CardSection>
      </Card>

      {mode === "history" ? (
        <Card>
          <CardSection>
            <div className="flex items-center justify-between">
              <Title>Historique</Title>
              <Pill variant="outline">Recaps</Pill>
            </div>
            <div className="mt-3 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[var(--r-lg)] bg-[var(--surface-2)] border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Journée {18 - i}</div>
                    <div className="text-xs text-[var(--muted)]">+{8 - i} pts</div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Récap des pronos (à brancher sur les vraies données).</div>
                </div>
              ))}
            </div>
          </CardSection>
        </Card>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} disabled={mode !== "to_predict"} />
          ))}

          <div className="pt-1">
            <Divider />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={onGoLive}>Voir le Live</Button>
              <Button disabled>Valider mes pronos</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
